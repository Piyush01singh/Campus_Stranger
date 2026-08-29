import { ConversationId, UserId } from './ids.js';

export type ReportReason =
  'spam' | 'harassment' | 'inappropriate_content' | 'bot_behavior' | 'illegal_content' | 'other';

export interface IReport {
  id: string;
  reporterId: UserId;
  reportedUserId: UserId;
  conversationId: ConversationId;
  reason: ReportReason;
  details?: string;
  createdAt: string;
}

export interface IBlock {
  userId: UserId;
  blockedUserId: UserId;
  createdAt: string;
}
