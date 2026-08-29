import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PersistenceModule } from '../src/persistence/persistence.module';
import { HealthController } from '../src/health/health.controller';
import configuration from '../src/config/configuration';

describe('HealthController', () => {
  it('should return ok health status with expected metadata and service health', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
        PersistenceModule,
      ],
      controllers: [HealthController],
    }).compile();

    const healthController = moduleRef.get<HealthController>(HealthController);
    const response = await healthController.getHealth();

    expect(response.success).toBe(true);
    expect(response.data.status).toBe('ok');
    expect(typeof response.data.uptime).toBe('number');
    expect(response.data.environment).toBeDefined();
    expect(response.data.services?.database).toBe('connected');
    expect(response.data.services?.redis).toBe('connected');
    expect(response.timestamp).toBeDefined();
  });

  it('should return ok status for lightweight liveness probe without external service pings', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
        PersistenceModule,
      ],
      controllers: [HealthController],
    }).compile();

    const healthController = moduleRef.get<HealthController>(HealthController);
    const response = healthController.getLiveness();

    expect(response.success).toBe(true);
    expect(response.data.status).toBe('ok');
    expect(typeof response.data.uptime).toBe('number');
    expect(response.timestamp).toBeDefined();
  });
});
