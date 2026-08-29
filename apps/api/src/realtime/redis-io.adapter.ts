import { INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(
    app: INestApplicationContext,
    private readonly configService: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl = this.configService.get<string>('redis.url');
    const host = this.configService.get<string>('redis.host');

    if (redisUrl || (host && host !== 'localhost')) {
      try {
        const options = {
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          tls: redisUrl?.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
        };

        const pubClient = redisUrl
          ? new Redis(redisUrl, options)
          : new Redis({
              host,
              port: this.configService.get<number>('redis.port', 6379),
              password: this.configService.get<string>('redis.password'),
              ...options,
            });

        const subClient = pubClient.duplicate();

        await Promise.all([pubClient.connect(), subClient.connect()]);

        this.adapterConstructor = createAdapter(pubClient, subClient);
        this.logger.log('Socket.IO Redis Adapter connected for multi-node horizontal scaling.');
      } catch (err) {
        this.logger.warn(`Operating single-node Socket.IO adapter (Redis clustering unconfigured: ${err})`);
      }
    }
  }

  createIOServer(port: number, options?: any) {
    const corsOrigin = this.configService.get<string>('corsOrigin', 'http://localhost:3000');
    const origins = corsOrigin.includes(',')
      ? corsOrigin.split(',').map((o) => o.trim())
      : corsOrigin;

    const serverOptions = {
      ...options,
      cors: {
        origin: origins,
        credentials: true,
        methods: ['GET', 'POST'],
      },
    };

    const server = super.createIOServer(port, serverOptions);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
