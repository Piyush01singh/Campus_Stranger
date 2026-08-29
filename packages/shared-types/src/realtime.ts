import { ConversationId, MessageId, UserId } from './ids.js';
import { IEncryptedMessageEnvelope, IEncryptedPayload, MessageStatus } from './message.js';

export const WsClientEvents = {
  AUTHENTICATE: 'authenticate',
  MATCH_JOIN: 'match:join',
  MATCH_LEAVE: 'match:leave',
  CHAT_SEND: 'chat:send',
  CHAT_TYPING_START: 'chat:typing:start',
  CHAT_TYPING_STOP: 'chat:typing:stop',
  CHAT_READ: 'chat:read',
  CHAT_SAVE: 'chat:save',
  CHAT_NEXT: 'chat:next',
  CHAT_BLOCK: 'chat:block',
  CHAT_REPORT: 'chat:report',
  HEARTBEAT: 'heartbeat',
  SYNC: 'sync',
} as const;

export type WsClientEventType = (typeof WsClientEvents)[keyof typeof WsClientEvents];

export const WsServerEvents = {
  AUTHENTICATED: 'authenticated',
  MATCH_FOUND: 'match:found',
  CHAT_MESSAGE: 'chat:message',
  CHAT_TYPING: 'chat:typing',
  MESSAGE_SENT: 'message:sent',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  CHAT_ENDED: 'chat:ended',
  CHAT_ERROR: 'chat:error',
  SYNC_COMPLETED: 'sync:completed',
} as const;

export type WsServerEventType = (typeof WsServerEvents)[keyof typeof WsServerEvents];

// --- Client -> Server Payloads ---

export interface IWsAuthenticatePayload {
  token: string;
}

export interface IWsMatchJoinPayload {
  /** Optional preferences or filter criteria for future matchmaking */
  filters?: Record<string, unknown>;
}

export interface IWsChatSendPayload {
  clientMessageId: string;
  conversationId: ConversationId;
  encryptedPayload: IEncryptedPayload;
}

export interface IWsChatTypingPayload {
  conversationId: ConversationId;
}

export interface IWsChatReadPayload {
  conversationId: ConversationId;
  messageId: MessageId;
}

export interface IWsChatSavePayload {
  conversationId: ConversationId;
}

export interface IWsChatNextPayload {
  conversationId: ConversationId;
}

export interface IWsChatBlockPayload {
  conversationId: ConversationId;
  targetUserId: UserId;
}

export interface IWsChatReportPayload {
  conversationId: ConversationId;
  targetUserId: UserId;
  reason: string;
  details?: string;
}

export interface IWsHeartbeatPayload {
  clientTimestamp: number;
}

export interface IWsSyncPayload {
  conversationId: ConversationId;
  lastMessageId?: MessageId;
}

// --- Server -> Client Payloads ---

export interface IWsMatchFoundPayload {
  conversationId: ConversationId;
  partnerDisplayName: string;
  partnerKeyBundle?: {
    identityKey: string;
    ephemeralKey?: string;
  };
  matchedAt: string;
}

export interface IWsChatMessagePayload {
  envelope: IEncryptedMessageEnvelope;
}

export interface IWsChatTypingBroadcastPayload {
  conversationId: ConversationId;
  isTyping: boolean;
}

export interface IWsMessageSentAckPayload {
  clientMessageId: string;
  messageId: MessageId;
  conversationId: ConversationId;
  status: MessageStatus;
  createdAt: string;
}

export interface IWsMessageStatusUpdatePayload {
  messageId: MessageId;
  conversationId: ConversationId;
  status: MessageStatus;
  timestamp: string;
}

export interface IWsUserPresencePayload {
  conversationId: ConversationId;
  isOnline: boolean;
  timestamp: string;
}

export interface IWsChatEndedPayload {
  conversationId: ConversationId;
  reason: 'partner_left' | 'partner_blocked' | 'timeout' | 'system';
  endedAt: string;
}

export interface IWsChatErrorPayload {
  code: string;
  message: string;
  conversationId?: ConversationId;
}

export interface IWsSyncCompletedPayload {
  conversationId: ConversationId;
  messages: IEncryptedMessageEnvelope[];
  hasMore: boolean;
}
