import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PersistenceModule } from '../src/persistence/persistence.module';
import { DatabaseService } from '../src/persistence/database.service';
import { RedisService } from '../src/persistence/redis.service';
import configuration from '../src/config/configuration';
import { toConversationId, toMessageId, toUserId } from '@campus-stranger/shared-types';

describe('Production PostgreSQL & Redis Persistence Suite', () => {
  let db: DatabaseService;
  let redis: RedisService;

  it('should initialize PostgreSQL database and Redis services cleanly', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        PersistenceModule,
      ],
    }).compile();

    db = moduleRef.get<DatabaseService>(DatabaseService);
    redis = moduleRef.get<RedisService>(RedisService);

    expect(db).toBeDefined();
    expect(redis).toBeDefined();
  });

  describe('PostgreSQL Persistence Operations', () => {
    it('should persist users and guest sessions', async () => {
      const user = await db.createUser('CyberStudent', 'guest');
      expect(user.id).toBeDefined();
      expect(user.displayName).toBe('CyberStudent');
      expect(user.accountType).toBe('guest');

      const found = await db.findUserById(user.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(user.id);

      const session = await db.createGuestSession(user.id, 48);
      expect(session.id).toBeDefined();
      expect(session.userId).toBe(user.id);
    });

    it('should persist conversations, members, and strictly encrypted message envelopes', async () => {
      const userA = await db.createUser('Alice', 'guest');
      const userB = await db.createUser('Bob', 'guest');

      const conv = await db.createConversation([userA.id, userB.id]);
      expect(conv.id).toBeDefined();
      expect(conv.status).toBe('active');

      const members = await db.getConversationMembers(conv.id);
      expect(members.length).toBe(2);

      expect(await db.isUserInConversation(conv.id, userA.id)).toBe(true);
      expect(await db.isUserInConversation(conv.id, userB.id)).toBe(true);
      expect(await db.isUserInConversation(conv.id, toUserId('unrelated_user'))).toBe(false);

      // Save encrypted message ciphertext envelope
      const now = new Date().toISOString();
      const envelope = {
        id: toMessageId('msg_enc_101'),
        conversationId: conv.id,
        senderId: userA.id,
        encryptedPayload: {
          ciphertext: 'VjJWclpYSWdaR1Z6YUdGc2FBPT0=', // Base64 ciphertext
          iv: 'TVRJeE1ESTM=',
          tag: 'YWJjZDEyMzQ=',
          protocolVersion: 1,
        },
        status: 'sent' as const,
        createdAt: now,
      };

      await db.saveMessageEnvelope(envelope);

      const messages = await db.getMessages(conv.id);
      expect(messages.length).toBe(1);
      expect(messages[0]!.encryptedPayload.ciphertext).toBe('VjJWclpYSWdaR1Z6YUdGc2FBPT0=');
      // ZERO PLAINTEXT VERIFICATION: Plaintext property must not exist
      expect((messages[0] as unknown as Record<string, unknown>).plaintext).toBeUndefined();

      // Update message read status
      await db.updateMessageStatus(conv.id, envelope.id, 'read');
      const updatedMessages = await db.getMessages(conv.id);
      expect(updatedMessages[0]!.status).toBe('read');
    });

    it('should persist saved stranger connections with aliases and mutual detection', async () => {
      const userA = await db.createUser('Alice', 'authenticated');
      const userB = await db.createUser('Bob', 'authenticated');
      const conv = await db.createConversation([userA.id, userB.id]);

      await db.saveStrangerConnection(userA.id, conv.id, 'My Physics Lab Partner');

      const savedA = await db.getSavedConnections(userA.id);
      expect(savedA.length).toBe(1);
      expect(savedA[0]!.alias).toBe('My Physics Lab Partner');

      await db.removeSavedConnection(userA.id, conv.id);
      const afterDelete = await db.getSavedConnections(userA.id);
      expect(afterDelete.length).toBe(0);
    });

    it('should persist user blocks and reports', async () => {
      const userA = await db.createUser('UserAlpha', 'guest');
      const userB = await db.createUser('UserBeta', 'guest');

      expect(await db.isBlocked(userA.id, userB.id)).toBe(false);

      await db.blockUser(userA.id, userB.id);

      expect(await db.isBlocked(userA.id, userB.id)).toBe(true);
      expect(await db.isBlocked(userB.id, userA.id)).toBe(true); // Bidirectional block check

      const report = await db.createReport({
        id: 'rep_123',
        reporterId: userA.id,
        reportedUserId: userB.id,
        conversationId: toConversationId('conv_test'),
        reason: 'harassment',
        details: 'Sent inappropriate messages',
        createdAt: new Date().toISOString(),
      });
      expect(report.id).toBe('rep_123');
    });
  });

  describe('Redis Distributed Coordination Operations', () => {
    it('should manage distributed user presence sockets', async () => {
      const user = await db.createUser('OnlineUser', 'guest');

      expect(await redis.isUserOnline(user.id)).toBe(false);

      await redis.registerSocket(user.id, 'socket_inst_1_abc');
      expect(await redis.isUserOnline(user.id)).toBe(true);
      expect((await redis.getUserSockets(user.id)).includes('socket_inst_1_abc')).toBe(true);

      await redis.registerSocket(user.id, 'socket_inst_2_def');
      expect((await redis.getUserSockets(user.id)).length).toBe(2);

      await redis.unregisterSocket(user.id, 'socket_inst_1_abc');
      expect(await redis.isUserOnline(user.id)).toBe(true);

      await redis.unregisterSocket(user.id, 'socket_inst_2_def');
      expect(await redis.isUserOnline(user.id)).toBe(false);
    });

    it('should track unique platform-wide active user count deduplicated across multi-device/multi-tab sockets', async () => {
      const userA = await db.createUser('UniqueUserA', 'guest');
      const userB = await db.createUser('UniqueUserB', 'authenticated');

      const initialCount = await redis.getActiveUserCount();

      // User A connects Tab 1
      await redis.registerSocket(userA.id, 'sock_a_tab1');
      expect(await redis.getActiveUserCount()).toBe(initialCount + 1);

      // User A connects Tab 2 (same user, count must not increment)
      await redis.registerSocket(userA.id, 'sock_a_tab2');
      expect(await redis.getActiveUserCount()).toBe(initialCount + 1);

      // User B connects Phone
      await redis.registerSocket(userB.id, 'sock_b_phone');
      expect(await redis.getActiveUserCount()).toBe(initialCount + 2);

      // User A closes Tab 1 (Tab 2 still open, count must not decrement)
      await redis.unregisterSocket(userA.id, 'sock_a_tab1');
      expect(await redis.getActiveUserCount()).toBe(initialCount + 2);

      // User A closes Tab 2 (User A offline, count decrements by 1)
      await redis.unregisterSocket(userA.id, 'sock_a_tab2');
      expect(await redis.getActiveUserCount()).toBe(initialCount + 1);

      // User B disconnects Phone (User B offline, count decrements by 1)
      await redis.unregisterSocket(userB.id, 'sock_b_phone');
      expect(await redis.getActiveUserCount()).toBe(initialCount);
    });

    it('should handle distributed matchmaking queue operations', async () => {
      const candidate1 = {
        userId: toUserId('usr_redis_1'),
        socketId: 'sock_1',
        displayName: 'Student1',
        joinedAt: Date.now(),
      };
      const candidate2 = {
        userId: toUserId('usr_redis_2'),
        socketId: 'sock_2',
        displayName: 'Student2',
        joinedAt: Date.now(),
      };

      await redis.enqueueMatchCandidate(candidate1);
      await redis.enqueueMatchCandidate(candidate2);

      expect(await redis.getMatchQueueSize()).toBe(2);

      const queue = await redis.getMatchQueue();
      expect(queue.length).toBe(2);
      expect(queue[0]!.userId).toBe('usr_redis_1');

      await redis.removeMatchCandidate(candidate1.userId);
      expect(await redis.getMatchQueueSize()).toBe(1);

      await redis.removeMatchCandidate(candidate2.userId);
      expect(await redis.getMatchQueueSize()).toBe(0);
    });

    it('should enforce rate limiting with time windows', async () => {
      const rateKey = `test_ratelimit_${Date.now()}`;

      const res1 = await redis.checkRateLimit(rateKey, 3, 10);
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(2);

      const res2 = await redis.checkRateLimit(rateKey, 3, 10);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(1);

      const res3 = await redis.checkRateLimit(rateKey, 3, 10);
      expect(res3.allowed).toBe(true);
      expect(res3.remaining).toBe(0);

      const res4 = await redis.checkRateLimit(rateKey, 3, 10);
      expect(res4.allowed).toBe(false);
    });
  });
});
