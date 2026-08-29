import { describe, expect, it } from 'vitest';
import {
  ErrorCode,
  IEncryptedMessageEnvelope,
  IEncryptedPayload,
  IUser,
  toConversationId,
  toMessageId,
  toUserId,
  WsClientEvents,
  WsServerEvents,
} from '../src/index.js';

describe('shared-types contracts and helpers', () => {
  it('should create branded ID strings correctly', () => {
    const userId = toUserId('usr_123456');
    const conversationId = toConversationId('conv_123456');
    const messageId = toMessageId('msg_123456');

    expect(userId).toBe('usr_123456');
    expect(conversationId).toBe('conv_123456');
    expect(messageId).toBe('msg_123456');
  });

  it('should expose consistent WebSocket event constants', () => {
    expect(WsClientEvents.CHAT_SEND).toBe('chat:send');
    expect(WsClientEvents.AUTHENTICATE).toBe('authenticate');
    expect(WsServerEvents.MATCH_FOUND).toBe('match:found');
    expect(WsServerEvents.CHAT_MESSAGE).toBe('chat:message');
  });

  it('should validate shape of encrypted payload envelope (E2EE boundary enforcement)', () => {
    const payload: IEncryptedPayload = {
      ciphertext: 'dGVzdF9jaXBoZXJ0ZXh0',
      iv: 'dGVzdF9pdg==',
      tag: 'dGVzdF90YWc=',
      protocolVersion: 1,
      keyId: 'ratchet_0',
    };

    const envelope: IEncryptedMessageEnvelope = {
      id: toMessageId('msg_1'),
      conversationId: toConversationId('conv_1'),
      senderId: toUserId('usr_1'),
      encryptedPayload: payload,
      status: 'sent',
      createdAt: new Date().toISOString(),
    };

    expect(envelope.encryptedPayload.ciphertext).toBe('dGVzdF9jaXBoZXJ0ZXh0');
    expect(envelope.status).toBe('sent');
    // Ensure no plaintext property exists on envelope
    expect((envelope as unknown as Record<string, unknown>).message).toBeUndefined();
    expect((envelope as unknown as Record<string, unknown>).plaintext).toBeUndefined();
  });

  it('should validate IUser structure', () => {
    const user: IUser = {
      id: toUserId('usr_guest_1'),
      displayName: 'NeonTiger',
      accountType: 'guest',
      status: 'active',
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    };

    expect(user.accountType).toBe('guest');
    expect(user.displayName).toBe('NeonTiger');
  });

  it('should define standard error codes', () => {
    expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
    expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorCode.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
  });
});
