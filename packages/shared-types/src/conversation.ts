import { ConversationId, UserId } from './ids.js';

export type ConversationStatus = 'active' | 'ended' | 'abandoned';

export interface IConversation {
  id: ConversationId;
  status: ConversationStatus;
  createdAt: string;
  lastMessageAt?: string;
}

export interface IConversationMember {
  conversationId: ConversationId;
  userId: UserId;
  joinedAt: string;
  leftAt?: string;
  savedAt?: string;
}

export interface ISavedConnection {
  userId: UserId;
  conversationId: ConversationId;
  savedAt: string;
  alias?: string;
  targetUserId?: UserId;
}
