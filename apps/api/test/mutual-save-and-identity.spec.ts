import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PersistenceModule } from '../src/persistence/persistence.module';
import { DatabaseService } from '../src/persistence/database.service';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { ConversationsService } from '../src/conversations/conversations.service';
import {
  IEncryptedMessageEnvelope,
  toMessageId,
} from '@campus-stranger/shared-types';
import configuration from '../src/config/configuration';

describe('Mutual Save Chat, Single-Sided Deletion & Auth Security Tests', () => {
  let authService: AuthService;
  let authController: AuthController;
  let conversationsService: ConversationsService;
  let db: DatabaseService;

  it('should initialize services cleanly', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        PersistenceModule,
        JwtModule.register({ secret: 'test_jwt_secret_identity', signOptions: { expiresIn: '1d' } }),
      ],
      controllers: [AuthController],
      providers: [AuthService, ConversationsService],
    }).compile();

    authService = moduleRef.get<AuthService>(AuthService);
    authController = moduleRef.get<AuthController>(AuthController);
    conversationsService = moduleRef.get<ConversationsService>(ConversationsService);
    db = moduleRef.get<DatabaseService>(DatabaseService);

    expect(authService).toBeDefined();
    expect(authController).toBeDefined();
    expect(conversationsService).toBeDefined();
    expect(db).toBeDefined();
  });

  // ==========================================
  // 1. Identity & Account Types
  // ==========================================
  describe('Identity & Account Types (Anonymous vs Authenticated)', () => {
    it('should create anonymous guest users with accountType=guest', async () => {
      const guest = await authService.createGuest('AliceGuest');
      expect(guest.user.displayName).toBe('AliceGuest');
      expect(guest.user.accountType).toBe('guest');
      expect(guest.accessToken).toBeDefined();
    });

    it('should create authenticated users with accountType=authenticated via dev test login', async () => {
      const authUser = await authService.createTestAuthenticatedUser(
        'BobAuth',
        'bob@test.campus',
        'google_bob_123',
      );
      expect(authUser.user.displayName).toBe('BobAuth');
      expect(authUser.user.accountType).toBe('authenticated');
      expect(authUser.accessToken).toBeDefined();
    });
  });

  // ==========================================
  // 2. Mutual Save Consent Flow (Auth ↔ Auth)
  // ==========================================
  describe('Mutual Save Consent Flow (Auth ↔ Auth)', () => {
    it('should manage save request lifecycle: create -> pending -> accept -> mutual saved connection', async () => {
      const userA = (await authService.createTestAuthenticatedUser('RequesterA')).user;
      const userB = (await authService.createTestAuthenticatedUser('TargetB')).user;
      const conv = await db.createConversation([userA.id, userB.id]);

      // 1. User A initiates save request
      const saveReq = await db.createOrGetSaveRequest(conv.id, userA.id, userB.id);
      expect(saveReq.id).toBeDefined();
      expect(saveReq.status).toBe('pending');
      expect(saveReq.requesterUserId).toBe(userA.id);
      expect(saveReq.targetUserId).toBe(userB.id);

      // 2. Idempotency: second save request returns the same pending request
      const saveReqDuplicate = await db.createOrGetSaveRequest(conv.id, userA.id, userB.id);
      expect(saveReqDuplicate.id).toBe(saveReq.id);
      expect(saveReqDuplicate.status).toBe('pending');

      // 3. User B checks pending requests (e.g. on sync)
      const pendingForB = await db.getPendingSaveRequestForConversation(conv.id, userB.id);
      expect(pendingForB).not.toBeNull();
      expect(pendingForB!.id).toBe(saveReq.id);

      // User A has no pending request targeting them
      const pendingForA = await db.getPendingSaveRequestForConversation(conv.id, userA.id);
      expect(pendingForA).toBeNull();

      // 4. Unauthorized rejection: User A cannot accept their own request
      const unauthorizedAccept = await db.respondToSaveRequest(saveReq.id, userA.id, 'accepted');
      expect(unauthorizedAccept).toBeNull();

      // 5. User B accepts the request
      const accepted = await db.respondToSaveRequest(saveReq.id, userB.id, 'accepted');
      expect(accepted).not.toBeNull();
      expect(accepted!.status).toBe('accepted');

      // 6. Verify BOTH users now have saved connections
      const savedListA = await conversationsService.getSavedStrangers(userA.id);
      const savedListB = await conversationsService.getSavedStrangers(userB.id);

      expect(savedListA.length).toBe(1);
      expect(savedListA[0].conversationId).toBe(conv.id);
      expect(savedListA[0].partnerDisplayName).toBe('TargetB');
      expect(savedListA[0].isMutualSaved).toBe(true);

      expect(savedListB.length).toBe(1);
      expect(savedListB[0].conversationId).toBe(conv.id);
      expect(savedListB[0].partnerDisplayName).toBe('RequesterA');
      expect(savedListB[0].isMutualSaved).toBe(true);
    });

    it('should handle decline response properly without creating saved connections', async () => {
      const userA = (await authService.createTestAuthenticatedUser('AliceDeclined')).user;
      const userB = (await authService.createTestAuthenticatedUser('BobDeclined')).user;
      const conv = await db.createConversation([userA.id, userB.id]);

      const req = await db.createOrGetSaveRequest(conv.id, userA.id, userB.id);
      expect(req.status).toBe('pending');

      const declined = await db.respondToSaveRequest(req.id, userB.id, 'declined');
      expect(declined).not.toBeNull();
      expect(declined!.status).toBe('declined');

      // Neither user should have saved connections
      const savedA = await conversationsService.getSavedStrangers(userA.id);
      const savedB = await conversationsService.getSavedStrangers(userB.id);
      expect(savedA.length).toBe(0);
      expect(savedB.length).toBe(0);
    });

    it('should cancel pending save requests when conversation ends', async () => {
      const userA = (await authService.createTestAuthenticatedUser('AliceEnding')).user;
      const userB = (await authService.createTestAuthenticatedUser('BobEnding')).user;
      const conv = await db.createConversation([userA.id, userB.id]);

      await db.createOrGetSaveRequest(conv.id, userA.id, userB.id);

      const cancelled = await db.cancelPendingSaveRequests(conv.id);
      expect(cancelled.length).toBe(1);
      expect(cancelled[0].status).toBe('cancelled');

      // No pending requests should remain
      const pending = await db.getPendingSaveRequestForConversation(conv.id, userB.id);
      expect(pending).toBeNull();
    });
  });

  // ==========================================
  // 3. Single-Sided Saved Chat Deletion (PART 8)
  // ==========================================
  describe('Single-Sided Saved Chat Deletion (PART 8)', () => {
    it('should remove saved chat from User A without destroying User B copy or message history', async () => {
      const userA = (await authService.createTestAuthenticatedUser('AliceDelete1')).user;
      const userB = (await authService.createTestAuthenticatedUser('BobDelete1')).user;
      const conv = await db.createConversation([userA.id, userB.id]);

      // Save connection for both
      await db.saveStrangerConnection(userA.id, conv.id);
      await db.saveStrangerConnection(userB.id, conv.id);

      // Add sample encrypted message
      const msg1: IEncryptedMessageEnvelope = {
        id: toMessageId('msg_del_test_1'),
        conversationId: conv.id,
        senderId: userA.id,
        encryptedPayload: {
          ciphertext: 'AQIDBA==',
          iv: 'iv123',
          protocolVersion: 2,
        },
        status: 'sent',
        createdAt: new Date().toISOString(),
      };
      await db.saveMessageEnvelope(msg1);

      // Verify both have saved connection
      expect((await conversationsService.getSavedStrangers(userA.id)).length).toBe(1);
      expect((await conversationsService.getSavedStrangers(userB.id)).length).toBe(1);

      // User A deletes from their saved chats
      const deleteResult = await conversationsService.deleteSavedConnection(userA.id, conv.id);
      expect(deleteResult.deleted).toBe(true);

      // User A's saved chats is now empty
      expect((await conversationsService.getSavedStrangers(userA.id)).length).toBe(0);

      // User B's saved chats STILL REMAINS INTACT!
      const userBSaved = await conversationsService.getSavedStrangers(userB.id);
      expect(userBSaved.length).toBe(1);
      expect(userBSaved[0].conversationId).toBe(conv.id);

      // User B can still access the conversation messages!
      const userBMessages = await conversationsService.getConversationMessages(userB.id, conv.id);
      expect(userBMessages.length).toBe(1);
      expect(userBMessages[0].id).toBe(msg1.id);
    });
  });

  // ==========================================
  // 4. Test Login Safety (PART 24)
  // ==========================================
  describe('Test Login Security & Production Enforcement (PART 24)', () => {
    it('should allow test login in non-production environments', async () => {
      const mockRes = {
        cookie: () => {},
      } as any;

      const res = await authController.testLogin(
        { displayName: 'Local Tester', email: 'tester@campus.local' },
        mockRes,
      );
      expect(res.success).toBe(true);
      expect(res.data.user.accountType).toBe('authenticated');
      expect(res.data.user.displayName).toBe('Local Tester');
    });
  });
});
