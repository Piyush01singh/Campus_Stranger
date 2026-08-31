import { Controller, Delete, Get, Param, Request, UseGuards } from '@nestjs/common';
import { ConversationsService, SavedStrangerView } from './conversations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatGateway } from '../realtime/chat.gateway';
import {
  IApiSuccessResponse,
  IEncryptedMessageEnvelope,
  IUser,
} from '@campus-stranger/shared-types';

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly chatGateway: ChatGateway,
  ) {}

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

  /**
   * Deletes a saved conversation from the authenticated user's saved list.
   */
  @Delete(':id/saved')
  async deleteSavedConversation(
    @Request() req: { user: IUser },
    @Param('id') conversationId: string,
  ): Promise<IApiSuccessResponse<{ deleted: boolean }>> {
    const result = await this.conversationsService.deleteSavedConnection(
      req.user.id,
      conversationId,
    );

    return {
      success: true,
      data: { deleted: result.deleted },
      timestamp: new Date().toISOString(),
    };
  }
}
