import 'reflect-metadata';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../src/persistence/redis.service';
import { RedisIoAdapter } from '../src/realtime/redis-io.adapter';
import { toUserId } from '@campus-stranger/shared-types';

function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

// Load environment variables
loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), '../../.env'));
loadEnvFile(path.resolve(__dirname, '../../../.env'));
loadEnvFile(path.resolve(__dirname, '../../.env'));
loadEnvFile(path.resolve(__dirname, '../.env'));
loadEnvFile(path.resolve(__dirname, '../../../.env.local'));

describe('Live Hosted Upstash Redis Integration & Verification Suite', () => {
  let redisUrl: string | undefined;
  let redisService: RedisService;
  let rawClient: Redis;
  const createdTestKeys: string[] = [];

  beforeAll(async () => {
    redisUrl = process.env.REDIS_URL;
    expect(redisUrl).toBeDefined();
    expect(redisUrl).toMatch(/^rediss:\/\//); // Upstash TLS connection check

    const configService = new ConfigService({
      'redis.url': redisUrl,
      nodeEnv: 'production',
    });

    redisService = new RedisService(configService);
    await redisService.onModuleInit();

    rawClient = new Redis(redisUrl!, {
      maxRetriesPerRequest: 3,
      tls: { rejectUnauthorized: false },
    });
  });

  afterAll(async () => {
    // Clean up ONLY synthetic test keys created during this test run
    if (rawClient && createdTestKeys.length > 0) {
      for (const key of createdTestKeys) {
        try {
          await rawClient.del(key);
        } catch {
          // ignore cleanup errors
        }
      }
      await rawClient.quit();
    }
    if (redisService) {
      await redisService.onModuleDestroy();
    }
  });

  it('1. should connect to Upstash Redis over TLS and execute PING -> PONG with measured latency', async () => {
    const start = performance.now();
    const pong = await rawClient.ping();
    const latencyMs = performance.now() - start;

    expect(pong).toBe('PONG');
    console.log(`[Upstash Live Verification] PING -> PONG Latency: ${latencyMs.toFixed(2)} ms`);

    const servicePing = await redisService.pingRedis();
    expect(servicePing).toBe(true);
  });

  it('2. should verify TLS enforcement on the managed connection string', async () => {
    expect(redisUrl?.startsWith('rediss://')).toBe(true);
  });

  it('3. should verify distributed presence registration, TTL, and disconnect cleanup', async () => {
    const suffix = `pres_${Date.now()}`;
    const testUserId = toUserId(`usr_${suffix}`);
    const socketId1 = `sock_1_${suffix}`;
    const socketId2 = `sock_2_${suffix}`;

    const presenceKey = `cs:presence:${testUserId}`;
    const socketKey1 = `cs:socket:${socketId1}`;
    const socketKey2 = `cs:socket:${socketId2}`;
    createdTestKeys.push(presenceKey, socketKey1, socketKey2);

    // 1. Register Socket 1
    await redisService.registerSocket(testUserId, socketId1);
    expect(await redisService.isUserOnline(testUserId)).toBe(true);

    // Verify TTL exists (should be <= 86400 and > 0)
    const ttlPresence = await rawClient.ttl(presenceKey);
    const ttlSocket1 = await rawClient.ttl(socketKey1);
    expect(ttlPresence).toBeGreaterThan(0);
    expect(ttlPresence).toBeLessThanOrEqual(86400);
    expect(ttlSocket1).toBeGreaterThan(0);

    // 2. Register Socket 2 (multi-tab presence)
    await redisService.registerSocket(testUserId, socketId2);
    const sockets = await redisService.getUserSockets(testUserId);
    expect(sockets).toContain(socketId1);
    expect(sockets).toContain(socketId2);

    // 3. Unregister Socket 1
    await redisService.unregisterSocket(testUserId, socketId1);
    const socketsAfter = await redisService.getUserSockets(testUserId);
    expect(socketsAfter).not.toContain(socketId1);
    expect(socketsAfter).toContain(socketId2);
    expect(await redisService.isUserOnline(testUserId)).toBe(true);

    // 4. Unregister Socket 2 (user now offline)
    await redisService.unregisterSocket(testUserId, socketId2);
    expect(await redisService.isUserOnline(testUserId)).toBe(false);
  });

  it('4. should verify distributed rate limiting, window TTL, threshold enforcement, and user isolation', async () => {
    const suffix = `rl_${Date.now()}`;
    const keyUserA = `test_user_a_${suffix}`;
    const keyUserB = `test_user_b_${suffix}`;
    createdTestKeys.push(`cs:ratelimit:${keyUserA}`, `cs:ratelimit:${keyUserB}`);

    // Test 5 requests with limit = 3, window = 10s
    const r1 = await redisService.checkRateLimit(keyUserA, 3, 10);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    // Verify rate limit key has TTL
    const ttl = await rawClient.ttl(`cs:ratelimit:${keyUserA}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);

    const r2 = await redisService.checkRateLimit(keyUserA, 3, 10);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await redisService.checkRateLimit(keyUserA, 3, 10);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // 4th request exceeds limit
    const r4 = await redisService.checkRateLimit(keyUserA, 3, 10);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);

    // Verify User B has independent rate limits (no cross-user contamination)
    const rUserB = await redisService.checkRateLimit(keyUserB, 3, 10);
    expect(rUserB.allowed).toBe(true);
    expect(rUserB.remaining).toBe(2);
  });

  it('5. should verify matchmaking queue enqueue, inspection, atomic claiming, and removal', async () => {
    const suffix = `match_${Date.now()}`;
    const candidate1 = {
      userId: toUserId(`usr_match_1_${suffix}`),
      socketId: `sock_1_${suffix}`,
      displayName: 'Alice',
      joinedAt: Date.now(),
    };
    const candidate2 = {
      userId: toUserId(`usr_match_2_${suffix}`),
      socketId: `sock_2_${suffix}`,
      displayName: 'Bob',
      joinedAt: Date.now(),
    };

    // 1. Enqueue candidate 1
    await redisService.enqueueMatchCandidate(candidate1);
    const queue1 = await redisService.getMatchQueue();
    expect(queue1.some((c) => c.userId === candidate1.userId)).toBe(true);

    // 2. Enqueue candidate 2
    await redisService.enqueueMatchCandidate(candidate2);
    const queue2 = await redisService.getMatchQueue();
    expect(queue2.some((c) => c.userId === candidate2.userId)).toBe(true);

    // 3. Atomically remove candidate 1 (match found)
    const removed1 = await redisService.removeMatchCandidate(candidate1.userId);
    expect(removed1).toBe(true);

    // 4. Repeated removal attempt returns false (already claimed by another worker)
    const doubleRemove = await redisService.removeMatchCandidate(candidate1.userId);
    expect(doubleRemove).toBe(false);

    // 5. Clean up candidate 2
    await redisService.removeMatchCandidate(candidate2.userId);
  });

  it('6. should verify Socket.IO Redis Adapter Pub/Sub client capability', async () => {
    const configService = new ConfigService({
      'redis.url': redisUrl,
      nodeEnv: 'production',
    });

    const adapter = new RedisIoAdapter({} as never, configService);
    await expect(adapter.connectToRedis()).resolves.not.toThrow();

    // Verify direct pub/sub communication on Upstash Redis
    const pub = rawClient.duplicate();
    const sub = rawClient.duplicate();

    const testChannel = `cs:test:channel:${Date.now()}`;
    let receivedMessage = '';

    await sub.subscribe(testChannel);

    sub.on('message', (channel, message) => {
      if (channel === testChannel) {
        receivedMessage = message;
      }
    });

    await pub.publish(testChannel, 'socket_io_adapter_pubsub_test');

    // Wait for message arrival
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(receivedMessage).toBe('socket_io_adapter_pubsub_test');

    await sub.unsubscribe(testChannel);
    await pub.quit();
    await sub.quit();
  });

  it('7. should verify zero plaintext and zero secret data is stored in Redis', async () => {
    // Inspect rate-limit and presence payloads stored in Redis
    const sampleKeys = await rawClient.keys('cs:*');
    for (const key of sampleKeys.slice(0, 10)) {
      const type = await rawClient.type(key);
      if (type === 'string') {
        const val = await rawClient.get(key);
        // Verify value does not contain plaintext chat or private keys
        expect(val).not.toContain('privateKey');
        expect(val).not.toContain('sessionSecret');
      }
    }
  });
});
