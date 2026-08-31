import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { MatchCandidate } from '../matchmaking/matchmaking.service';
import { UserId } from '@campus-stranger/shared-types';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private isConnected = false;

  // In-memory fallback for unit tests and local runs when Redis is unavailable
  private readonly memQueue: MatchCandidate[] = [];
  private readonly memPresence = new Map<string, Set<string>>(); // userId -> Set<socketId>
  private readonly memRateLimits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('redis.url');
    const host = this.configService.get<string>('redis.host');

    if (redisUrl || (host && host !== 'localhost')) {
      try {
        const options = {
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            if (times > 10) return null; // stop retrying after 10 attempts
            return Math.min(times * 100, 3000);
          },
          tls: redisUrl?.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
        };

        this.client = redisUrl ? new Redis(redisUrl, options) : new Redis({
          host,
          port: this.configService.get<number>('redis.port', 6379),
          password: this.configService.get<string>('redis.password'),
          ...options,
        });

        await this.client.connect();
        this.isConnected = true;
        this.logger.log('Managed Redis connected successfully.');
      } catch (err) {
        this.logger.error(`Failed to connect to Redis: ${err}`);
        if (this.configService.get<string>('nodeEnv') === 'production') {
          throw new Error(`Production Redis connection failed: ${err}`);
        }
        this.logger.warn('Operating with isolated in-memory realtime coordination for testing.');
        this.isConnected = false;
      }
    } else {
      this.logger.log('No REDIS_URL configured. Initializing in-memory realtime coordination.');
      this.isConnected = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
    if (this.pubClient) {
      await this.pubClient.quit();
    }
    if (this.subClient) {
      await this.subClient.quit();
    }
    this.logger.log('Redis connections closed.');
  }

  async pingRedis(): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return !this.client; // in memory fallback returns true for tests
    }
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  getPubClient(): Redis | null {
    if (!this.isConnected || !this.client) return null;
    if (!this.pubClient) {
      this.pubClient = this.client.duplicate();
    }
    return this.pubClient;
  }

  getSubClient(): Redis | null {
    if (!this.isConnected || !this.client) return null;
    if (!this.subClient) {
      this.subClient = this.client.duplicate();
    }
    return this.subClient;
  }

  // --- Distributed Presence ---

  async registerSocket(userId: UserId, socketId: string): Promise<void> {
    if (this.isConnected && this.client) {
      await this.client.sadd(`cs:presence:${userId}`, socketId);
      await this.client.expire(`cs:presence:${userId}`, 86400); // 24h
      await this.client.set(`cs:socket:${socketId}`, userId, 'EX', 86400);
      await this.client.sadd('cs:active_users', userId);
      await this.client.expire('cs:active_users', 86400);
      return;
    }
    let sockets = this.memPresence.get(userId);
    if (!sockets) {
      sockets = new Set();
      this.memPresence.set(userId, sockets);
    }
    sockets.add(socketId);
  }

  async unregisterSocket(userId: UserId, socketId: string): Promise<void> {
    if (this.isConnected && this.client) {
      await this.client.srem(`cs:presence:${userId}`, socketId);
      await this.client.del(`cs:socket:${socketId}`);
      const remainingSockets = await this.client.scard(`cs:presence:${userId}`);
      if (remainingSockets === 0) {
        await this.client.srem('cs:active_users', userId);
      }
      return;
    }
    const sockets = this.memPresence.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.memPresence.delete(userId);
      }
    }
  }

  async getUserSockets(userId: UserId): Promise<string[]> {
    if (this.isConnected && this.client) {
      return this.client.smembers(`cs:presence:${userId}`);
    }
    const sockets = this.memPresence.get(userId);
    return sockets ? Array.from(sockets) : [];
  }

  async isUserOnline(userId: UserId): Promise<boolean> {
    const sockets = await this.getUserSockets(userId);
    return sockets.length > 0;
  }

  /**
   * Returns the count of platform-wide unique active users.
   * Counts unique people/user entities rather than raw duplicate sockets or tabs.
   */
  async getActiveUserCount(): Promise<number> {
    if (this.isConnected && this.client) {
      const count = await this.client.scard('cs:active_users');
      return Math.max(count, 0);
    }
    return this.memPresence.size;
  }

  // --- Distributed Matchmaking Queue ---

  async enqueueMatchCandidate(candidate: MatchCandidate): Promise<void> {
    if (this.isConnected && this.client) {
      const payload = JSON.stringify(candidate);
      // Remove any existing entry for this user
      await this.removeMatchCandidate(candidate.userId);
      await this.client.rpush('cs:matchmaking:queue', payload);
      return;
    }
    this.removeMatchCandidate(candidate.userId);
    this.memQueue.push(candidate);
  }

  async getMatchQueue(): Promise<MatchCandidate[]> {
    if (this.isConnected && this.client) {
      const items = await this.client.lrange('cs:matchmaking:queue', 0, -1);
      return items.map((i) => JSON.parse(i) as MatchCandidate);
    }
    return [...this.memQueue];
  }

  async removeMatchCandidate(userId: UserId): Promise<boolean> {
    if (this.isConnected && this.client) {
      const items = await this.client.lrange('cs:matchmaking:queue', 0, -1);
      for (const item of items) {
        const parsed = JSON.parse(item) as MatchCandidate;
        if (parsed.userId === userId) {
          const removedCount = await this.client.lrem('cs:matchmaking:queue', 1, item);
          return removedCount > 0;
        }
      }
      return false;
    }
    const idx = this.memQueue.findIndex((c) => c.userId === userId);
    if (idx !== -1) {
      this.memQueue.splice(idx, 1);
      return true;
    }
    return false;
  }

  async getMatchQueueSize(): Promise<number> {
    if (this.isConnected && this.client) {
      return this.client.llen('cs:matchmaking:queue');
    }
    return this.memQueue.length;
  }

  // --- Rate Limiting ---

  async checkRateLimit(
    key: string,
    limit = 60,
    windowSeconds = 60,
  ): Promise<{ allowed: boolean; remaining: number }> {
    if (this.isConnected && this.client) {
      const current = await this.client.incr(`cs:ratelimit:${key}`);
      if (current === 1) {
        await this.client.expire(`cs:ratelimit:${key}`, windowSeconds);
      }
      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
      };
    }

    const now = Date.now();
    const entry = this.memRateLimits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.memRateLimits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { allowed: true, remaining: limit - 1 };
    }
    entry.count += 1;
    return {
      allowed: entry.count <= limit,
      remaining: Math.max(0, limit - entry.count),
    };
  }
}
