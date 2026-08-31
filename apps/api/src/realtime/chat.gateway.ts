import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DatabaseService } from '../persistence/database.service';
import { RedisService } from '../persistence/redis.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import {
  ConversationId,
  IEncryptedMessageEnvelope,
  IUser,
  IWsChatBlockPayload,
  IWsChatMessagePayload,
  IWsChatNextPayload,
  IWsChatReadPayload,
  IWsChatReportPayload,
  IWsChatSendPayload,
  IWsChatTypingPayload,
  IWsHeartbeatPayload,
  IWsMatchFoundPayload,
  IWsMessageSentAckPayload,
  IWsMessageStatusUpdatePayload,
  IWsSaveAcceptedPayload,
  IWsSaveCancelledPayload,
  IWsSaveDeclinedPayload,
  IWsSaveDeletedPayload,
  IWsSaveRequestReceivedPayload,
  IWsSaveRespondPayload,
  IWsSaveRequestPayload,
  IWsSyncCompletedPayload,
  IWsSyncPayload,
  ReportReason,
  toConversationId,
  toMessageId,
  toUserId,
  WsClientEvents,
  WsServerEvents,
} from '@campus-stranger/shared-types';
import {
  assertEncryptedPayloadValid,
  assertNeverContainsPrivateKey,
} from '@campus-stranger/crypto';

interface AuthenticatedSocket extends Socket {
  data: {
    user?: IUser;
    activeConversationId?: ConversationId;
    preKeyBundle?: {
      identityKey: string;
      signedPreKey: string;
      signedPreKeySignature?: string;
    };
    authPromise?: Promise<void>;
  };
}

@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>

  constructor(
    private readonly jwtService: JwtService,
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly matchmaking: MatchmakingService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Socket client connected: ${client.id}`);
    const activeCount = await this.redis.getActiveUserCount();
    client.emit(WsServerEvents.ACTIVE_USERS_COUNT, {
      count: activeCount,
      timestamp: new Date().toISOString(),
    });
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const user = client.data.user;
    if (user) {
      this.logger.log(`Socket client disconnected: ${client.id} (User: ${user.displayName} / ${user.id})`);
      await this.matchmaking.removeFromQueue(user.id);
      await this.redis.unregisterSocket(user.id, client.id);

      const sockets = this.userSockets.get(user.id);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(user.id);
        }
      }

      // Broadcast updated active users count to all connected clients
      const activeCount = await this.redis.getActiveUserCount();
      this.server.emit(WsServerEvents.ACTIVE_USERS_COUNT, {
        count: activeCount,
        timestamp: new Date().toISOString(),
      });

      // Notify active conversation partner if disconnected
      if (client.data.activeConversationId) {
        client.to(`conv_${client.data.activeConversationId}`).emit(WsServerEvents.USER_OFFLINE, {
          conversationId: client.data.activeConversationId,
          isOnline: false,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // --- 1. Authenticate WebSocket Connection ---

  @SubscribeMessage(WsClientEvents.AUTHENTICATE)
  async handleAuthenticate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload?: { token?: string; preKeyBundle?: { identityKey: string; signedPreKey: string; signedPreKeySignature?: string } },
  ) {
    const authPromise = (async () => {
      // Rate limit socket authentication attempts (max 10 attempts per 10 seconds)
      const rate = await this.redis.checkRateLimit(`ws:auth:${client.id}`, 10, 10);
      if (!rate.allowed) {
        client.emit(WsServerEvents.CHAT_ERROR, { code: 'RATE_LIMIT_EXCEEDED', message: 'Authentication rate limit exceeded' });
        return;
      }

      // Extract token from message payload, socket auth handshake, or HttpOnly cookie header
      let token = payload?.token || (client.handshake?.auth?.token as string | undefined);
      if (!token && client.handshake?.headers?.cookie) {
        const rawCookie = client.handshake.headers.cookie;
        const match = rawCookie.match(/(?:^|;\s*)(?:cs_auth_token|session_token)=([^;]+)/);
        if (match) {
          token = decodeURIComponent(match[1]);
        }
      }

      if (!token) {
        client.emit(WsServerEvents.CHAT_ERROR, { code: 'UNAUTHORIZED', message: 'No session token or cookie provided' });
        return;
      }

      try {
        const decoded = this.jwtService.verify(token);
        const user = await this.db.findUserById(toUserId(decoded.sub));

        if (!user) {
          client.emit(WsServerEvents.CHAT_ERROR, { code: 'UNAUTHORIZED', message: 'Invalid session token' });
          return;
        }

        // Clean up old user mappings if socket identity is transitioning (e.g. guest -> authenticated)
        if (client.data.user && client.data.user.id !== user.id) {
          const oldUserId = client.data.user.id;
          const oldSockets = this.userSockets.get(oldUserId);
          if (oldSockets) {
            oldSockets.delete(client.id);
            if (oldSockets.size === 0) this.userSockets.delete(oldUserId);
          }
          await this.redis.unregisterSocket(oldUserId, client.id);
        }

        client.data.user = user;
        if (payload?.preKeyBundle) {
          client.data.preKeyBundle = payload.preKeyBundle;
        }

        let sockets = this.userSockets.get(user.id);
        if (!sockets) {
          sockets = new Set();
          this.userSockets.set(user.id, sockets);
        }
        sockets.add(client.id);

        // Register presence in Redis for cross-node discovery
        await this.redis.registerSocket(user.id, client.id);

        client.emit(WsServerEvents.AUTHENTICATED, {
          userId: user.id,
          displayName: user.displayName,
          accountType: user.accountType,
        });

        // Broadcast updated active users count to all connected clients
        const activeCount = await this.redis.getActiveUserCount();
        this.server.emit(WsServerEvents.ACTIVE_USERS_COUNT, {
          count: activeCount,
          timestamp: new Date().toISOString(),
        });

        this.logger.log(`Authenticated socket ${client.id} for user ${user.displayName} (${user.id})`);
      } catch (err) {
        this.logger.warn(`Authentication failed for socket ${client.id}: ${err}`);
        client.emit(WsServerEvents.CHAT_ERROR, { code: 'UNAUTHORIZED', message: 'Token verification failed' });
      }
    })();

    client.data.authPromise = authPromise;
    await authPromise;
  }

  @SubscribeMessage(WsClientEvents.GET_ACTIVE_USERS)
  async handleGetActiveUsers(@ConnectedSocket() client: AuthenticatedSocket) {
    const count = await this.redis.getActiveUserCount();
    client.emit(WsServerEvents.ACTIVE_USERS_COUNT, {
      count,
      timestamp: new Date().toISOString(),
    });
  }

  // --- 2. Matchmaking Queue ---

  @SubscribeMessage(WsClientEvents.MATCH_JOIN)
  async handleMatchJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload?: { preKeyBundle?: { identityKey: string; signedPreKey: string; signedPreKeySignature?: string } },
  ) {
    if (!client.data.user && client.data.authPromise) {
      await client.data.authPromise;
    }

    const user = client.data.user;
    if (!user) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'UNAUTHORIZED', message: 'Must authenticate before joining matchmaking' });
      return;
    }

    // Rate limit matchmaking join attempts (max 10 joins per 10 seconds)
    const rate = await this.redis.checkRateLimit(`ws:match_join:${user.id}`, 10, 10);
    if (!rate.allowed) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'RATE_LIMIT_EXCEEDED', message: 'Matchmaking rate limit exceeded' });
      return;
    }

    const preKeyBundle = payload?.preKeyBundle || client.data.preKeyBundle;

    const match = await this.matchmaking.joinQueue({
      userId: user.id,
      socketId: client.id,
      displayName: user.displayName,
      preKeyBundle,
      joinedAt: Date.now(),
    });

    if (match) {
      const { conversation, userA, userB } = match;
      const room = `conv_${conversation.id}`;

      // Cross-Node Room Join and Match Emission via Redis Adapter
      if (this.server) {
        if (typeof this.server.in === 'function') {
          this.server.in(userA.socketId).socketsJoin(room);
          this.server.in(userB.socketId).socketsJoin(room);
        }

        const payloadA: IWsMatchFoundPayload = {
          conversationId: conversation.id,
          partnerDisplayName: userB.displayName,
          partnerKeyBundle: userB.preKeyBundle
            ? { identityKey: userB.preKeyBundle.identityKey, ephemeralKey: userB.preKeyBundle.signedPreKey }
            : undefined,
          matchedAt: conversation.createdAt,
        };
        this.server.to(userA.socketId).emit(WsServerEvents.MATCH_FOUND, payloadA);

        const payloadB: IWsMatchFoundPayload = {
          conversationId: conversation.id,
          partnerDisplayName: userA.displayName,
          partnerKeyBundle: userA.preKeyBundle
            ? { identityKey: userA.preKeyBundle.identityKey, ephemeralKey: userA.preKeyBundle.signedPreKey }
            : undefined,
          matchedAt: conversation.createdAt,
        };
        this.server.to(userB.socketId).emit(WsServerEvents.MATCH_FOUND, payloadB);
      }

      // Local socket instance active conversation update
      const socketA = this.server?.sockets?.sockets?.get?.(userA.socketId) as AuthenticatedSocket | undefined;
      if (socketA) {
        socketA.join(room);
        socketA.data.activeConversationId = conversation.id;
      }
      const socketB = this.server?.sockets?.sockets?.get?.(userB.socketId) as AuthenticatedSocket | undefined;
      if (socketB) {
        socketB.join(room);
        socketB.data.activeConversationId = conversation.id;
      }
    }
  }

  @SubscribeMessage(WsClientEvents.MATCH_LEAVE)
  async handleMatchLeave(@ConnectedSocket() client: AuthenticatedSocket) {
    const user = client.data.user;
    if (user) {
      await this.matchmaking.removeFromQueue(user.id);
    }
  }

  // --- 3. Encrypted Message Sending (Zero Plaintext Server Boundary) ---

  @SubscribeMessage(WsClientEvents.CHAT_SEND)
  async handleChatSend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IWsChatSendPayload,
  ) {
    const user = client.data.user;
    if (!user) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }

    if (!payload?.conversationId || !payload?.encryptedPayload) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'INVALID_PAYLOAD', message: 'Missing conversationId or encryptedPayload' });
      return;
    }

    // Zero-Knowledge cryptographic assertions & payload size limit
    try {
      assertNeverContainsPrivateKey(payload as unknown as Record<string, unknown>);
      assertNeverContainsPrivateKey(payload.encryptedPayload as unknown as Record<string, unknown>);
      assertEncryptedPayloadValid(payload.encryptedPayload);

      // Protect against memory exhaustion / DOS attacks via oversized payloads (max 64KB)
      if (payload.encryptedPayload.ciphertext.length > 65536) {
        client.emit(WsServerEvents.CHAT_ERROR, { code: 'INVALID_PAYLOAD', message: 'Ciphertext exceeds maximum allowable size (64KB)' });
        return;
      }
    } catch (err) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'INVALID_PAYLOAD', message: String(err) });
      return;
    }

    // Rate limit message sending (max 30 messages per 10 seconds per user)
    const rate = await this.redis.checkRateLimit(`ws:send:${user.id}`, 30, 10);
    if (!rate.allowed) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded. Please slow down.' });
      return;
    }

    const convId = toConversationId(payload.conversationId);
    const conv = await this.db.findConversationById(convId);
    if (!conv || conv.status !== 'active') {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'FORBIDDEN', message: 'Conversation is not active or has ended' });
      return;
    }

    const isMember = await this.db.isUserInConversation(convId, user.id);
    if (!isMember) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'FORBIDDEN', message: 'Not a member of this conversation' });
      return;
    }

    const members = await this.db.getConversationMembers(convId);
    const partner = members.find((m) => m.userId !== user.id);
    if (partner && (await this.db.isBlocked(user.id, partner.userId))) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'FORBIDDEN', message: 'Cannot message a blocked user' });
      return;
    }

    // Auto-join room for sender if missing
    client.join(`conv_${convId}`);
    client.data.activeConversationId = convId;

    const messageId = toMessageId(`msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    const now = new Date().toISOString();

    const envelope: IEncryptedMessageEnvelope = {
      id: messageId,
      conversationId: convId,
      senderId: user.id, // Forgery resistance: senderId is strictly bound to authenticated session
      encryptedPayload: payload.encryptedPayload,
      status: 'sent',
      createdAt: now,
    };

    // Durable persistence of ciphertext envelope in PostgreSQL
    await this.db.saveMessageEnvelope(envelope);

    // 1. Send immediate ACK back to sender
    const ack: IWsMessageSentAckPayload = {
      clientMessageId: payload.clientMessageId,
      messageId,
      conversationId: convId,
      status: 'sent',
      createdAt: now,
    };
    client.emit(WsServerEvents.MESSAGE_SENT, ack);

    // 2. Relay ciphertext envelope to room (partner)
    const chatMsgPayload: IWsChatMessagePayload = { envelope };
    client.to(`conv_${convId}`).emit(WsServerEvents.CHAT_MESSAGE, chatMsgPayload);
  }

  // --- 4. Typing Indicators ---

  @SubscribeMessage(WsClientEvents.CHAT_TYPING_START)
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IWsChatTypingPayload,
  ) {
    const user = client.data.user;
    if (!user || !payload?.conversationId) return;

    const convId = toConversationId(payload.conversationId);
    const isMember = await this.db.isUserInConversation(convId, user.id);
    if (!isMember) return;

    // Rate limit typing indicators (max 20 per 10 seconds)
    const rate = await this.redis.checkRateLimit(`ws:typing:${user.id}`, 20, 10);
    if (!rate.allowed) return;

    client.to(`conv_${convId}`).emit(WsServerEvents.CHAT_TYPING, {
      conversationId: convId,
      isTyping: true,
    });
  }

  @SubscribeMessage(WsClientEvents.CHAT_TYPING_STOP)
  async handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IWsChatTypingPayload,
  ) {
    const user = client.data.user;
    if (!user || !payload?.conversationId) return;

    const convId = toConversationId(payload.conversationId);
    const isMember = await this.db.isUserInConversation(convId, user.id);
    if (!isMember) return;

    client.to(`conv_${convId}`).emit(WsServerEvents.CHAT_TYPING, {
      conversationId: convId,
      isTyping: false,
    });
  }

  // --- 5. Message Read / Delivery Status ---

  @SubscribeMessage(WsClientEvents.CHAT_READ)
  async handleChatRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IWsChatReadPayload,
  ) {
    const user = client.data.user;
    if (!user || !payload?.conversationId || !payload?.messageId) return;

    const convId = toConversationId(payload.conversationId);
    const isMember = await this.db.isUserInConversation(convId, user.id);
    if (!isMember) return;

    await this.db.updateMessageStatus(convId, payload.messageId, 'read');
    const updatePayload: IWsMessageStatusUpdatePayload = {
      conversationId: convId,
      messageId: payload.messageId,
      status: 'read',
      timestamp: new Date().toISOString(),
    };
    client.to(`conv_${convId}`).emit(WsServerEvents.MESSAGE_READ, updatePayload);
  }

  // --- 6. Next Stranger / Skip ---

  @SubscribeMessage(WsClientEvents.CHAT_NEXT)
  async handleChatNext(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IWsChatNextPayload,
  ) {
    const user = client.data.user;
    if (!user || !payload?.conversationId) return;

    // Rate limit skip/next attempts (max 10 per 10 seconds)
    const rate = await this.redis.checkRateLimit(`ws:next:${user.id}`, 10, 10);
    if (!rate.allowed) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'RATE_LIMIT_EXCEEDED', message: 'Next stranger rate limit exceeded. Please wait.' });
      return;
    }

    const convId = toConversationId(payload.conversationId);
    const isMember = await this.db.isUserInConversation(convId, user.id);
    if (!isMember) return;

    await this.db.endConversation(convId);

    // Cancel any pending save requests for this conversation
    const cancelledRequests = await this.db.cancelPendingSaveRequests(convId);
    for (const req of cancelledRequests) {
      const cancelPayload: IWsSaveCancelledPayload = {
        requestId: req.id,
        conversationId: convId,
        reason: 'conversation_ended',
      };
      this.server.to(`conv_${convId}`).emit(WsServerEvents.SAVE_CANCELLED, cancelPayload);
    }

    // Notify partner that chat ended
    client.to(`conv_${convId}`).emit(WsServerEvents.CHAT_ENDED, {
      conversationId: convId,
      reason: 'partner_left',
      endedAt: new Date().toISOString(),
    });

    client.leave(`conv_${convId}`);
    client.data.activeConversationId = undefined;

    // Immediately re-enqueue in matchmaking for instant seamless next partner
    await this.handleMatchJoin(client);
  }

  // --- 7. Block & Report ---

  @SubscribeMessage(WsClientEvents.CHAT_BLOCK)
  async handleChatBlock(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IWsChatBlockPayload,
  ) {
    const user = client.data.user;
    if (!user || !payload?.conversationId) return;

    // Rate limit block attempts
    const rate = await this.redis.checkRateLimit(`ws:block:${user.id}`, 10, 10);
    if (!rate.allowed) return;

    const convId = toConversationId(payload.conversationId);
    const isMember = await this.db.isUserInConversation(convId, user.id);
    if (!isMember) return;

    const members = await this.db.getConversationMembers(convId);
    const partnerMember = members.find((m) => m.userId !== user.id);
    const targetUserId = partnerMember?.userId || payload.targetUserId;

    if (targetUserId && targetUserId !== 'stranger_user') {
      await this.db.blockUser(user.id, targetUserId);
    }
    await this.db.endConversation(convId);

    // Cancel any pending save requests for this conversation
    const cancelledOnBlock = await this.db.cancelPendingSaveRequests(convId);
    for (const req of cancelledOnBlock) {
      const cancelPayload: IWsSaveCancelledPayload = {
        requestId: req.id,
        conversationId: convId,
        reason: 'conversation_ended',
      };
      this.server.to(`conv_${convId}`).emit(WsServerEvents.SAVE_CANCELLED, cancelPayload);
    }

    client.to(`conv_${convId}`).emit(WsServerEvents.CHAT_ENDED, {
      conversationId: convId,
      reason: 'partner_blocked',
      endedAt: new Date().toISOString(),
    });

    client.leave(`conv_${convId}`);
    client.data.activeConversationId = undefined;
  }

  @SubscribeMessage(WsClientEvents.CHAT_REPORT)
  async handleChatReport(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IWsChatReportPayload,
  ) {
    const user = client.data.user;
    if (!user || !payload?.conversationId) return;

    // Rate limit report attempts (max 5 per 10 seconds)
    const rate = await this.redis.checkRateLimit(`ws:report:${user.id}`, 5, 10);
    if (!rate.allowed) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'RATE_LIMIT_EXCEEDED', message: 'Report rate limit exceeded.' });
      return;
    }

    const convId = toConversationId(payload.conversationId);
    const isMember = await this.db.isUserInConversation(convId, user.id);
    if (!isMember) return;

    const members = await this.db.getConversationMembers(convId);
    const partnerMember = members.find((m) => m.userId !== user.id);
    const targetUserId = partnerMember?.userId || payload.targetUserId;

    if (targetUserId && targetUserId !== 'stranger_user' && targetUserId !== user.id) {
      await this.db.createReport({
        id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        reporterId: user.id,
        reportedUserId: targetUserId,
        conversationId: convId,
        reason: (payload.reason as ReportReason) || 'other',
        details: payload.details ? payload.details.trim() : undefined,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // --- 8. Reconnect & Synchronization ---

  @SubscribeMessage(WsClientEvents.SYNC)
  async handleSync(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IWsSyncPayload,
  ) {
    const user = client.data.user;
    if (!user || !payload?.conversationId) return;

    // Rate limit sync requests (max 20 per 10 seconds)
    const rate = await this.redis.checkRateLimit(`ws:sync:${user.id}`, 20, 10);
    if (!rate.allowed) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'RATE_LIMIT_EXCEEDED', message: 'Sync rate limit exceeded.' });
      return;
    }

    const convId = toConversationId(payload.conversationId);
    const isMember = await this.db.isUserInConversation(convId, user.id);
    if (!isMember) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'FORBIDDEN', message: 'Not a member of this conversation' });
      return;
    }

    const messages = await this.db.getMessages(convId);
    client.join(`conv_${convId}`);
    client.data.activeConversationId = convId;

    // Include any pending save request targeting this user for reconnect sync
    let pendingSaveRequest: IWsSaveRequestReceivedPayload | undefined;
    const pendingReq = await this.db.getPendingSaveRequestForConversation(convId, user.id);
    if (pendingReq) {
      const requester = await this.db.findUserById(pendingReq.requesterUserId);
      if (requester) {
        pendingSaveRequest = {
          requestId: pendingReq.id,
          conversationId: convId,
          requesterDisplayName: requester.displayName,
          createdAt: pendingReq.createdAt,
        };
      }
    }

    const syncResp: IWsSyncCompletedPayload = {
      conversationId: convId,
      messages,
      hasMore: false,
      pendingSaveRequest,
    };
    client.emit(WsServerEvents.SYNC_COMPLETED, syncResp);
  }

  @SubscribeMessage(WsClientEvents.HEARTBEAT)
  async handleHeartbeat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IWsHeartbeatPayload,
  ) {
    client.emit('heartbeat:ack', {
      clientTimestamp: payload.clientTimestamp,
      serverTimestamp: Date.now(),
    });
  }

  // --- 9. Mutual Save Request ---

  /**
   * User A initiates a save request toward User B.
   * Idempotent: returns existing pending request if one exists.
   * Authorization: verified member of conversation, not blocked.
   */
  @SubscribeMessage(WsClientEvents.SAVE_REQUEST)
  async handleSaveRequest(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IWsSaveRequestPayload,
  ) {
    const user = client.data.user;
    if (!user || !payload?.conversationId) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'UNAUTHORIZED', message: 'Authentication required to save' });
      return;
    }

    const convId = toConversationId(payload.conversationId);
    const conv = await this.db.findConversationById(convId);
    if (!conv || conv.status === 'ended' || conv.status === 'deleted') {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'FORBIDDEN', message: 'Conversation is not active' });
      return;
    }

    const isMember = await this.db.isUserInConversation(convId, user.id);
    if (!isMember) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'FORBIDDEN', message: 'Not a member of this conversation' });
      return;
    }

    const members = await this.db.getConversationMembers(convId);
    const partnerMember = members.find((m) => m.userId !== user.id);
    if (!partnerMember) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'FORBIDDEN', message: 'No partner in this conversation' });
      return;
    }

    // Block check
    if (await this.db.isBlocked(user.id, partnerMember.userId)) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'FORBIDDEN', message: 'Cannot save: user is blocked' });
      return;
    }

    // Create or return existing save request (idempotent)
    const saveReq = await this.db.createOrGetSaveRequest(convId, user.id, partnerMember.userId);

    // If already accepted, notify requester
    if (saveReq.status === 'accepted') {
      const acceptPayload: IWsSaveAcceptedPayload = {
        requestId: saveReq.id,
        conversationId: convId,
        isSelfAccept: false,
      };
      client.emit(WsServerEvents.SAVE_ACCEPTED, acceptPayload);
      return;
    }

    // Notify the partner (target) about the incoming save request
    const notifyPayload: IWsSaveRequestReceivedPayload = {
      requestId: saveReq.id,
      conversationId: convId,
      requesterDisplayName: user.displayName,
      createdAt: saveReq.createdAt,
    };

    // Emit to all sockets of the target user in this conversation room
    client.to(`conv_${convId}`).emit(WsServerEvents.SAVE_REQUEST_RECEIVED, notifyPayload);

    // Also notify via Redis pub/sub for cross-node delivery
    const targetSocketIds = await this.redis.getUserSockets(partnerMember.userId);
    for (const sid of targetSocketIds) {
      if (sid !== client.id) {
        this.server.to(sid).emit(WsServerEvents.SAVE_REQUEST_RECEIVED, notifyPayload);
      }
    }

    this.logger.log(`Save request ${saveReq.id}: ${user.displayName} → ${partnerMember.userId} in conv ${convId}`);
  }

  /**
   * User B responds to a pending save request (accept or decline).
   * Authorization: only the target user of the request may respond.
   * On accept: both users' saved_connections are created atomically.
   */
  @SubscribeMessage(WsClientEvents.SAVE_RESPOND)
  async handleSaveRespond(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IWsSaveRespondPayload,
  ) {
    const user = client.data.user;
    if (!user || !payload?.conversationId || !payload?.response) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }

    if (payload.response !== 'accepted' && payload.response !== 'declined') {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'INVALID_PAYLOAD', message: 'Invalid response value' });
      return;
    }

    const convId = toConversationId(payload.conversationId);
    const isMember = await this.db.isUserInConversation(convId, user.id);
    if (!isMember) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'FORBIDDEN', message: 'Not a member of this conversation' });
      return;
    }

    // Find the pending save request where this user is the target
    const pendingReq = await this.db.getPendingSaveRequestForConversation(convId, user.id);
    if (!pendingReq) {
      // No pending request for this user — could already be responded to (idempotent)
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'NOT_FOUND', message: 'No pending save request found' });
      return;
    }

    const updated = await this.db.respondToSaveRequest(pendingReq.id, user.id, payload.response);
    if (!updated) {
      client.emit(WsServerEvents.CHAT_ERROR, { code: 'FORBIDDEN', message: 'Cannot respond to this save request' });
      return;
    }

    if (payload.response === 'accepted') {
      const acceptPayloadForAccepter: IWsSaveAcceptedPayload = {
        requestId: updated.id,
        conversationId: convId,
        isSelfAccept: true,
      };
      const acceptPayloadForRequester: IWsSaveAcceptedPayload = {
        requestId: updated.id,
        conversationId: convId,
        isSelfAccept: false,
      };

      // Notify accepter (User B)
      client.emit(WsServerEvents.SAVE_ACCEPTED, acceptPayloadForAccepter);
      // Notify requester (User A) via room broadcast
      client.to(`conv_${convId}`).emit(WsServerEvents.SAVE_ACCEPTED, acceptPayloadForRequester);

      // Cross-node: also emit to requester's sockets directly
      const requesterSocketIds = await this.redis.getUserSockets(updated.requesterUserId);
      for (const sid of requesterSocketIds) {
        this.server.to(sid).emit(WsServerEvents.SAVE_ACCEPTED, acceptPayloadForRequester);
      }

      this.logger.log(`Save request ${updated.id} ACCEPTED in conv ${convId}`);
    } else {
      const declinePayload: IWsSaveDeclinedPayload = {
        requestId: updated.id,
        conversationId: convId,
      };
      // Notify both users
      client.emit(WsServerEvents.SAVE_DECLINED, declinePayload);
      client.to(`conv_${convId}`).emit(WsServerEvents.SAVE_DECLINED, declinePayload);

      const requesterSocketIds = await this.redis.getUserSockets(updated.requesterUserId);
      for (const sid of requesterSocketIds) {
        this.server.to(sid).emit(WsServerEvents.SAVE_DECLINED, declinePayload);
      }

      this.logger.log(`Save request ${updated.id} DECLINED in conv ${convId}`);
    }
  }

  /**
   * Emits a save:deleted realtime event to the partner when one user deletes the saved chat.
   * Called from the ConversationsController after successful bilateral deletion.
   */
  async notifySaveDeleted(
    conversationId: ConversationId,
    deletedByDisplayName: string,
    otherUserId: string | null,
  ): Promise<void> {
    const deletePayload: IWsSaveDeletedPayload = {
      conversationId,
      deletedByDisplayName,
    };
    this.server.to(`conv_${conversationId}`).emit(WsServerEvents.SAVE_DELETED, deletePayload);

    if (otherUserId) {
      const otherSocketIds = await this.redis.getUserSockets(toUserId(otherUserId));
      for (const sid of otherSocketIds) {
        this.server.to(sid).emit(WsServerEvents.SAVE_DELETED, deletePayload);
      }
    }
  }
}

