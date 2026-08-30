import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PersistenceModule } from '../src/persistence/persistence.module';
import { DatabaseService } from '../src/persistence/database.service';
import { AuthService } from '../src/auth/auth.service';
import { ConversationsService } from '../src/conversations/conversations.service';
import {
  IEncryptedMessageEnvelope,
  toConversationId,
  toMessageId,
} from '@campus-stranger/shared-types';
import configuration from '../src/config/configuration';

describe('Mutual Save Consent, Bilateral Deletion & Identity Lifecycle Regression Tests', () => {
  let authService: AuthService;
  let conversationsService: ConversationsService;
  let db: DatabaseService;

  it('should initialize services cleanly', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        PersistenceModule,
        JwtModule.register({ secret: 'test_jwt_secret_identity', signOptions: { expiresIn: '1d' } }),
      ],
      providers: [AuthService, ConversationsService],
    }).compile();

    authService = moduleRef.get<AuthService>(AuthService);
    conversationsService = moduleRef.get<ConversationsService>(ConversationsService);
    db = moduleRef.get<DatabaseService>(DatabaseService);

    expect(authService).toBeDefined();
    expect(conversationsService).toBeDefined();
    expect(db).toBeDefined();
  });

  // ==========================================
  // 1. Guest Nickname & Session Lifecycle (Issue 1)
  // ==========================================
  describe('Guest Nickname & Session Lifecycle (Issue 1)', () => {
    it('should create independent guest identities with distinct user IDs when picking different nicknames', async () => {
      const guestA = await authService.createGuest('Alice');
      const guestB = await authService.createGuest('Bob');

      expect(guestA.user.id).not.toBe(guestB.user.id);
      expect(guestA.user.displayName).toBe('Alice');
      expect(guestB.user.displayName).toBe('Bob');
      expect(guestA.user.accountType).toBe('guest');
      expect(guestB.user.accountType).toBe('guest');

      // Validating tokens
      const validatedA = await authService.validateTokenUser(guestA.user.id);
      expect(validatedA.displayName).toBe('Alice');
      const validatedB = await authService.validateTokenUser(guestB.user.id);
      expect(validatedB.displayName).toBe('Bob');
    });

    it('should generate fallback random nickname when none provided', async () => {
      const guest = await authService.createGuest();
      expect(guest.user.displayName).toMatch(/^Stranger_\d{4}$/);
    });
  });

  // ==========================================
  // 2. Two-Sided Mutual Save Consent Flow (Issue 2)
  // ==========================================
  describe('Two-Sided Mutual Save Consent Flow (Issue 2)', () => {
    it('should manage save request lifecycle: create -> pending -> accept -> mutual saved connection', async () => {
      const userA = (await authService.createGuest('RequesterA')).user;
      const userB = (await authService.createGuest('TargetB')).user;
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
      const userA = (await authService.createGuest('AliceDeclined')).user;
      const userB = (await authService.createGuest('BobDeclined')).user;
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
      const userA = (await authService.createGuest('AliceEnding')).user;
      const userB = (await authService.createGuest('BobEnding')).user;
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
  // 3. Bilateral Mutual Deletion of Saved Chat (Issue 2/3 Feature)
  // ==========================================
  describe('Bilateral Mutual Deletion of Saved Chat', () => {
    it('should delete saved connections and ciphertext messages for both participants', async () => {
      const userA = (await authService.createGuest('AliceDelete')).user;
      const userB = (await authService.createGuest('BobDelete')).user;
      const conv = await db.createConversation([userA.id, userB.id]);

      // Save connection for both
      await db.saveStrangerConnection(userA.id, conv.id);
      await db.saveStrangerConnection(userB.id, conv.id);

      // Add sample encrypted messages
      const msg1: IEncryptedMessageEnvelope = {
        id: toMessageId('msg_del_1'),
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

      // Verify saved lists and messages exist before deletion
      expect((await conversationsService.getSavedStrangers(userA.id)).length).toBe(1);
      expect((await conversationsService.getSavedStrangers(userB.id)).length).toBe(1);
      expect((await conversationsService.getConversationMessages(userA.id, conv.id)).length).toBe(1);

      // User A initiates bilateral deletion
      const deleteResult = await conversationsService.deleteMutualSavedConnection(userA.id, conv.id);
      expect(deleteResult.deleted).toBe(true);
      expect(deleteResult.otherUserId).toBe(userB.id);

      // Verify NEITHER user has saved connections now
      expect((await conversationsService.getSavedStrangers(userA.id)).length).toBe(0);
      expect((await conversationsService.getSavedStrangers(userB.id)).length).toBe(0);

      // Verify conversation message access is rejected (conversation deleted)
      await expect(
        conversationsService.getConversationMessages(userA.id, conv.id),
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 4. OAuth State with Conversation Restoration (Issue 4)
  // ==========================================
  describe('OAuth State with Conversation Restoration (Issue 4)', () => {
    it('should decode OAuth state with embedded conversationId and guest JWT token', async () => {
      const guest = await authService.createGuest('OAuthStateGuest');
      const convId = toConversationId('conv_restore_999');

      // State encoded by frontend
      const stateObj = { token: guest.accessToken, conversationId: convId };
      const encodedState = Buffer.from(JSON.stringify(stateObj)).toString('base64url');

      const extracted = authService.extractStateData(encodedState);
      expect(extracted.userId).toBe(guest.user.id);
      expect(extracted.conversationId).toBe(convId);
    });

    it('should handle raw JWT state without conversationId backwards-compatibly', async () => {
      const guest = await authService.createGuest('RawJwtGuest');
      const extracted = authService.extractStateData(guest.accessToken);
      expect(extracted.userId).toBe(guest.user.id);
      expect(extracted.conversationId).toBeUndefined();
    });
  });
});
