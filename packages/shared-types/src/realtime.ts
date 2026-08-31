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
  /** Mutual Save Request: User A initiates save request toward User B */
  SAVE_REQUEST: 'save:request',
  /** Mutual Save Respond: User B accepts or declines a pending save request */
  SAVE_RESPOND: 'save:respond',
  /** Request active users count */
  GET_ACTIVE_USERS: 'active_users:get',
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
  /** Delivered to User B: someone wants to save the chat */
  SAVE_REQUEST_RECEIVED: 'save:request:received',
  /** Delivered to both users when the save request is accepted */
  SAVE_ACCEPTED: 'save:accepted',
  /** Delivered to both users when the save request is declined */
  SAVE_DECLINED: 'save:declined',
  /** Delivered to both users when a pending save request is cancelled (e.g. chat ended) */
  SAVE_CANCELLED: 'save:cancelled',
  /** Delivered to both users when a saved connection is mutually deleted */
  SAVE_DELETED: 'save:deleted',
  /** Real-time platform-wide unique active users count update */
  ACTIVE_USERS_COUNT: 'active_users:count',
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
  partnerAccountType?: 'guest' | 'authenticated';
  isSaveAvailable?: boolean;
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
  partnerAccountType?: 'guest' | 'authenticated';
  isSaveAvailable?: boolean;
  /** Pending save request targeting the authenticated user, if any */
  pendingSaveRequest?: IWsSaveRequestReceivedPayload;
}

// --- Mutual Save Request Payloads ---

/** Client → Server: User A requests to save the conversation */
export interface IWsSaveRequestPayload {
  conversationId: ConversationId;
}

/** Client → Server: User B responds to a pending save request */
export interface IWsSaveRespondPayload {
  conversationId: ConversationId;
  response: 'accepted' | 'declined';
}

/** Server → User B: incoming save request notification */
export interface IWsSaveRequestReceivedPayload {
  requestId: string;
  conversationId: ConversationId;
  /** Display name of the user who sent the save request */
  requesterDisplayName: string;
  createdAt: string;
}

/** Server → both users: save request was accepted; both are now saved */
export interface IWsSaveAcceptedPayload {
  requestId: string;
  conversationId: ConversationId;
  /** True for the user who accepted, false for the requester */
  isSelfAccept: boolean;
}

/** Server → both users: save request was declined */
export interface IWsSaveDeclinedPayload {
  requestId: string;
  conversationId: ConversationId;
}

/** Server → both users: pending save request cancelled (e.g. conversation ended) */
export interface IWsSaveCancelledPayload {
  requestId: string;
  conversationId: ConversationId;
  reason: 'conversation_ended' | 'requester_left';
}

/** Server → both users: a mutual saved connection was deleted */
export interface IWsSaveDeletedPayload {
  conversationId: ConversationId;
  /** Display name of the user who initiated deletion */
  deletedByDisplayName: string;
}

/** Server → Client: Real-time platform-wide unique active users count */
export interface IWsActiveUsersCountPayload {
  count: number;
  timestamp: string;
}


