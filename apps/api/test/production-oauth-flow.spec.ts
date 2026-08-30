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
});
