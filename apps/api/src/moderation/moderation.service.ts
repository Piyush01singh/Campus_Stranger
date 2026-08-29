import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../persistence/database.service';
import {
  IBlock,
  IReport,
  ReportReason,
  toConversationId,
  toUserId,
  UserId,
} from '@campus-stranger/shared-types';

@Injectable()
export class ModerationService {
  constructor(private readonly db: DatabaseService) {}

  async blockUser(userId: UserId, targetUserId: string): Promise<IBlock> {
    const target = toUserId(targetUserId);
    if (userId === target) {
      throw new BadRequestException('Cannot block yourself.');
    }

    const targetUser = await this.db.findUserById(target);
    if (!targetUser) {
      throw new NotFoundException('Target user not found.');
    }

    return this.db.blockUser(userId, target);
  }

  async getBlocks(userId: UserId): Promise<string[]> {
    return this.db.getBlocks(userId);
  }

  async reportUser(
    reporterId: UserId,
    reportedUserId: string,
    conversationId: string,
    reason: ReportReason,
    details?: string,
  ): Promise<IReport> {
    const target = toUserId(reportedUserId);
    if (reporterId === target) {
      throw new BadRequestException('Cannot report yourself.');
    }

    const convId = toConversationId(conversationId);
    const conv = await this.db.findConversationById(convId);
    if (!conv) {
      throw new NotFoundException('Conversation not found.');
    }

    const isMember = await this.db.isUserInConversation(convId, reporterId);
    if (!isMember) {
      throw new ForbiddenException('Cannot report a conversation you are not a member of.');
    }

    const members = await this.db.getConversationMembers(convId);
    const isReportedInConv = members.some((m) => m.userId === target);
    if (!isReportedInConv) {
      throw new BadRequestException('Reported user is not a participant in this conversation.');
    }

    const report: IReport = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      reporterId,
      reportedUserId: target,
      conversationId: convId,
      reason,
      details: details ? details.trim() : undefined,
      createdAt: new Date().toISOString(),
    };

    return this.db.createReport(report);
  }
}
