import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  IApiSuccessResponse,
  IBlock,
  IReport,
  IUser,
  ReportReason,
} from '@campus-stranger/shared-types';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class BlockUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  targetUserId!: string;
}

export class ReportUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  reportedUserId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  conversationId!: string;

  @IsString()
  @IsIn(['spam', 'harassment', 'inappropriate_content', 'bot_behavior', 'illegal_content', 'other'])
  reason!: ReportReason;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  details?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post('block')
  async blockUser(
    @Request() req: { user: IUser },
    @Body() dto: BlockUserDto,
  ): Promise<IApiSuccessResponse<IBlock>> {
    const data = await this.moderationService.blockUser(req.user.id, dto.targetUserId);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('blocks')
  async getBlocks(@Request() req: { user: IUser }): Promise<IApiSuccessResponse<string[]>> {
    const data = await this.moderationService.getBlocks(req.user.id);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('report')
  async reportUser(
    @Request() req: { user: IUser },
    @Body() dto: ReportUserDto,
  ): Promise<IApiSuccessResponse<IReport>> {
    const data = await this.moderationService.reportUser(
      req.user.id,
      dto.reportedUserId,
      dto.conversationId,
      dto.reason,
      dto.details,
    );
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
