import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import {
  ConversationId,
  IAuthAccount,
  IBlock,
  IConversation,
  IConversationMember,
  IEncryptedMessageEnvelope,
  IGuestSession,
  IReport,
  ISavedConnection,
  ISaveRequest,
  IUser,
  MessageId,
  toAuthAccountId,
  toConversationId,
  toGuestSessionId,
  toUserId,
  UserId,
} from '@campus-stranger/shared-types';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;
  private useInMemory = false;

  // In-memory fallback stores isolated strictly for unit tests without a database instance
  private readonly memUsers = new Map<string, IUser>();
  private readonly memAuthAccounts = new Map<string, IAuthAccount>();
  private readonly memGuestSessions = new Map<string, IGuestSession>();
  private readonly memConversations = new Map<string, IConversation>();
  private readonly memConversationMembers = new Map<string, IConversationMember[]>();
  private readonly memUserConversations = new Map<string, Set<string>>();
  private readonly memMessages = new Map<string, IEncryptedMessageEnvelope[]>();
  private readonly memSavedConnections = new Map<string, Map<string, ISavedConnection>>();
  private readonly memBlocks = new Map<string, Set<string>>();
  private readonly memReports: IReport[] = [];
  private readonly memSaveRequests = new Map<string, ISaveRequest>(); // id → request


  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = this.configService.get<string>('database.url');
    const host = this.configService.get<string>('database.host');

    if (databaseUrl || (host && host !== 'localhost')) {
      try {
        const disableSsl = databaseUrl?.includes('sslmode=disable');
        const isSsl =
          !disableSsl &&
          (databaseUrl?.includes('sslmode=require') ||
            databaseUrl?.includes('sslmode=no-verify') ||
            databaseUrl?.includes('ssl=true') ||
            this.configService.get<string>('nodeEnv') === 'production');

        this.pool = new Pool({
          connectionString: databaseUrl,
          host: !databaseUrl ? host : undefined,
          port: !databaseUrl ? this.configService.get<number>('database.port', 5432) : undefined,
          user: !databaseUrl ? this.configService.get<string>('database.user', 'postgres') : undefined,
          password: !databaseUrl
            ? this.configService.get<string>('database.password')
            : undefined,
          database: !databaseUrl
            ? this.configService.get<string>('database.name', 'campus_stranger')
            : undefined,
          ssl: isSsl ? { rejectUnauthorized: false } : undefined,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });

        // Register error handler on idle client connections to prevent process crashes
        this.pool.on('error', (err) => {
          this.logger.error(`Unexpected error on idle PostgreSQL client: ${err?.message || err}`);
        });

        // Test connection
        const client = await this.pool.connect();
        try {
          await this.runMigrations(client);
          this.logger.log('PostgreSQL database connected and schema verified.');
        } finally {
          client.release();
        }
      } catch (err) {
        this.logger.error(`Failed to connect to PostgreSQL: ${err}`);
        if (this.configService.get<string>('nodeEnv') === 'production') {
          throw new Error(`Production PostgreSQL connection failed: ${err}`);
        }
        this.logger.warn('Falling back to isolated in-memory store for local testing.');
        this.useInMemory = true;
      }
    } else {
      this.logger.log('No external DATABASE_URL provided. Initializing in-memory test store.');
      this.useInMemory = true;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('PostgreSQL pool shut down gracefully.');
    }
  }

  async pingDatabase(): Promise<boolean> {
    if (this.useInMemory || !this.pool) return true;
    try {
      const res = await this.pool.query('SELECT 1');
      return !!res.rowCount;
    } catch {
      return false;
    }
  }

  /**
   * Runs deterministic idempotent migrations ensuring tables, indices, and constraints exist.
   */
  private async runMigrations(client: PoolClient): Promise<void> {
    const ddl = `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        display_name VARCHAR(100) NOT NULL,
        account_type VARCHAR(20) NOT NULL DEFAULT 'guest',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);

      CREATE TABLE IF NOT EXISTS auth_accounts (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        provider_user_id VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_auth_provider_uid UNIQUE (provider, provider_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_auth_accounts_user ON auth_accounts(user_id);

      CREATE TABLE IF NOT EXISTS guest_sessions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_token_hash VARCHAR(128) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        metadata JSONB
      );
      CREATE INDEX IF NOT EXISTS idx_guest_sessions_user ON guest_sessions(user_id);

      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR(64) PRIMARY KEY,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        last_message_at TIMESTAMP WITH TIME ZONE
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

      CREATE TABLE IF NOT EXISTS conversation_members (
        id VARCHAR(64) PRIMARY KEY,
        conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        left_at TIMESTAMP WITH TIME ZONE,
        saved_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT uq_conv_member UNIQUE (conversation_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_conv_members_conv ON conversation_members(conversation_id);

      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(64) PRIMARY KEY,
        conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        ciphertext TEXT NOT NULL,
        iv VARCHAR(64) NOT NULL,
        tag VARCHAR(64),
        ephem_public_key TEXT,
        protocol_version INT NOT NULL DEFAULT 1,
        key_id VARCHAR(64),
        status VARCHAR(20) NOT NULL DEFAULT 'sent',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        delivered_at TIMESTAMP WITH TIME ZONE,
        read_at TIMESTAMP WITH TIME ZONE
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

      CREATE TABLE IF NOT EXISTS saved_connections (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        target_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        alias VARCHAR(100),
        saved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_saved_conv UNIQUE (user_id, conversation_id)
      );
      CREATE INDEX IF NOT EXISTS idx_saved_conn_user ON saved_connections(user_id);

      CREATE TABLE IF NOT EXISTS blocks (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_block_pair UNIQUE (user_id, blocked_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_blocks_user ON blocks(user_id);
      CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_user_id);

      CREATE TABLE IF NOT EXISTS reports (
        id VARCHAR(64) PRIMARY KEY,
        reporter_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reported_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        reason VARCHAR(50) NOT NULL,
        details TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_user_id);
      CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);

      CREATE TABLE IF NOT EXISTS save_requests (
        id VARCHAR(64) PRIMARY KEY,
        conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        requester_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        responded_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT uq_save_request_conv_requester UNIQUE (conversation_id, requester_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_save_requests_conv ON save_requests(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_save_requests_target ON save_requests(target_user_id);
      CREATE INDEX IF NOT EXISTS idx_save_requests_requester ON save_requests(requester_user_id);
    `;
    await client.query(ddl);
  }

  // --- User Operations ---

  async createUser(
    displayName: string,
    accountType: 'guest' | 'authenticated' = 'guest',
  ): Promise<IUser> {
    const id = toUserId(`usr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    const now = new Date().toISOString();

    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `INSERT INTO users (id, display_name, account_type, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, displayName, accountType, 'active', now, now],
      );
      const row = res.rows[0];
      return {
        id: toUserId(row.id),
        displayName: row.display_name,
        accountType: row.account_type,
        status: row.status,
        createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
      };
    }

    const user: IUser = {
      id,
      displayName,
      accountType,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.memUsers.set(id, user);
    this.memUserConversations.set(id, new Set());
    this.memSavedConnections.set(id, new Map());
    this.memBlocks.set(id, new Set());
    return user;
  }

  async findUserById(id: UserId): Promise<IUser | null> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: toUserId(row.id),
        displayName: row.display_name,
        accountType: row.account_type,
        status: row.status,
        createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
      };
    }
    return this.memUsers.get(id) ?? null;
  }

  async updateUser(user: IUser): Promise<IUser> {
    const now = new Date().toISOString();
    user.updatedAt = now;

    if (!this.useInMemory && this.pool) {
      await this.pool.query(
        `UPDATE users SET display_name = $1, account_type = $2, status = $3, updated_at = $4 WHERE id = $5`,
        [user.displayName, user.accountType, user.status, now, user.id],
      );
      return user;
    }

    this.memUsers.set(user.id, user);
    return user;
  }

  // --- Auth & Guest Sessions ---

  async createGuestSession(userId: UserId, expiresInHours = 72): Promise<IGuestSession> {
    const id = toGuestSessionId(`sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();

    if (!this.useInMemory && this.pool) {
      await this.pool.query(
        `INSERT INTO guest_sessions (id, user_id, session_token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, userId, id, expiresAt, now],
      );
      return { id, userId, expiresAt, createdAt: now };
    }

    const session: IGuestSession = { id, userId, expiresAt, createdAt: now };
    this.memGuestSessions.set(id, session);
    return session;
  }

  async linkAuthAccount(
    userId: UserId,
    provider: 'google',
    providerUserId: string,
    email?: string,
  ): Promise<{ user: IUser; authAccount: IAuthAccount }> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const authId = toAuthAccountId(`auth_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    const now = new Date().toISOString();

    if (!this.useInMemory && this.pool) {
      await this.pool.query(
        `INSERT INTO auth_accounts (id, user_id, provider, provider_user_id, email, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (provider, provider_user_id) DO UPDATE SET user_id = $2, email = $5`,
        [authId, userId, provider, providerUserId, email || null, now],
      );

      user.accountType = 'authenticated';
      await this.updateUser(user);

      return {
        user,
        authAccount: { id: authId, userId, provider, providerUserId, email, createdAt: now },
      };
    }

    const authAccount: IAuthAccount = {
      id: authId,
      userId,
      provider,
      providerUserId,
      email,
      createdAt: now,
    };
    this.memAuthAccounts.set(`${provider}:${providerUserId}`, authAccount);
    user.accountType = 'authenticated';
    await this.updateUser(user);
    return { user, authAccount };
  }

  async migrateUserConversations(fromUserId: UserId, toUserId: UserId): Promise<void> {
    if (!this.useInMemory && this.pool) {
      // 1. Migrate conversation members
      await this.pool.query(
        `UPDATE conversation_members SET user_id = $1 WHERE user_id = $2
         ON CONFLICT (conversation_id, user_id) DO NOTHING`,
        [toUserId, fromUserId],
      );
      await this.pool.query(`DELETE FROM conversation_members WHERE user_id = $1`, [fromUserId]);

      // 2. Migrate saved connections (both initiator and target)
      await this.pool.query(
        `UPDATE saved_connections SET user_id = $1 WHERE user_id = $2
         ON CONFLICT (user_id, conversation_id) DO NOTHING`,
        [toUserId, fromUserId],
      );
      await this.pool.query(
        `UPDATE saved_connections SET target_user_id = $1 WHERE target_user_id = $2`,
        [toUserId, fromUserId],
      );
      await this.pool.query(`DELETE FROM saved_connections WHERE user_id = $1`, [fromUserId]);

      // 3. Migrate blocks (both initiator and target)
      await this.pool.query(
        `UPDATE blocks SET user_id = $1 WHERE user_id = $2
         ON CONFLICT (user_id, blocked_user_id) DO NOTHING`,
        [toUserId, fromUserId],
      );
      await this.pool.query(
        `UPDATE blocks SET blocked_user_id = $1 WHERE blocked_user_id = $2
         ON CONFLICT (user_id, blocked_user_id) DO NOTHING`,
        [toUserId, fromUserId],
      );
      await this.pool.query(`DELETE FROM blocks WHERE user_id = $1 OR blocked_user_id = $1`, [
        fromUserId,
      ]);

      // 4. Migrate messages (both sender and recipient)
      await this.pool.query(`UPDATE messages SET sender_id = $1 WHERE sender_id = $2`, [
        toUserId,
        fromUserId,
      ]);
      await this.pool.query(`UPDATE messages SET recipient_id = $1 WHERE recipient_id = $2`, [
        toUserId,
        fromUserId,
      ]);

      // 5. Migrate reports (both reporter and reported)
      await this.pool.query(`UPDATE reports SET reporter_id = $1 WHERE reporter_id = $2`, [
        toUserId,
        fromUserId,
      ]);
      await this.pool.query(`UPDATE reports SET reported_user_id = $1 WHERE reported_user_id = $2`, [
        toUserId,
        fromUserId,
      ]);
      return;
    }

    // In-memory fallback migration
    for (const members of this.memConversationMembers.values()) {
      for (const member of members) {
        if (member.userId === fromUserId) {
          member.userId = toUserId;
        }
      }
    }

    const fromConvs = this.memUserConversations.get(fromUserId);
    if (fromConvs) {
      let toConvs = this.memUserConversations.get(toUserId);
      if (!toConvs) {
        toConvs = new Set();
        this.memUserConversations.set(toUserId, toConvs);
      }
      fromConvs.forEach((cId) => toConvs!.add(cId));
      this.memUserConversations.delete(fromUserId);
    }

    const fromSaved = this.memSavedConnections.get(fromUserId);
    if (fromSaved) {
      let toSaved = this.memSavedConnections.get(toUserId);
      if (!toSaved) {
        toSaved = new Map();
        this.memSavedConnections.set(toUserId, toSaved);
      }
      fromSaved.forEach((saved, cId) => {
        saved.userId = toUserId;
        toSaved!.set(cId, saved);
      });
      this.memSavedConnections.delete(fromUserId);
    }

    // Update targetUserId across all saved connection stores
    for (const userSavedMap of this.memSavedConnections.values()) {
      for (const saved of userSavedMap.values()) {
        if (saved.targetUserId === fromUserId) {
          saved.targetUserId = toUserId;
        }
      }
    }

    const fromBlocks = this.memBlocks.get(fromUserId);
    if (fromBlocks) {
      let toBlocks = this.memBlocks.get(toUserId);
      if (!toBlocks) {
        toBlocks = new Set();
        this.memBlocks.set(toUserId, toBlocks);
      }
      fromBlocks.forEach((bId) => toBlocks!.add(bId));
      this.memBlocks.delete(fromUserId);
    }

    // Update blocked target across all block sets
    for (const blockSet of this.memBlocks.values()) {
      if (blockSet.has(fromUserId)) {
        blockSet.delete(fromUserId);
        blockSet.add(toUserId);
      }
    }

    // Migrate messages in memory
    for (const msgList of this.memMessages.values()) {
      for (const msg of msgList) {
        if (msg.senderId === fromUserId) {
          msg.senderId = toUserId;
        }
        if (msg.recipientId === fromUserId) {
          msg.recipientId = toUserId;
        }
      }
    }

    // Migrate reports in memory
    for (const report of this.memReports) {
      if (report.reporterId === fromUserId) {
        report.reporterId = toUserId;
      }
      if (report.reportedUserId === fromUserId) {
        report.reportedUserId = toUserId;
      }
    }
  }

  async findAuthAccount(provider: 'google', providerUserId: string): Promise<IAuthAccount | null> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM auth_accounts WHERE provider = $1 AND provider_user_id = $2`,
        [provider, providerUserId],
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: toAuthAccountId(row.id),
        userId: toUserId(row.user_id),
        provider: row.provider,
        providerUserId: row.provider_user_id,
        email: row.email,
        createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
      };
    }
    return this.memAuthAccounts.get(`${provider}:${providerUserId}`) ?? null;
  }

  // --- Conversations ---

  async createConversation(participantIds: UserId[]): Promise<IConversation> {
    const id = toConversationId(`conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    const now = new Date().toISOString();

    if (!this.useInMemory && this.pool) {
      await this.pool.query(
        `INSERT INTO conversations (id, status, created_at, last_message_at) VALUES ($1, $2, $3, $4)`,
        [id, 'active', now, now],
      );

      for (const uid of participantIds) {
        const memId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        await this.pool.query(
          `INSERT INTO conversation_members (id, conversation_id, user_id, joined_at) VALUES ($1, $2, $3, $4)`,
          [memId, id, uid, now],
        );
      }

      return { id, status: 'active', createdAt: now, lastMessageAt: now };
    }

    const conversation: IConversation = { id, status: 'active', createdAt: now, lastMessageAt: now };
    this.memConversations.set(id, conversation);
    this.memMessages.set(id, []);

    const members: IConversationMember[] = participantIds.map((uid) => ({
      conversationId: id,
      userId: uid,
      joinedAt: now,
    }));
    this.memConversationMembers.set(id, members);

    participantIds.forEach((uid) => {
      let set = this.memUserConversations.get(uid);
      if (!set) {
        set = new Set();
        this.memUserConversations.set(uid, set);
      }
      set.add(id);
    });

    return conversation;
  }

  async findConversationById(id: ConversationId): Promise<IConversation | null> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query('SELECT * FROM conversations WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: toConversationId(row.id),
        status: row.status,
        createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
        lastMessageAt: row.last_message_at?.toISOString
          ? row.last_message_at.toISOString()
          : row.last_message_at,
      };
    }
    return this.memConversations.get(id) ?? null;
  }

  async getConversationMembers(conversationId: ConversationId): Promise<IConversationMember[]> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        'SELECT * FROM conversation_members WHERE conversation_id = $1',
        [conversationId],
      );
      return res.rows.map((row) => ({
        conversationId: toConversationId(row.conversation_id),
        userId: toUserId(row.user_id),
        joinedAt: row.joined_at.toISOString ? row.joined_at.toISOString() : row.joined_at,
        leftAt: row.left_at ? (row.left_at.toISOString ? row.left_at.toISOString() : row.left_at) : undefined,
        savedAt: row.saved_at ? (row.saved_at.toISOString ? row.saved_at.toISOString() : row.saved_at) : undefined,
      }));
    }
    return this.memConversationMembers.get(conversationId) ?? [];
  }

  async isUserInConversation(conversationId: ConversationId, userId: UserId): Promise<boolean> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
        [conversationId, userId],
      );
      return res.rows.length > 0;
    }
    const members = await this.getConversationMembers(conversationId);
    return members.some((m) => m.userId === userId && !m.leftAt);
  }

  async endConversation(conversationId: ConversationId): Promise<void> {
    if (!this.useInMemory && this.pool) {
      await this.pool.query(`UPDATE conversations SET status = 'ended' WHERE id = $1`, [
        conversationId,
      ]);
      return;
    }
    const conv = this.memConversations.get(conversationId);
    if (conv) conv.status = 'ended';
  }

  // --- Messages (Ciphertext Storage Only) ---

  async saveMessageEnvelope(envelope: IEncryptedMessageEnvelope): Promise<IEncryptedMessageEnvelope> {
    if (!this.useInMemory && this.pool) {
      await this.pool.query(
        `INSERT INTO messages (id, conversation_id, sender_id, ciphertext, iv, tag, ephem_public_key, protocol_version, key_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          envelope.id,
          envelope.conversationId,
          envelope.senderId,
          envelope.encryptedPayload.ciphertext,
          envelope.encryptedPayload.iv,
          envelope.encryptedPayload.tag || null,
          envelope.encryptedPayload.ephemPublicKey || null,
          envelope.encryptedPayload.protocolVersion || 1,
          envelope.encryptedPayload.keyId || null,
          envelope.status,
          envelope.createdAt,
        ],
      );
      await this.pool.query(`UPDATE conversations SET last_message_at = $1 WHERE id = $2`, [
        envelope.createdAt,
        envelope.conversationId,
      ]);
      return envelope;
    }

    let list = this.memMessages.get(envelope.conversationId);
    if (!list) {
      list = [];
      this.memMessages.set(envelope.conversationId, list);
    }
    if (!list.some((m) => m.id === envelope.id)) {
      list.push(envelope);
    }
    const conv = this.memConversations.get(envelope.conversationId);
    if (conv) conv.lastMessageAt = envelope.createdAt;
    return envelope;
  }

  async getMessages(conversationId: ConversationId): Promise<IEncryptedMessageEnvelope[]> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [conversationId],
      );
      return res.rows.map((row) => ({
        id: row.id,
        conversationId: toConversationId(row.conversation_id),
        senderId: toUserId(row.sender_id),
        recipientId: row.recipient_id ? toUserId(row.recipient_id) : undefined,
        encryptedPayload: {
          ciphertext: row.ciphertext,
          iv: row.iv,
          tag: row.tag || undefined,
          ephemPublicKey: row.ephem_public_key || undefined,
          protocolVersion: row.protocol_version,
          keyId: row.key_id || undefined,
        },
        status: row.status,
        createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
        deliveredAt: row.delivered_at
          ? row.delivered_at.toISOString
            ? row.delivered_at.toISOString()
            : row.delivered_at
          : undefined,
        readAt: row.read_at
          ? row.read_at.toISOString
            ? row.read_at.toISOString()
            : row.read_at
          : undefined,
      }));
    }
    return this.memMessages.get(conversationId) ?? [];
  }

  async updateMessageStatus(
    conversationId: ConversationId,
    messageId: MessageId,
    status: 'delivered' | 'read',
  ): Promise<void> {
    const now = new Date().toISOString();
    if (!this.useInMemory && this.pool) {
      if (status === 'delivered') {
        await this.pool.query(
          `UPDATE messages SET status = $1, delivered_at = $2 WHERE conversation_id = $3 AND id = $4`,
          [status, now, conversationId, messageId],
        );
      } else {
        await this.pool.query(
          `UPDATE messages SET status = $1, read_at = $2 WHERE conversation_id = $3 AND id = $4`,
          [status, now, conversationId, messageId],
        );
      }
      return;
    }

    const list = this.memMessages.get(conversationId) ?? [];
    const msg = list.find((m) => m.id === messageId);
    if (msg) {
      msg.status = status;
      if (status === 'delivered') msg.deliveredAt = now;
      if (status === 'read') msg.readAt = now;
    }
  }

  // --- Saved Connections ---

  async saveStrangerConnection(
    userId: UserId,
    conversationId: ConversationId,
    alias?: string,
  ): Promise<ISavedConnection> {
    const now = new Date().toISOString();
    const members = await this.getConversationMembers(conversationId);
    const partner = members.find((m) => m.userId !== userId);
    const targetUserId = partner ? partner.userId : toUserId('stranger_user');
    const id = `sc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (!this.useInMemory && this.pool) {
      await this.pool.query(
        `INSERT INTO saved_connections (id, user_id, conversation_id, target_user_id, alias, saved_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, conversation_id) DO UPDATE SET alias = $5, saved_at = $6`,
        [id, userId, conversationId, targetUserId, alias || null, now],
      );
      await this.pool.query(
        `UPDATE conversation_members SET saved_at = $1 WHERE conversation_id = $2 AND user_id = $3`,
        [now, conversationId, userId],
      );
      return { userId, conversationId, targetUserId, savedAt: now, alias };
    }

    let userSaved = this.memSavedConnections.get(userId);
    if (!userSaved) {
      userSaved = new Map();
      this.memSavedConnections.set(userId, userSaved);
    }
    const saved: ISavedConnection = { userId, conversationId, targetUserId, savedAt: now, alias };
    userSaved.set(conversationId, saved);

    const memList = this.memConversationMembers.get(conversationId) ?? [];
    const mem = memList.find((m) => m.userId === userId);
    if (mem) mem.savedAt = saved.savedAt;
    return saved;
  }

  async getSavedConnections(userId: UserId): Promise<ISavedConnection[]> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM saved_connections WHERE user_id = $1 ORDER BY saved_at DESC`,
        [userId],
      );
      return res.rows.map((row) => ({
        userId: toUserId(row.user_id),
        conversationId: toConversationId(row.conversation_id),
        targetUserId: toUserId(row.target_user_id),
        savedAt: row.saved_at.toISOString ? row.saved_at.toISOString() : row.saved_at,
        alias: row.alias || undefined,
      }));
    }
    const userSaved = this.memSavedConnections.get(userId);
    if (!userSaved) return [];
    return Array.from(userSaved.values());
  }

  async removeSavedConnection(userId: UserId, conversationId: ConversationId): Promise<boolean> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `DELETE FROM saved_connections WHERE user_id = $1 AND conversation_id = $2`,
        [userId, conversationId],
      );
      return (res.rowCount ?? 0) > 0;
    }
    const userSaved = this.memSavedConnections.get(userId);
    if (!userSaved) return false;
    return userSaved.delete(conversationId);
  }

  // --- Moderation (Blocks & Reports) ---

  async blockUser(userId: UserId, blockedUserId: UserId): Promise<IBlock> {
    const id = `blk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    if (!this.useInMemory && this.pool) {
      await this.pool.query(
        `INSERT INTO blocks (id, user_id, blocked_user_id, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, blocked_user_id) DO NOTHING`,
        [id, userId, blockedUserId, now],
      );
      return { userId, blockedUserId, createdAt: now };
    }

    let userBlocks = this.memBlocks.get(userId);
    if (!userBlocks) {
      userBlocks = new Set();
      this.memBlocks.set(userId, userBlocks);
    }
    userBlocks.add(blockedUserId);
    return { userId, blockedUserId, createdAt: now };
  }

  async isBlocked(userA: UserId, userB: UserId): Promise<boolean> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `SELECT 1 FROM blocks WHERE (user_id = $1 AND blocked_user_id = $2) OR (user_id = $2 AND blocked_user_id = $1)`,
        [userA, userB],
      );
      return res.rows.length > 0;
    }
    const aBlocks = this.memBlocks.get(userA);
    if (aBlocks && aBlocks.has(userB)) return true;
    const bBlocks = this.memBlocks.get(userB);
    if (bBlocks && bBlocks.has(userA)) return true;
    return false;
  }

  async getBlocks(userId: UserId): Promise<string[]> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(`SELECT blocked_user_id FROM blocks WHERE user_id = $1`, [
        userId,
      ]);
      return res.rows.map((r) => r.blocked_user_id);
    }
    const set = this.memBlocks.get(userId);
    return set ? Array.from(set) : [];
  }

  async createReport(report: IReport): Promise<IReport> {
    const now = report.createdAt || new Date().toISOString();

    if (!this.useInMemory && this.pool) {
      await this.pool.query(
        `INSERT INTO reports (id, reporter_id, reported_user_id, conversation_id, reason, details, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          report.id,
          report.reporterId,
          report.reportedUserId,
          report.conversationId,
          report.reason,
          report.details || null,
          'pending',
          now,
        ],
      );
      return report;
    }

    this.memReports.push(report);
    return report;
  }

  // --- Save Requests (Mutual Consent) ---

  /**
   * Creates a save request from requester to target for a conversation.
   * Idempotent: if a pending request already exists from this requester in this conversation,
   * returns the existing request without creating a duplicate.
   */
  async createOrGetSaveRequest(
    conversationId: ConversationId,
    requesterUserId: UserId,
    targetUserId: UserId,
  ): Promise<ISaveRequest> {
    const now = new Date().toISOString();
    const id = `sreq_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (!this.useInMemory && this.pool) {
      // Try to find existing pending/accepted request first
      const existing = await this.pool.query(
        `SELECT * FROM save_requests
         WHERE conversation_id = $1 AND requester_user_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [conversationId, requesterUserId],
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        return {
          id: row.id,
          conversationId: toConversationId(row.conversation_id),
          requesterUserId: toUserId(row.requester_user_id),
          targetUserId: toUserId(row.target_user_id),
          status: row.status,
          createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
          respondedAt: row.responded_at
            ? row.responded_at.toISOString
              ? row.responded_at.toISOString()
              : row.responded_at
            : undefined,
        };
      }

      await this.pool.query(
        `INSERT INTO save_requests (id, conversation_id, requester_user_id, target_user_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (conversation_id, requester_user_id) DO NOTHING`,
        [id, conversationId, requesterUserId, targetUserId, 'pending', now],
      );

      // Fetch the just-inserted (or conflicting existing) row
      const result = await this.pool.query(
        `SELECT * FROM save_requests WHERE conversation_id = $1 AND requester_user_id = $2 LIMIT 1`,
        [conversationId, requesterUserId],
      );
      const row = result.rows[0];
      return {
        id: row.id,
        conversationId: toConversationId(row.conversation_id),
        requesterUserId: toUserId(row.requester_user_id),
        targetUserId: toUserId(row.target_user_id),
        status: row.status,
        createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
        respondedAt: row.responded_at
          ? row.responded_at.toISOString
            ? row.responded_at.toISOString()
            : row.responded_at
          : undefined,
      };
    }

    // In-memory: check for existing
    for (const req of this.memSaveRequests.values()) {
      if (req.conversationId === conversationId && req.requesterUserId === requesterUserId) {
        return req;
      }
    }
    const req: ISaveRequest = {
      id,
      conversationId,
      requesterUserId,
      targetUserId,
      status: 'pending',
      createdAt: now,
    };
    this.memSaveRequests.set(id, req);
    return req;
  }

  /**
   * Responds to a pending save request.
   * Only the target user may respond. Validates ownership.
   * On acceptance, atomically creates saved_connections for both participants.
   * Returns null if request not found or already responded.
   */
  async respondToSaveRequest(
    requestId: string,
    respondingUserId: UserId,
    response: 'accepted' | 'declined',
  ): Promise<ISaveRequest | null> {
    const now = new Date().toISOString();

    if (!this.useInMemory && this.pool) {
      const existing = await this.pool.query(
        `SELECT * FROM save_requests WHERE id = $1`,
        [requestId],
      );
      if (existing.rows.length === 0) return null;

      const row = existing.rows[0];
      // Authorization: only the target user may respond
      if (row.target_user_id !== respondingUserId) return null;
      // Idempotent: if already in terminal state, return current state
      if (row.status !== 'pending') {
        return {
          id: row.id,
          conversationId: toConversationId(row.conversation_id),
          requesterUserId: toUserId(row.requester_user_id),
          targetUserId: toUserId(row.target_user_id),
          status: row.status,
          createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
          respondedAt: row.responded_at
            ? row.responded_at.toISOString
              ? row.responded_at.toISOString()
              : row.responded_at
            : undefined,
        };
      }

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `UPDATE save_requests SET status = $1, responded_at = $2 WHERE id = $3`,
          [response, now, requestId],
        );

        if (response === 'accepted') {
          const convId = row.conversation_id;
          const requesterId = row.requester_user_id;
          const targetId = row.target_user_id;

          // Create saved_connections for requester
          const scId1 = `sc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          await client.query(
            `INSERT INTO saved_connections (id, user_id, conversation_id, target_user_id, saved_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, conversation_id) DO UPDATE SET saved_at = $5`,
            [scId1, requesterId, convId, targetId, now],
          );

          // Create saved_connections for target
          const scId2 = `sc_${Date.now()}_r${Math.random().toString(36).substring(2, 9)}`;
          await client.query(
            `INSERT INTO saved_connections (id, user_id, conversation_id, target_user_id, saved_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, conversation_id) DO UPDATE SET saved_at = $5`,
            [scId2, targetId, convId, requesterId, now],
          );

          // Update conversation_members.saved_at for both
          await client.query(
            `UPDATE conversation_members SET saved_at = $1
             WHERE conversation_id = $2 AND user_id IN ($3, $4)`,
            [now, convId, requesterId, targetId],
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      const updated = await this.pool.query(`SELECT * FROM save_requests WHERE id = $1`, [requestId]);
      const updRow = updated.rows[0];
      return {
        id: updRow.id,
        conversationId: toConversationId(updRow.conversation_id),
        requesterUserId: toUserId(updRow.requester_user_id),
        targetUserId: toUserId(updRow.target_user_id),
        status: updRow.status,
        createdAt: updRow.created_at.toISOString ? updRow.created_at.toISOString() : updRow.created_at,
        respondedAt: updRow.responded_at
          ? updRow.responded_at.toISOString
            ? updRow.responded_at.toISOString()
            : updRow.responded_at
          : now,
      };
    }

    // In-memory fallback
    const req = this.memSaveRequests.get(requestId);
    if (!req) return null;
    if (req.targetUserId !== respondingUserId) return null;
    if (req.status !== 'pending') return req;

    req.status = response;
    req.respondedAt = now;

    if (response === 'accepted') {
      // Create both saved connections
      await this.saveStrangerConnection(req.requesterUserId, req.conversationId);
      await this.saveStrangerConnection(req.targetUserId, req.conversationId);
    }

    return req;
  }

  /**
   * Returns a pending save request targeting the given user in the given conversation.
   * Used for reconnect synchronization.
   */
  async getPendingSaveRequestForConversation(
    conversationId: ConversationId,
    targetUserId: UserId,
  ): Promise<ISaveRequest | null> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM save_requests
         WHERE conversation_id = $1 AND target_user_id = $2 AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`,
        [conversationId, targetUserId],
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        conversationId: toConversationId(row.conversation_id),
        requesterUserId: toUserId(row.requester_user_id),
        targetUserId: toUserId(row.target_user_id),
        status: row.status,
        createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
      };
    }

    for (const req of this.memSaveRequests.values()) {
      if (
        req.conversationId === conversationId &&
        req.targetUserId === targetUserId &&
        req.status === 'pending'
      ) {
        return req;
      }
    }
    return null;
  }

  /**
   * Cancels all pending save requests for a conversation.
   * Called when a conversation ends before mutual consent is reached.
   */
  async cancelPendingSaveRequests(conversationId: ConversationId): Promise<ISaveRequest[]> {
    const now = new Date().toISOString();

    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `UPDATE save_requests SET status = 'cancelled', responded_at = $1
         WHERE conversation_id = $2 AND status = 'pending'
         RETURNING *`,
        [now, conversationId],
      );
      return res.rows.map((row) => ({
        id: row.id,
        conversationId: toConversationId(row.conversation_id),
        requesterUserId: toUserId(row.requester_user_id),
        targetUserId: toUserId(row.target_user_id),
        status: 'cancelled' as const,
        createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
        respondedAt: now,
      }));
    }

    const cancelled: ISaveRequest[] = [];
    for (const req of this.memSaveRequests.values()) {
      if (req.conversationId === conversationId && req.status === 'pending') {
        req.status = 'cancelled';
        req.respondedAt = now;
        cancelled.push(req);
      }
    }
    return cancelled;
  }

  /**
   * Mutually deletes a saved connection for both participants in a conversation.
   * Also deletes all encrypted message rows (Option A: full server-side erasure).
   * Only a current participant may trigger this deletion.
   */
  async deleteMutualSavedConnection(
    conversationId: ConversationId,
    requestingUserId: UserId,
  ): Promise<{ deleted: boolean; otherUserId: UserId | null }> {
    if (!this.useInMemory && this.pool) {
      // Verify requester is a member of the conversation
      const memberCheck = await this.pool.query(
        `SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, requestingUserId],
      );
      if (memberCheck.rows.length === 0) {
        return { deleted: false, otherUserId: null };
      }

      // Find the other participant
      const otherMember = await this.pool.query(
        `SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id != $2 LIMIT 1`,
        [conversationId, requestingUserId],
      );
      const otherUserId: UserId | null =
        otherMember.rows.length > 0 ? toUserId(otherMember.rows[0].user_id) : null;

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // Delete both saved connections
        await client.query(
          `DELETE FROM saved_connections WHERE conversation_id = $1`,
          [conversationId],
        );

        // Delete all encrypted messages for the conversation (Option A)
        await client.query(
          `DELETE FROM messages WHERE conversation_id = $1`,
          [conversationId],
        );

        // Mark conversation as deleted
        await client.query(
          `UPDATE conversations SET status = 'deleted' WHERE id = $1`,
          [conversationId],
        );

        // Cancel any pending save requests
        await client.query(
          `UPDATE save_requests SET status = 'cancelled', responded_at = NOW()
           WHERE conversation_id = $1 AND status = 'pending'`,
          [conversationId],
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      return { deleted: true, otherUserId };
    }

    // In-memory fallback
    const members = await this.getConversationMembers(conversationId);
    const isMember = members.some((m) => m.userId === requestingUserId);
    if (!isMember) return { deleted: false, otherUserId: null };

    const otherMember = members.find((m) => m.userId !== requestingUserId);
    const otherUserId = otherMember?.userId ?? null;

    // Remove saved connections for both
    for (const savedMap of this.memSavedConnections.values()) {
      if (savedMap.has(conversationId)) {
        savedMap.delete(conversationId);
      }
    }

    // Delete messages
    this.memMessages.delete(conversationId);

    // Mark conversation deleted
    const conv = this.memConversations.get(conversationId);
    if (conv) conv.status = 'deleted';

    // Cancel pending save requests
    for (const req of this.memSaveRequests.values()) {
      if (req.conversationId === conversationId && req.status === 'pending') {
        req.status = 'cancelled';
        req.respondedAt = new Date().toISOString();
      }
    }

    return { deleted: true, otherUserId };
  }
}

