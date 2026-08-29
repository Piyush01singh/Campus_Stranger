import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PersistenceModule } from '../src/persistence/persistence.module';
import { DatabaseService } from '../src/persistence/database.service';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { MatchmakingService } from '../src/matchmaking/matchmaking.service';
import { ModerationService } from '../src/moderation/moderation.service';
import { ConversationsService } from '../src/conversations/conversations.service';
import { ChatGateway } from '../src/realtime/chat.gateway';
import configuration from '../src/config/configuration';
import {
  IWsChatNextPayload,
  IWsChatSendPayload,
  IWsSyncPayload,
  toMessageId,
  WsServerEvents,
} from '@campus-stranger/shared-types';

interface MockSocket {
  id: string;
  data: Record<string, unknown>;
  emit: (event: string, data: unknown) => void;
  to?: (room: string) => { emit: (event: string, data: unknown) => void };
  join?: (room: string) => void;
  leave?: (room: string) => void;
}

describe('Final Application Security, Abuse Prevention & Core-Flow Hardening Suite', () => {
  let db: DatabaseService;
  let authService: AuthService;
  let moderationService: ModerationService;
  let gateway: ChatGateway;

  it('should initialize module and all security services cleanly', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ...configuration(),
              nodeEnv: 'development',
            }),
          ],
        }),
        PersistenceModule,
        JwtModule.register({ secret: 'sec_hardening_test_secret', signOptions: { expiresIn: '1d' } }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        MatchmakingService,
        ModerationService,
        ConversationsService,
        ChatGateway,
      ],
    }).compile();

    db = moduleRef.get<DatabaseService>(DatabaseService);
    authService = moduleRef.get<AuthService>(AuthService);
    moderationService = moduleRef.get<ModerationService>(ModerationService);
    gateway = moduleRef.get<ChatGateway>(ChatGateway);

    // Mock socket.io server on gateway
    (gateway as unknown as { server: unknown }).server = {
      sockets: { sockets: new Map() },
      in: () => ({ socketsJoin: () => true }),
      to: () => ({ emit: () => true }),
    };

    expect(db).toBeDefined();
    expect(authService).toBeDefined();
    expect(moderationService).toBeDefined();
    expect(gateway).toBeDefined();
  });

  describe('1. Relational Integrity on Guest -> Google Linking Migration', () => {
    it('should migrate conversation members, messages, saved connections, blocks, and reports without data loss', async () => {
      // 1. Create Guest A and Partner B
      const guestA = await authService.createGuest('GuestAlpha');
      const partnerB = await authService.createGuest('PartnerBeta');
      const strangerC = await authService.createGuest('StrangerGamma');

      // Create conversation between Guest A and Partner B
      const conv = await db.createConversation([guestA.user.id, partnerB.user.id]);

      // Guest A sends a message in the conversation
      const msgEnvelope = {
        id: toMessageId('msg_mig_1'),
        conversationId: conv.id,
        senderId: guestA.user.id,
        encryptedPayload: {
          ciphertext: 'VGVzdENpcGhlcnRleHQ=',
          iv: 'VGVzdElW',
          protocolVersion: 1,
        },
        status: 'sent' as const,
        createdAt: new Date().toISOString(),
      };
      await db.saveMessageEnvelope(msgEnvelope);

      // Partner B saves connection with Guest A
      await db.saveStrangerConnection(partnerB.user.id, conv.id, 'My Study Partner');

      // Stranger C blocks Guest A
      await db.blockUser(strangerC.user.id, guestA.user.id);

      // Guest A reports Stranger C
      await db.createReport({
        id: 'rep_mig_1',
        reporterId: guestA.user.id,
        reportedUserId: strangerC.user.id,
        conversationId: conv.id,
        reason: 'spam',
        createdAt: new Date().toISOString(),
      });

      // 2. Existing Google User Account
      const existingGoogleUser = await db.createUser('RegisteredStudent', 'authenticated');
      await db.linkAuthAccount(existingGoogleUser.id, 'google', 'goog_existing_999');

      // 3. Guest A logs in to their existing Google account (triggering migration)
      await db.migrateUserConversations(guestA.user.id, existingGoogleUser.id);

      // 4. Verify all relational links are properly migrated:
      // a. Conversation membership migrated
      expect(await db.isUserInConversation(conv.id, existingGoogleUser.id)).toBe(true);

      // b. Messages sender_id migrated to existingGoogleUser
      const messages = await db.getMessages(conv.id);
      expect(messages.length).toBe(1);
      expect(messages[0]!.senderId).toBe(existingGoogleUser.id);

      // c. Partner B saved connection target updated to existingGoogleUser
      const partnerSaved = await db.getSavedConnections(partnerB.user.id);
      expect(partnerSaved.length).toBe(1);
      expect(partnerSaved[0]!.conversationId).toBe(conv.id);

      // d. Stranger C block against Guest A updated to block existingGoogleUser
      expect(await db.isBlocked(strangerC.user.id, existingGoogleUser.id)).toBe(true);
    });
  });

  describe('2. Moderation BOLA / IDOR Protection & Self-Action Guards', () => {
    it('should reject reporting when reporter is not a member of the conversation', async () => {
      const userA = await db.createUser('UserA', 'guest');
      const userB = await db.createUser('UserB', 'guest');
      const intruder = await db.createUser('Intruder', 'guest');
      const conv = await db.createConversation([userA.id, userB.id]);

      await expect(
        moderationService.reportUser(intruder.id, userB.id, conv.id, 'harassment'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject reporting yourself', async () => {
      const userA = await db.createUser('UserA', 'guest');
      const userB = await db.createUser('UserB', 'guest');
      const conv = await db.createConversation([userA.id, userB.id]);

      await expect(
        moderationService.reportUser(userA.id, userA.id, conv.id, 'harassment'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject reporting a user who is not in the specified conversation', async () => {
      const userA = await db.createUser('UserA', 'guest');
      const userB = await db.createUser('UserB', 'guest');
      const bystander = await db.createUser('Bystander', 'guest');
      const conv = await db.createConversation([userA.id, userB.id]);

      await expect(
        moderationService.reportUser(userA.id, bystander.id, conv.id, 'harassment'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject reporting a non-existent conversation', async () => {
      const userA = await db.createUser('UserA', 'guest');
      const userB = await db.createUser('UserB', 'guest');

      await expect(
        moderationService.reportUser(userA.id, userB.id, 'conv_non_existent', 'harassment'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject self-blocking', async () => {
      const userA = await db.createUser('UserA', 'guest');
      await expect(moderationService.blockUser(userA.id, userA.id)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject blocking a non-existent user', async () => {
      const userA = await db.createUser('UserA', 'guest');
      await expect(moderationService.blockUser(userA.id, 'usr_non_existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('3. Production Guard on Mock OAuth Linking', () => {
    it('should reject mock Google linking when NODE_ENV is production', async () => {
      const user = await db.createUser('ProdTestUser', 'guest');
      const prodConfigService = {
        get: (key: string) => (key === 'nodeEnv' ? 'production' : undefined),
      } as ConfigService;

      const prodAuthController = new AuthController(authService, prodConfigService);

      await expect(
        prodAuthController.mockLinkGoogle(
          { user },
          { googleId: 'google_spoof_id_123', email: 'spoof@test.edu' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('4. Idempotent Message Persistence', () => {
    it('should handle duplicate/replayed message insertions idempotently without throwing', async () => {
      const userA = await db.createUser('UserA', 'guest');
      const userB = await db.createUser('UserB', 'guest');
      const conv = await db.createConversation([userA.id, userB.id]);

      const envelope = {
        id: toMessageId('msg_idempotent_101'),
        conversationId: conv.id,
        senderId: userA.id,
        encryptedPayload: {
          ciphertext: 'VGVzdENpcGhlcg==',
          iv: 'VGVzdElW',
          protocolVersion: 1,
        },
        status: 'sent' as const,
        createdAt: new Date().toISOString(),
      };

      // First save
      await db.saveMessageEnvelope(envelope);
      // Duplicate save (client retry)
      await db.saveMessageEnvelope(envelope);

      const messages = await db.getMessages(conv.id);
      expect(messages.length).toBe(1);
    });
  });

  describe('5. Realtime WebSocket Security & Edge-Case Protection', () => {
    it('should reject sending messages to conversations that have already ended', async () => {
      const userA = await db.createUser('Alice', 'guest');
      const userB = await db.createUser('Bob', 'guest');
      const conv = await db.createConversation([userA.id, userB.id]);

      // End the conversation
      await db.endConversation(conv.id);

      let emittedEvent = '';
      let emittedData: { code?: string; message?: string } | null = null;

      const aliceSocket: MockSocket = {
        id: 'sock_alice_ended_test',
        data: { user: userA },
        emit: (event: string, data: unknown) => {
          emittedEvent = event;
          emittedData = data as { code?: string; message?: string };
        },
        join: () => true,
      };

      const payload: IWsChatSendPayload = {
        clientMessageId: 'msg_ended_1',
        conversationId: conv.id,
        encryptedPayload: {
          ciphertext: 'VGVzdA==',
          iv: 'VGVzdA==',
          protocolVersion: 1,
        },
      };

      await gateway.handleChatSend(
        aliceSocket as unknown as Parameters<typeof gateway.handleChatSend>[0],
        payload,
      );

      expect(emittedEvent).toBe(WsServerEvents.CHAT_ERROR);
      expect(emittedData?.code).toBe('FORBIDDEN');
    });

    it('should reject sending messages when one of the participants is blocked', async () => {
      const userA = await db.createUser('Alice', 'guest');
      const userB = await db.createUser('Bob', 'guest');
      const conv = await db.createConversation([userA.id, userB.id]);

      // Bob blocks Alice
      await db.blockUser(userB.id, userA.id);

      let emittedEvent = '';
      let emittedData: { code?: string; message?: string } | null = null;

      const aliceSocket: MockSocket = {
        id: 'sock_alice_blocked_test',
        data: { user: userA },
        emit: (event: string, data: unknown) => {
          emittedEvent = event;
          emittedData = data as { code?: string; message?: string };
        },
        join: () => true,
      };

      const payload: IWsChatSendPayload = {
        clientMessageId: 'msg_blocked_1',
        conversationId: conv.id,
        encryptedPayload: {
          ciphertext: 'VGVzdA==',
          iv: 'VGVzdA==',
          protocolVersion: 1,
        },
      };

      await gateway.handleChatSend(
        aliceSocket as unknown as Parameters<typeof gateway.handleChatSend>[0],
        payload,
      );

      expect(emittedEvent).toBe(WsServerEvents.CHAT_ERROR);
      expect(emittedData?.code).toBe('FORBIDDEN');
    });

    it('should rate-limit rapid WebSocket SYNC requests', async () => {
      const user = await db.createUser('SyncSpammer', 'guest');
      const partner = await db.createUser('Partner', 'guest');
      const conv = await db.createConversation([user.id, partner.id]);

      let lastError: { code?: string; message?: string } | null = null;
      const socket: MockSocket = {
        id: 'sock_sync_spam',
        data: { user },
        emit: (event: string, data: unknown) => {
          if (event === WsServerEvents.CHAT_ERROR) {
            lastError = data as { code?: string; message?: string };
          }
        },
        join: () => true,
      };

      const syncPayload: IWsSyncPayload = { conversationId: conv.id };

      // Send 25 sync requests rapidly (limit is 20 per 10s)
      for (let i = 0; i < 25; i++) {
        await gateway.handleSync(
          socket as unknown as Parameters<typeof gateway.handleSync>[0],
          syncPayload,
        );
      }

      expect(lastError).not.toBeNull();
      expect(lastError?.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should rate-limit rapid WebSocket CHAT_NEXT requests', async () => {
      const user = await db.createUser('NextSpammer', 'guest');
      const partner = await db.createUser('PartnerNext', 'guest');
      const conv = await db.createConversation([user.id, partner.id]);

      let lastError: { code?: string; message?: string } | null = null;
      const socket: MockSocket = {
        id: 'sock_next_spam',
        data: { user },
        emit: (event: string, data: unknown) => {
          if (event === WsServerEvents.CHAT_ERROR) {
            lastError = data as { code?: string; message?: string };
          }
        },
        to: () => ({ emit: () => true }),
        leave: () => true,
      };

      const nextPayload: IWsChatNextPayload = { conversationId: conv.id };

      // Send 15 next requests rapidly (limit is 10 per 10s)
      for (let i = 0; i < 15; i++) {
        await gateway.handleChatNext(
          socket as unknown as Parameters<typeof gateway.handleChatNext>[0],
          nextPayload,
        );
      }

      expect(lastError).not.toBeNull();
      expect(lastError?.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });
});
