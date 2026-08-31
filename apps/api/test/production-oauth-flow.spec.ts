import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseService } from '../src/persistence/database.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConversationsService } from '../src/conversations/conversations.service';

const API_BASE = 'https://campus-stranger.onrender.com';

describe('Production Google OAuth Flow & Account Linking Suite', () => {
  let db: DatabaseService;
  let authService: AuthService;
  let conversationsService: ConversationsService;
  let jwt: JwtService;

  beforeAll(async () => {
    const config = new ConfigService({
      nodeEnv: 'production',
      database: { url: process.env.DATABASE_URL },
      jwt: { secret: process.env.SESSION_SECRET || 'dev_session_secret_at_least_32_chars_long_placeholder' },
    });
    db = new DatabaseService(config);
    await db.onModuleInit();
    jwt = new JwtService({ secret: process.env.SESSION_SECRET || 'dev_session_secret_at_least_32_chars_long_placeholder' });
    authService = new AuthService(db, jwt, config);
    conversationsService = new ConversationsService(db);
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('1. should verify live production mock-link endpoint returns HTTP 403 Forbidden', async () => {
    const guestRes = await fetch(`${API_BASE}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'OAuthSecTest' }),
    });
    expect(guestRes.ok).toBe(true);
    const guestData = (await guestRes.json()).data;

    const mockRes = await fetch(`${API_BASE}/api/auth/google/mock-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guestData.accessToken}`,
      },
      body: JSON.stringify({ googleId: 'google_exploit_attempt' }),
    });
    expect(mockRes.status).toBe(403);
    const mockError = await mockRes.json();
    expect(mockError.error.message).toMatch(/strictly disabled in production/i);
  });

  it('2. should verify live GET /api/auth/google initiates OAuth 2.0 with state forwarding to Google', async () => {
    const guestRes = await fetch(`${API_BASE}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'OAuthStateTest' }),
    });
    const guestData = (await guestRes.json()).data;

    const googleAuthRes = await fetch(`${API_BASE}/api/auth/google?state=${encodeURIComponent(guestData.accessToken)}`, {
      redirect: 'manual',
    });
    expect(googleAuthRes.status).toBe(302);
    const redirectLocation = googleAuthRes.headers.get('location');
    expect(redirectLocation).toBeDefined();

    const parsedUrl = new URL(redirectLocation!);
    expect(parsedUrl.hostname).toBe('accounts.google.com');
    expect(parsedUrl.pathname).toBe('/o/oauth2/v2/auth');
    expect(parsedUrl.searchParams.get('client_id')).toBeTruthy();
    expect(parsedUrl.searchParams.get('redirect_uri')).toBe(`${API_BASE}/api/auth/google/callback`);
    expect(parsedUrl.searchParams.get('scope')).toBe('email profile');
    expect(parsedUrl.searchParams.get('state')).toBe(guestData.accessToken);
  });

  it('3. should link new Google account to active guest, preserving user ID, messages, and saved strangers', async () => {
    const guestUser = await db.createUser('GuestAlex', 'guest');
    const partnerUser = await db.createUser('StrangerSam', 'guest');
    const conv = await db.createConversation([guestUser.id, partnerUser.id]);

    await db.saveMessageEnvelope({
      id: `msg_test_${Date.now()}`,
      conversationId: conv.id,
      senderId: guestUser.id,
      encryptedPayload: {
        ciphertext: 'EncryptedMessageFromAlexBeforeLinking',
        iv: 'iv_alex',
        tag: 'tag_alex',
        ephemPublicKey: 'ephem_alex',
        protocolVersion: 1,
        keyId: 'step_1',
      },
      status: 'sent',
      createdAt: new Date().toISOString(),
    });

    const googleId = `google_new_${Date.now()}`;
    const linkedSession = await authService.linkGoogleAccount(guestUser.id, {
      id: googleId,
      email: 'alex.doe@university.edu',
      displayName: 'Alex Doe',
    });

    expect(linkedSession.user.id).toBe(guestUser.id);
    expect(linkedSession.user.accountType).toBe('authenticated');

    // Conversation membership intact
    const inConv = await db.isUserInConversation(conv.id, linkedSession.user.id);
    expect(inConv).toBe(true);

    // Save stranger
    const saved = await db.saveStrangerConnection(linkedSession.user.id, conv.id, 'Study Partner Sam');
    expect(saved.conversationId).toBe(conv.id);

    const savedList = await conversationsService.getSavedStrangers(linkedSession.user.id);
    expect(savedList).toHaveLength(1);
    expect(savedList[0].conversationId).toBe(conv.id);
  });

  it('4. should migrate active guest conversation when linking to existing Google account', async () => {
    const existingGoogleUser = await db.createUser('ExistingGoogleUser', 'authenticated');
    const googleId = `google_existing_${Date.now()}`;
    await db.linkAuthAccount(existingGoogleUser.id, 'google', googleId, 'existing.user@university.edu');

    const guestUser = await db.createUser('GuestTemporary', 'guest');
    const partnerUser = await db.createUser('StrangerTaylor', 'guest');
    const conv = await db.createConversation([guestUser.id, partnerUser.id]);

    const linkedSession = await authService.linkGoogleAccount(guestUser.id, {
      id: googleId,
      email: 'existing.user@university.edu',
    });

    expect(linkedSession.user.id).toBe(existingGoogleUser.id);
    const inConv = await db.isUserInConversation(conv.id, existingGoogleUser.id);
    expect(inConv).toBe(true);
  });

  it('5. should authenticate new standalone Google user without active guest session or chat', async () => {
    const googleId = `google_standalone_${Date.now()}`;
    const session = await authService.findOrCreateGoogleUser({
      id: googleId,
      email: 'standalone.student@university.edu',
      displayName: 'Standalone Student',
    });

    expect(session.user.id).toBeDefined();
    expect(session.user.displayName).toBe('Standalone Student');
    expect(session.user.accountType).toBe('authenticated');
    expect(session.accessToken).toBeDefined();

    // Verify token decodes correctly
    const decoded = jwt.verify(session.accessToken);
    expect(decoded.sub).toBe(session.user.id);
    expect(decoded.displayName).toBe('Standalone Student');
    expect(decoded.accountType).toBe('authenticated');
  });

  it('6. should retrieve existing standalone Google user on recurring login', async () => {
    const googleId = `google_recurring_${Date.now()}`;
    
    // First login: create account
    const session1 = await authService.findOrCreateGoogleUser({
      id: googleId,
      email: 'recurring.student@university.edu',
      displayName: 'Recurring Student',
    });

    // Second login: retrieve same account
    const session2 = await authService.findOrCreateGoogleUser({
      id: googleId,
      email: 'recurring.student@university.edu',
      displayName: 'Recurring Student',
    });

    expect(session2.user.id).toBe(session1.user.id);
    expect(session2.user.accountType).toBe('authenticated');
  });

  it('7. should correctly decode OAuth state with returnUrl and guest session token', () => {
    const guestPayload = { sub: 'usr_guest123', displayName: 'GuestTester', accountType: 'guest' };
    const token = jwt.sign(guestPayload);
    
    // Test base64 JSON state with returnUrl and conversationId
    const stateObj = { token, conversationId: 'conv_456', returnUrl: '/saved' };
    const stateStr = Buffer.from(JSON.stringify(stateObj)).toString('base64');

    const extracted = authService.extractStateData(stateStr);
    expect(extracted.userId).toBe('usr_guest123');
    expect(extracted.conversationId).toBe('conv_456');
    expect(extracted.returnUrl).toBe('/saved');
  });

  it('8. should validate authenticated user from JWT token payload', async () => {
    const user = await db.createUser('ValidatedStudent', 'authenticated');
    const token = jwt.sign({ sub: user.id, displayName: user.displayName, accountType: user.accountType });

    const decoded = jwt.verify(token) as { sub: string };
    const retrievedUser = await authService.validateTokenUser(decoded.sub);
    expect(retrievedUser.id).toBe(user.id);
    expect(retrievedUser.displayName).toBe('ValidatedStudent');
    expect(retrievedUser.accountType).toBe('authenticated');
  });
});
