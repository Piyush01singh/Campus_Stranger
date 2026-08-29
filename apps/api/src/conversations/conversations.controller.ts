import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ConversationsService, SavedStrangerView } from './conversations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  IApiSuccessResponse,
  IEncryptedMessageEnvelope,
  ISavedConnection,
  IUser,
} from '@campus-stranger/shared-types';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveConversationDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  alias?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get('saved')
  async getSavedStrangers(
    @Request() req: { user: IUser },
  ): Promise<IApiSuccessResponse<SavedStrangerView[]>> {
    const data = await this.conversationsService.getSavedStrangers(req.user.id);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post(':id/save')
  async saveConversation(
    @Request() req: { user: IUser },
    @Param('id') conversationId: string,
    @Body() dto: SaveConversationDto,
  ): Promise<IApiSuccessResponse<ISavedConnection>> {
    const data = await this.conversationsService.saveConversation(
      req.user.id,
      conversationId,
      dto.alias,
    );
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id/messages')
  async getConversationMessages(
    @Request() req: { user: IUser },
    @Param('id') conversationId: string,
  ): Promise<IApiSuccessResponse<IEncryptedMessageEnvelope[]>> {
    const data = await this.conversationsService.getConversationMessages(
      req.user.id,
      conversationId,
    );
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(':id/saved')
  async removeSavedStranger(
    @Request() req: { user: IUser },
    @Param('id') conversationId: string,
  ): Promise<IApiSuccessResponse<{ removed: boolean }>> {
    const removed = await this.conversationsService.removeSavedConnection(
      req.user.id,
      conversationId,
    );
    return {
      success: true,
      data: { removed },
      timestamp: new Date().toISOString(),
    };
  }
}
