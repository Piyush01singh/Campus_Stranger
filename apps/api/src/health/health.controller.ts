import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../persistence/database.service';
import { RedisService } from '../persistence/redis.service';
import { IApiSuccessResponse, IHealthCheckResponse } from '@campus-stranger/shared-types';

@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async getHealth(): Promise<IApiSuccessResponse<IHealthCheckResponse>> {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const nodeEnv = this.configService.get<string>('nodeEnv', 'development');

    const [dbHealthy, redisHealthy] = await Promise.all([
      this.db.pingDatabase(),
      this.redis.pingRedis(),
    ]);

    const isOk = dbHealthy && redisHealthy;

    return {
      success: true,
      data: {
        status: isOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: uptimeSeconds,
        environment: nodeEnv,
        version: '0.1.0',
        services: {
          database: dbHealthy ? 'connected' : 'disconnected',
          redis: redisHealthy ? 'connected' : 'disconnected',
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  getLiveness(): IApiSuccessResponse<{ status: 'ok'; uptime: number }> {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    return {
      success: true,
      data: {
        status: 'ok',
        uptime: uptimeSeconds,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
