import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PersistenceModule } from '../src/persistence/persistence.module';
import { DatabaseService } from '../src/persistence/database.service';
import { MatchmakingService } from '../src/matchmaking/matchmaking.service';
import { ChatGateway } from '../src/realtime/chat.gateway';
import configuration from '../src/config/configuration';
import {
  IWsChatSendPayload,
  IWsSyncPayload,
  toConversationId,
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

describe('Realtime WebSocket Security & Attack Resistance Suite', () => {
  let gateway: ChatGateway;
  let db: DatabaseService;

  it('should initialize ChatGateway and dependencies', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        PersistenceModule,
        JwtModule.register({ secret: 'test_sec_jwt_secret', signOptions: { expiresIn: '1d' } }),
      ],
      providers: [ChatGateway, MatchmakingService],
    }).compile();

    gateway = moduleRef.get<ChatGateway>(ChatGateway);
    db = moduleRef.get<DatabaseService>(DatabaseService);

    // Mock socket.io server
    (gateway as unknown as { server: unknown }).server = {
      sockets: {
        sockets: new Map(),
      },
      to: () => ({ emit: () => true }),
    };

    expect(gateway).toBeDefined();
    expect(db).toBeDefined();
  });

  it('should reject unauthenticated CHAT_SEND attempts with UNAUTHORIZED error', async () => {
    let emittedEvent = '';
    let emittedData: { code?: string; message?: string } | null = null;

    const unauthenticatedSocket: MockSocket = {
      id: 'sock_unauth_1',
      data: {},
      emit: (event: string, data: unknown) => {
        emittedEvent = event;
        emittedData = data as { code?: string; message?: string };
      },
    };

    const payload: IWsChatSendPayload = {
      clientMessageId: 'msg_client_1',
      conversationId: toConversationId('conv_123'),
      encryptedPayload: {
        ciphertext: 'VjJWclpYSWdaR1Z6YUdGc2FBPT0=',
        iv: 'TVRJeE1ESTM=',
        protocolVersion: 1,
      },
    };

    await gateway.handleChatSend(
      unauthenticatedSocket as unknown as Parameters<typeof gateway.handleChatSend>[0],
      payload,
    );

    expect(emittedEvent).toBe(WsServerEvents.CHAT_ERROR);
    expect(emittedData?.code).toBe('UNAUTHORIZED');
  });

  it('should reject unauthorized users attempting to send messages to private conversations they do not belong to', async () => {
    const attacker = await db.createUser('AttackerUser', 'guest');
    const victimA = await db.createUser('VictimA', 'guest');
    const victimB = await db.createUser('VictimB', 'guest');

    // Victims create private conversation
    const privateConv = await db.createConversation([victimA.id, victimB.id]);

    let emittedEvent = '';
    let emittedData: { code?: string; message?: string } | null = null;

    const attackerSocket: MockSocket = {
      id: 'sock_attacker_1',
      data: { user: attacker },
      emit: (event: string, data: unknown) => {
        emittedEvent = event;
        emittedData = data as { code?: string; message?: string };
      },
      to: () => ({ emit: () => true }),
    };

    const attackPayload: IWsChatSendPayload = {
      clientMessageId: 'msg_attack_1',
      conversationId: privateConv.id,
      encryptedPayload: {
        ciphertext: 'VjJWclpYSWdaR1Z6YUdGc2FBPT0=',
        iv: 'TVRJeE1ESTM=',
        protocolVersion: 1,
      },
    };

    await gateway.handleChatSend(
      attackerSocket as unknown as Parameters<typeof gateway.handleChatSend>[0],
      attackPayload,
    );

    expect(emittedEvent).toBe(WsServerEvents.CHAT_ERROR);
    expect(emittedData?.code).toBe('FORBIDDEN');
  });

  it('should reject oversized ciphertext payloads (>64KB) with INVALID_PAYLOAD', async () => {
    const alice = await db.createUser('Alice', 'guest');
    const bob = await db.createUser('Bob', 'guest');
    const conv = await db.createConversation([alice.id, bob.id]);

    let emittedEvent = '';
    let emittedData: { code?: string; message?: string } | null = null;

    const aliceSocket: MockSocket = {
      id: 'sock_alice_1',
      data: { user: alice },
      emit: (event: string, data: unknown) => {
        emittedEvent = event;
        emittedData = data as { code?: string; message?: string };
      },
      to: () => ({ emit: () => true }),
    };

    // Giant 100KB ciphertext payload
    const giantCiphertext = 'A'.repeat(100000);
    const oversizedPayload: IWsChatSendPayload = {
      clientMessageId: 'msg_oversized',
      conversationId: conv.id,
      encryptedPayload: {
        ciphertext: giantCiphertext,
        iv: 'TVRJeE1ESTM=',
        protocolVersion: 1,
      },
    };

    await gateway.handleChatSend(
      aliceSocket as unknown as Parameters<typeof gateway.handleChatSend>[0],
      oversizedPayload,
    );

    expect(emittedEvent).toBe(WsServerEvents.CHAT_ERROR);
    expect(emittedData?.code).toBe('INVALID_PAYLOAD');
  });

  it('should reject payloads containing forbidden private key material with INVALID_PAYLOAD', async () => {
    const alice = await db.createUser('Alice', 'guest');
    const bob = await db.createUser('Bob', 'guest');
    const conv = await db.createConversation([alice.id, bob.id]);

    let emittedEvent = '';
    let emittedData: { code?: string; message?: string } | null = null;

    const aliceSocket: MockSocket = {
      id: 'sock_alice_2',
      data: { user: alice },
      emit: (event: string, data: unknown) => {
        emittedEvent = event;
        emittedData = data as { code?: string; message?: string };
      },
      to: () => ({ emit: () => true }),
    };

    const leakingPayload = {
      clientMessageId: 'msg_leak_attempt',
      conversationId: conv.id,
      encryptedPayload: {
        ciphertext: 'VjJWclpYSWdaR1Z6YUdGc2FBPT0=',
        iv: 'TVRJeE1ESTM=',
        protocolVersion: 1,
        privateKey: 'SECRET_PRIVATE_KEY_NEVER_SEND_TO_SERVER',
      },
    } as unknown as IWsChatSendPayload;

    await gateway.handleChatSend(
      aliceSocket as unknown as Parameters<typeof gateway.handleChatSend>[0],
      leakingPayload,
    );

    expect(emittedEvent).toBe(WsServerEvents.CHAT_ERROR);
    expect(emittedData?.code).toBe('INVALID_PAYLOAD');
  });

  it('should reject unauthorized SYNC attempts to spy on other conversations', async () => {
    const intruder = await db.createUser('Intruder', 'guest');
    const userA = await db.createUser('UserA', 'guest');
    const userB = await db.createUser('UserB', 'guest');
    const privateConv = await db.createConversation([userA.id, userB.id]);

    let emittedEvent = '';
    let emittedData: { code?: string; message?: string } | null = null;

    const intruderSocket: MockSocket = {
      id: 'sock_intruder_1',
      data: { user: intruder },
      emit: (event: string, data: unknown) => {
        emittedEvent = event;
        emittedData = data as { code?: string; message?: string };
      },
      join: () => true,
    };

    const syncPayload: IWsSyncPayload = {
      conversationId: privateConv.id,
    };

    await gateway.handleSync(
      intruderSocket as unknown as Parameters<typeof gateway.handleSync>[0],
      syncPayload,
    );

    expect(emittedEvent).toBe(WsServerEvents.CHAT_ERROR);
    expect(emittedData?.code).toBe('FORBIDDEN');
  });
});
