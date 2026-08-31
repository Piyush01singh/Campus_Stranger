import { Controller, Get } from '@nestjs/common';
import { RedisService } from '../persistence/redis.service';
import { IApiSuccessResponse } from '@campus-stranger/shared-types';

@Controller('presence')
export class PresenceController {
  constructor(private readonly redis: RedisService) {}

  @Get('active-users')
  async getActiveUserCount(): Promise<IApiSuccessResponse<{ count: number }>> {
    const count = await this.redis.getActiveUserCount();
    return {
      success: true,
      data: { count },
      timestamp: new Date().toISOString(),
    };
  }
}
