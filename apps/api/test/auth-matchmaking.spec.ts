import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PersistenceModule } from '../src/persistence/persistence.module';
import { DatabaseService } from '../src/persistence/database.service';
import { AuthService } from '../src/auth/auth.service';
import { MatchmakingService } from '../src/matchmaking/matchmaking.service';
import { ConversationsService } from '../src/conversations/conversations.service';
import configuration from '../src/config/configuration';

describe('Auth & Matchmaking & Saved Strangers Flow', () => {
  let authService: AuthService;
  let matchmakingService: MatchmakingService;
  let conversationsService: ConversationsService;
  let db: DatabaseService;

  it('should initialize services cleanly', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        PersistenceModule,
        JwtModule.register({ secret: 'test_jwt_secret', signOptions: { expiresIn: '1d' } }),
      ],
      providers: [AuthService, MatchmakingService, ConversationsService],
    }).compile();

    authService = moduleRef.get<AuthService>(AuthService);
    matchmakingService = moduleRef.get<MatchmakingService>(MatchmakingService);
    conversationsService = moduleRef.get<ConversationsService>(ConversationsService);
    db = moduleRef.get<DatabaseService>(DatabaseService);

    expect(authService).toBeDefined();
    expect(matchmakingService).toBeDefined();
    expect(conversationsService).toBeDefined();
  });

  it('should create guest users with arbitrary nicknames and valid JWT tokens', async () => {
    const guestA = await authService.createGuest('CyberPhoenix');
    const guestB = await authService.createGuest('NeonViper');

    expect(guestA.user.displayName).toBe('CyberPhoenix');
    expect(guestA.user.accountType).toBe('guest');
    expect(guestA.accessToken).toBeDefined();

    expect(guestB.user.displayName).toBe('NeonViper');
    expect(guestB.user.accountType).toBe('guest');
    expect(guestB.accessToken).toBeDefined();
  });

  it('should pair two waiting guests into an active conversation through matchmaking', async () => {
    const guestA = await authService.createGuest('Alice');
    const guestB = await authService.createGuest('Bob');

    // Alice joins queue
    const match1 = await matchmakingService.joinQueue({
      userId: guestA.user.id,
      socketId: 'socket_alice_1',
      displayName: guestA.user.displayName,
      joinedAt: Date.now(),
    });
    expect(match1).toBeNull();
    expect(await matchmakingService.getQueueSize()).toBe(1);

    // Bob joins queue -> Match triggered!
    const match2 = await matchmakingService.joinQueue({
      userId: guestB.user.id,
      socketId: 'socket_bob_1',
      displayName: guestB.user.displayName,
      joinedAt: Date.now(),
    });

    expect(match2).not.toBeNull();
    expect(match2!.conversation.id).toBeDefined();
    expect(await matchmakingService.getQueueSize()).toBe(0);

    const isAliceInConv = await db.isUserInConversation(match2!.conversation.id, guestA.user.id);
    const isBobInConv = await db.isUserInConversation(match2!.conversation.id, guestB.user.id);
    expect(isAliceInConv).toBe(true);
    expect(isBobInConv).toBe(true);
  });

  it('should link Google OAuth to existing guest user, upgrading account while strictly preserving user ID and conversations', async () => {
    const guest = await authService.createGuest('GuestExplorer');
    const originalUserId = guest.user.id;

    // Guest enters a conversation with a partner
    const partner = await authService.createGuest('PartnerStranger');
    const conv = await db.createConversation([originalUserId, partner.user.id]);

    // Guest links Google account
    const upgraded = await authService.linkGoogleAccount(originalUserId, {
      id: 'google_oauth_id_998877',
      email: 'student@university.edu',
      displayName: 'Alex Doe',
    });

    expect(upgraded.user.id).toBe(originalUserId); // Preserves exact same internal user_id
    expect(upgraded.user.accountType).toBe('authenticated'); // Upgraded from guest

    // Active conversation is still intact
    const stillMember = await db.isUserInConversation(conv.id, originalUserId);
    expect(stillMember).toBe(true);

    // Save conversation
    const saved = await db.saveStrangerConnection(
      originalUserId,
      conv.id,
      'Campus Study Friend',
    );
    expect(saved.conversationId).toBe(conv.id);

    // Fetch saved strangers list
    const savedList = await conversationsService.getSavedStrangers(originalUserId);
    expect(savedList).toBeDefined();
    expect(savedList.length).toBeGreaterThan(0);
    // PRIVACY AUDIT: Verify internal partner UserId is NOT leaked
    expect((savedList[0] as unknown as Record<string, unknown>).partnerUserId).toBeUndefined();
  });

  it('should migrate active guest conversations when linking an existing Google account without data loss', async () => {
    // 1. Existing authenticated user
    const existingUser = await db.createUser('ExistingRegisteredUser', 'authenticated');
    await db.linkAuthAccount(existingUser.id, 'google', 'google_existing_123', 'existing@campus.edu');

    // 2. New anonymous guest starts a chat
    const guestUser = await authService.createGuest('TemporaryGuest');
    const partner = await authService.createGuest('PartnerStranger');
    const activeConv = await db.createConversation([guestUser.user.id, partner.user.id]);

    // Verify guest is in conversation before linking
    expect(await db.isUserInConversation(activeConv.id, guestUser.user.id)).toBe(true);
    expect(await db.isUserInConversation(activeConv.id, existingUser.id)).toBe(false);

    // 3. Guest clicks Save Stranger and logs into their existing Google account
    const result = await authService.linkGoogleAccount(guestUser.user.id, {
      id: 'google_existing_123',
      email: 'existing@campus.edu',
    });

    expect(result.user.id).toBe(existingUser.id);

    // 4. CRITICAL VERIFICATION: Existing user is now a member of the guest's conversation!
    expect(await db.isUserInConversation(activeConv.id, existingUser.id)).toBe(true);
  });

  it('should exclude blocked users from matchmaking pairing', async () => {
    const userA = await authService.createGuest('UserA');
    const userB = await authService.createGuest('UserB');
    const userC = await authService.createGuest('UserC');

    // User A blocks User B
    await db.blockUser(userA.user.id, userB.user.id);

    // User B joins queue
    await matchmakingService.joinQueue({
      userId: userB.user.id,
      socketId: 'sock_b',
      displayName: userB.user.displayName,
      joinedAt: Date.now(),
    });

    // User A joins queue -> should NOT match with User B
    const matchA = await matchmakingService.joinQueue({
      userId: userA.user.id,
      socketId: 'sock_a',
      displayName: userA.user.displayName,
      joinedAt: Date.now(),
    });
    expect(matchA).toBeNull(); // Both waiting, excluded due to block

    // User C joins queue -> pairs with User B (or User A)
    const matchC = await matchmakingService.joinQueue({
      userId: userC.user.id,
      socketId: 'sock_c',
      displayName: userC.user.displayName,
      joinedAt: Date.now(),
    });
    expect(matchC).not.toBeNull();
  });

  it('should find or create Google OAuth user and handle OAuth state tokens safely', async () => {
    // 1. First-time Google user authentication
    const newGoogleAuth = await authService.findOrCreateGoogleUser({
      id: 'google_first_time_999',
      email: 'newuser@university.edu',
      displayName: 'FirstTime User',
    });

    expect(newGoogleAuth.user.id).toBeDefined();
    expect(newGoogleAuth.user.accountType).toBe('authenticated');
    expect(newGoogleAuth.accessToken).toBeDefined();

    // 2. Returning Google user logs in again
    const returningGoogleAuth = await authService.findOrCreateGoogleUser({
      id: 'google_first_time_999',
      email: 'newuser@university.edu',
    });

    expect(returningGoogleAuth.user.id).toBe(newGoogleAuth.user.id);

    // 3. Validate state token extraction
    const guest = await authService.createGuest('StateGuest');
    const validUserId = authService.extractUserIdFromState(guest.accessToken);
    expect(validUserId).toBe(guest.user.id);

    const invalidUserId = authService.extractUserIdFromState('tampered_or_invalid_jwt_state');
    expect(invalidUserId).toBeNull();
  });
});
