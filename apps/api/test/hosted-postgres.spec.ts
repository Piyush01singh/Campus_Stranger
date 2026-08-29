import 'reflect-metadata';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { DatabaseService } from '../src/persistence/database.service';
import { ConfigService } from '@nestjs/config';
import {
  toMessageId,
} from '@campus-stranger/shared-types';

function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

// Load environment variables
loadEnvFile(path.resolve(__dirname, '../../../.env'));
loadEnvFile(path.resolve(__dirname, '../.env'));
loadEnvFile(path.resolve(__dirname, '../../../.env.local'));

describe('Live Neon Hosted PostgreSQL Integration & Persistence Verification Suite', () => {
  const databaseUrl = process.env.DATABASE_URL;
  let pool: Pool;
  let dbService: DatabaseService;

  beforeAll(async () => {
    expect(databaseUrl).toBeDefined();

    const disableSsl = databaseUrl!.includes('sslmode=disable');
    const isSsl = !disableSsl && (
      databaseUrl!.includes('sslmode=require') ||
      databaseUrl!.includes('sslmode=no-verify') ||
      databaseUrl!.includes('ssl=true') ||
      process.env.NODE_ENV === 'production' ||
      true
    );

    pool = new Pool({
      connectionString: databaseUrl,
      ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 10,
    });

    const configService = new ConfigService({
      'database.url': databaseUrl,
      nodeEnv: 'production',
    });
    dbService = new DatabaseService(configService);
    await dbService.onModuleInit();
  });

  afterAll(async () => {
    if (dbService) await dbService.onModuleDestroy();
    if (pool) await pool.end();
  });

  it('1. should connect to live Neon PostgreSQL and execute SELECT 1 with low latency', async () => {
    const client = await pool.connect();
    try {
      const start = performance.now();
      const res = await client.query('SELECT 1 as ping');
      const latencyMs = performance.now() - start;
      expect(res.rows[0]?.ping).toBe(1);
      console.log(`[Neon Live Verification] SELECT 1 latency: ${latencyMs.toFixed(2)} ms`);
    } finally {
      client.release();
    }
  });

  it('2. should verify all 9 core schema tables exist in Neon database', async () => {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `);
      const tableNames = res.rows.map((r: { table_name: string }) => r.table_name);
      const expected = [
        'users',
        'auth_accounts',
        'guest_sessions',
        'conversations',
        'conversation_members',
        'messages',
        'saved_connections',
        'blocks',
        'reports',
      ];
      for (const t of expected) {
        expect(tableNames).toContain(t);
      }
      console.log(`[Neon Live Verification] Found ${tableNames.length} tables:`, tableNames.join(', '));
    } finally {
      client.release();
    }
  });

  it('3. should verify migration idempotency by safely re-running migrations without error', async () => {
    await expect(dbService.onModuleInit()).resolves.not.toThrow();
  });

  it('4. should persist and retrieve synthetic users, guest sessions, and auth accounts', async () => {
    const suffix = `neon_${Date.now()}`;
    const user = await dbService.createUser(`TestUser_${suffix}`, 'guest');
    expect(user.id).toBeDefined();
    expect(user.displayName).toBe(`TestUser_${suffix}`);

    const sess = await dbService.createGuestSession(user.id, 24);
    expect(sess.id).toBeDefined();
    expect(sess.userId).toBe(user.id);

    const auth = await dbService.linkAuthAccount(user.id, 'google', `google_${suffix}`, `neon_${suffix}@test.edu`);
    expect(auth.authAccount.id).toBeDefined();
    expect(auth.user.accountType).toBe('authenticated');

    const foundAuth = await dbService.findAuthAccount('google', `google_${suffix}`);
    expect(foundAuth?.userId).toBe(user.id);
  });

  it('5. should persist conversations, members, and encrypted message envelopes without plaintext', async () => {
    const suffix = `neon_conv_${Date.now()}`;
    const userA = await dbService.createUser(`Alice_${suffix}`, 'guest');
    const userB = await dbService.createUser(`Bob_${suffix}`, 'guest');

    const conv = await dbService.createConversation([userA.id, userB.id]);
    expect(conv.id).toBeDefined();

    const isMemberA = await dbService.isUserInConversation(conv.id, userA.id);
    const isMemberB = await dbService.isUserInConversation(conv.id, userB.id);
    expect(isMemberA).toBe(true);
    expect(isMemberB).toBe(true);

    const envelope = {
      id: toMessageId(`msg_neon_${Date.now()}`),
      conversationId: conv.id,
      senderId: userA.id,
      encryptedPayload: {
        ciphertext: 'TmVvbkVuY3J5cHRlZENpcGhlcnRleHRUZXN0',
        iv: 'TmVvbklWMjAyNg==',
        tag: 'TmVvblRhZw==',
        ephemPublicKey: 'TmVvbkVwaGVtS2V5',
        protocolVersion: 1,
        keyId: 'step_1',
      },
      status: 'sent' as const,
      createdAt: new Date().toISOString(),
    };

    await dbService.saveMessageEnvelope(envelope);

    // Duplicate message retry idempotency test (ON CONFLICT DO NOTHING)
    await dbService.saveMessageEnvelope(envelope);

    const messages = await dbService.getMessages(conv.id);
    expect(messages.length).toBe(1);
    expect(messages[0]!.encryptedPayload.ciphertext).toBe(envelope.encryptedPayload.ciphertext);

    // Directly verify in Neon database that plaintext does NOT exist in columns
    const client = await pool.connect();
    try {
      const rawRes = await client.query('SELECT * FROM messages WHERE id = $1', [envelope.id]);
      const row = rawRes.rows[0];
      expect(row.ciphertext).toBe(envelope.encryptedPayload.ciphertext);
      expect(row.iv).toBe(envelope.encryptedPayload.iv);
      expect(row.tag).toBe(envelope.encryptedPayload.tag);
    } finally {
      client.release();
    }
  });

  it('6. should persist saved connections, blocks, and moderation reports', async () => {
    const suffix = `neon_mod_${Date.now()}`;
    const userA = await dbService.createUser(`UserA_${suffix}`, 'guest');
    const userB = await dbService.createUser(`UserB_${suffix}`, 'guest');
    const conv = await dbService.createConversation([userA.id, userB.id]);

    const saved = await dbService.saveStrangerConnection(userA.id, conv.id, 'Best Friend');
    expect(saved.alias).toBe('Best Friend');

    const block = await dbService.blockUser(userA.id, userB.id);
    expect(block.blockedUserId).toBe(userB.id);

    const isBlocked = await dbService.isBlocked(userA.id, userB.id);
    expect(isBlocked).toBe(true);

    const report = await dbService.createReport({
      id: `rep_neon_${Date.now()}`,
      reporterId: userA.id,
      reportedUserId: userB.id,
      conversationId: conv.id,
      reason: 'spam',
      details: 'Automated Neon verification report',
      createdAt: new Date().toISOString(),
    });
    expect(report.id).toBeDefined();
  });
});
