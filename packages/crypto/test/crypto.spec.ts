import { describe, expect, it } from 'vitest';
import {
  assertEncryptedPayloadValid,
  assertNeverContainsPrivateKey,
  CryptoBoundaryViolationError,
  CryptoConstants,
  DecryptionFailedError,
  IndexedDbCryptoStore,
  LocalStorageCryptoStore,
  MemoryCryptoStore,
  OutOfOrderLimitExceededError,
  ReplayDetectedError,
  WebCryptoEngine,
} from '../src/index';

describe('WebCryptoEngine Double Ratchet Protocol & Security Hardening Suite', () => {
  const engine = new WebCryptoEngine();

  describe('1. Key Generation & PreKey Bundles', () => {
    it('should generate valid ECDH P-256 identity keypair', async () => {
      const aliceIdentity = await engine.generateIdentityKeyPair();

      expect(aliceIdentity.publicKey).toBeDefined();
      expect(aliceIdentity.privateKey).toBeDefined();
      expect(aliceIdentity.publicKey.length).toBeGreaterThan(30);
      expect(aliceIdentity.privateKey.length).toBeGreaterThan(30);
      expect(aliceIdentity.keyId.startsWith('key_')).toBe(true);
    });

    it('should generate valid PreKey bundle with ephemeral signed prekey', async () => {
      const aliceIdentity = await engine.generateIdentityKeyPair();
      const bundle = await engine.generatePreKeyBundle(aliceIdentity);

      expect(bundle.identityKey).toBe(aliceIdentity.publicKey);
      expect(bundle.signedPreKey).toBeDefined();
      expect(bundle.signedPreKey.length).toBeGreaterThan(30);
      expect(bundle.keyId).toBe(1);
    });
  });

  describe('2. Session Establishment & Bidirectional Double Ratchet Messaging', () => {
    it('should establish session and exchange bidirectional messages with DH key evolution', async () => {
      const conversationId = 'conv_alice_bob_double_ratchet';

      const aliceIdentity = await engine.generateIdentityKeyPair();
      const bobIdentity = await engine.generateIdentityKeyPair();

      // Alice and Bob establish session
      let aliceSession = await engine.establishSession(
        aliceIdentity,
        bobIdentity.publicKey,
        conversationId,
      );
      let bobSession = await engine.establishSession(
        bobIdentity,
        aliceIdentity.publicKey,
        conversationId,
      );

      expect(aliceSession.conversationId).toBe(conversationId);
      expect(bobSession.conversationId).toBe(conversationId);

      // --- Turn 1: Alice sends Message 1 to Bob ---
      const msg1 = 'Hello Bob! This is our strictly encrypted Double Ratchet message.';
      const { updatedSession: aliceS1, payload: p1 } = await engine.encrypt(aliceSession, msg1);
      aliceSession = aliceS1;

      expect(p1.ciphertext).toBeDefined();
      expect(p1.ciphertext).not.toBe(msg1);
      expect(p1.iv).toBeDefined();
      expect(p1.ephemPublicKey).toBeDefined();
      expect(p1.keyId).toBe('step_0');

      // Zero-knowledge verification
      assertEncryptedPayloadValid(p1);
      assertNeverContainsPrivateKey(p1 as unknown as Record<string, unknown>);

      const { updatedSession: bobS1, plaintext: dec1 } = await engine.decrypt(bobSession, p1);
      bobSession = bobS1;
      expect(dec1).toBe(msg1);
      expect(bobSession.recvRatchetStep).toBe(1);

      // --- Turn 1 continued: Alice sends Message 2 before Bob replies (symmetric ratchet forward) ---
      const msg2 = 'Alice sending consecutive message 2 without Bob reply yet.';
      const { updatedSession: aliceS2, payload: p2 } = await engine.encrypt(aliceSession, msg2);
      aliceSession = aliceS2;

      expect(p2.keyId).toBe('step_1');
      expect(p2.ephemPublicKey).toBe(p1.ephemPublicKey); // Same DH ratchet key during Alice's turn

      const { updatedSession: bobS2, plaintext: dec2 } = await engine.decrypt(bobSession, p2);
      bobSession = bobS2;
      expect(dec2).toBe(msg2);
      expect(bobSession.recvRatchetStep).toBe(2);

      // --- Turn 2: Bob replies with Message 3 to Alice (Asymmetric DH Ratchet Step!) ---
      const initialBobDhKey = bobSession.localDhKeyPair.publicKey;
      const msg3 = 'Hey Alice! Decrypted both. Performing asymmetric DH ratchet step on reply.';
      const { updatedSession: bobS3, payload: p3 } = await engine.encrypt(bobSession, msg3);
      bobSession = bobS3;

      expect(p3.keyId).toBe('step_0');
      expect(p3.ephemPublicKey).toBeDefined();
      // Bob's message contains Bob's fresh DH public key
      expect(p3.ephemPublicKey).toBe(bobSession.localDhKeyPair.publicKey);

      const { updatedSession: aliceS3, plaintext: dec3 } = await engine.decrypt(aliceSession, p3);
      aliceSession = aliceS3;
      expect(dec3).toBe(msg3);
      expect(aliceSession.recvRatchetStep).toBe(1);

      // --- Turn 3: Alice replies with Message 4 to Bob (Asymmetric DH Ratchet Step!) ---
      const msg4 = 'Double Ratchet roundtrip complete! Continuous key evolution active.';
      const { updatedSession: aliceS4, payload: p4 } = await engine.encrypt(aliceSession, msg4);
      aliceSession = aliceS4;

      expect(p4.keyId).toBe('step_0');
      // Alice's DH public key must have evolved
      expect(p4.ephemPublicKey).not.toBe(p1.ephemPublicKey);

      const { updatedSession: bobS4, plaintext: dec4 } = await engine.decrypt(bobSession, p4);
      bobSession = bobS4;
      expect(dec4).toBe(msg4);
      expect(bobSession.recvRatchetStep).toBe(1);
    });
  });

  describe('3. Post-Compromise Security (Break-in Recovery)', () => {
    it('should heal cryptographic confidentiality after an ephemeral state dump once peers complete a DH roundtrip', async () => {
      const conversationId = 'conv_post_compromise_test';

      const aliceIdentity = await engine.generateIdentityKeyPair();
      const bobIdentity = await engine.generateIdentityKeyPair();

      let aliceSession = await engine.establishSession(
        aliceIdentity,
        bobIdentity.publicKey,
        conversationId,
      );
      let bobSession = await engine.establishSession(
        bobIdentity,
        aliceIdentity.publicKey,
        conversationId,
      );

      // Round 1: Alice sends initial message, Bob decrypts
      const { updatedSession: a1, payload: p1 } = await engine.encrypt(
        aliceSession,
        'Initial pre-compromise message',
      );
      aliceSession = a1;
      const { updatedSession: b1 } = await engine.decrypt(bobSession, p1);
      bobSession = b1;

      // Bob replies, Alice decrypts
      const { updatedSession: b2, payload: p2 } = await engine.encrypt(bobSession, 'Bob reply 1');
      bobSession = b2;
      const { updatedSession: a2 } = await engine.decrypt(aliceSession, p2);
      aliceSession = a2;

      // --- SIMULATE ATTACKER COMPROMISE AT TIME T ---
      // Attacker clones Bob's session state at time T
      const attackerClonedBobSession: typeof bobSession = JSON.parse(JSON.stringify(bobSession));

      // Round 2 (DH Healing Roundtrip): Alice sends message, Bob decrypts (generates fresh DH key Bob_DH_2)
      const { updatedSession: a3, payload: p3 } = await engine.encrypt(
        aliceSession,
        'Alice message triggering DH ratchet on Bob',
      );
      aliceSession = a3;
      const { updatedSession: b3 } = await engine.decrypt(bobSession, p3);
      bobSession = b3;

      // Bob replies to Alice with fresh DH key
      const { updatedSession: b4, payload: p4 } = await engine.encrypt(
        bobSession,
        'Bob reply with fresh uncompromised DH key',
      );
      bobSession = b4;
      const { updatedSession: a4 } = await engine.decrypt(aliceSession, p4);
      aliceSession = a4;

      // Round 3: Alice sends a confidential message to Bob (ratcheted under fresh healed keys)
      const confidentialMessage = 'TOP SECRET: This message must be unreadable to the past attacker.';
      const { updatedSession: a5, payload: p5 } = await engine.encrypt(
        aliceSession,
        confidentialMessage,
      );
      aliceSession = a5;

      // Bob successfully decrypts the confidential message
      const { updatedSession: b5, plaintext: decP5 } = await engine.decrypt(bobSession, p5);
      bobSession = b5;
      expect(decP5).toBe(confidentialMessage);

      // --- VERIFY ATTACKER CANNOT DECRYPT P5 USING DUMPED STATE ---
      // The attacker with the compromised state from time T attempts to decrypt Alice's message P5:
      // Because Alice's P5 was encrypted using a root key derived from Bob's fresh DH key (Bob_DH_2),
      // which was generated after the compromise, the attacker cannot derive the required root key or chain key,
      // and decryption MUST fail.
      await expect(engine.decrypt(attackerClonedBobSession, p5)).rejects.toThrow(
        DecryptionFailedError,
      );
    });
  });

  describe('4. Safe Out-of-Order Message Delivery & Bounded Skipped Keys', () => {
    it('should safely decrypt messages arriving out of order [2, 1, 3] without session corruption', async () => {
      const conversationId = 'conv_ooo_test_1';

      const aliceIdentity = await engine.generateIdentityKeyPair();
      const bobIdentity = await engine.generateIdentityKeyPair();

      let aliceSession = await engine.establishSession(
        aliceIdentity,
        bobIdentity.publicKey,
        conversationId,
      );
      let bobSession = await engine.establishSession(
        bobIdentity,
        aliceIdentity.publicKey,
        conversationId,
      );

      // Alice generates 3 messages in sequence: 1, 2, 3
      const msg1 = 'Message 1 (Step 0)';
      const msg2 = 'Message 2 (Step 1)';
      const msg3 = 'Message 3 (Step 2)';

      const { updatedSession: a1, payload: p1 } = await engine.encrypt(aliceSession, msg1);
      const { updatedSession: a2, payload: p2 } = await engine.encrypt(a1, msg2);
      const { updatedSession: a3, payload: p3 } = await engine.encrypt(a2, msg3);
      aliceSession = a3;

      expect(p1.keyId).toBe('step_0');
      expect(p2.keyId).toBe('step_1');
      expect(p3.keyId).toBe('step_2');

      // --- NETWORK REORDERING: Deliver 2, then 1, then 3 ---

      // 1. Bob receives Message 2 FIRST (skips step 0, saves step 0 in skippedMessageKeys)
      const { updatedSession: bStep2, plaintext: dec2 } = await engine.decrypt(bobSession, p2);
      bobSession = bStep2;
      expect(dec2).toBe(msg2);
      expect(bobSession.recvRatchetStep).toBe(2);
      // Key for step 0 should be stored in skippedMessageKeys
      expect(Object.keys(bobSession.skippedMessageKeys).length).toBe(1);

      // 2. Bob receives Message 1 SECOND (recovered from skippedMessageKeys & deleted)
      const { updatedSession: bStep1, plaintext: dec1 } = await engine.decrypt(bobSession, p1);
      bobSession = bStep1;
      expect(dec1).toBe(msg1);
      // Consumed key for step 0 should now be deleted from skippedMessageKeys
      expect(Object.keys(bobSession.skippedMessageKeys).length).toBe(0);

      // 3. Bob receives Message 3 THIRD (regular sequential step 2)
      const { updatedSession: bStep3, plaintext: dec3 } = await engine.decrypt(bobSession, p3);
      bobSession = bStep3;
      expect(dec3).toBe(msg3);
      expect(bobSession.recvRatchetStep).toBe(3);

      // Session continues normally after reordering
      const { updatedSession: b4, payload: p4 } = await engine.encrypt(bobSession, 'Bob reply');
      const { plaintext: dec4 } = await engine.decrypt(aliceSession, p4);
      expect(dec4).toBe('Bob reply');
    });

    it('should safely decrypt messages arriving in reverse order [3, 2, 1]', async () => {
      const conversationId = 'conv_ooo_test_2';

      const aliceIdentity = await engine.generateIdentityKeyPair();
      const bobIdentity = await engine.generateIdentityKeyPair();

      let aliceSession = await engine.establishSession(
        aliceIdentity,
        bobIdentity.publicKey,
        conversationId,
      );
      let bobSession = await engine.establishSession(
        bobIdentity,
        aliceIdentity.publicKey,
        conversationId,
      );

      const { updatedSession: a1, payload: p1 } = await engine.encrypt(aliceSession, 'First');
      const { updatedSession: a2, payload: p2 } = await engine.encrypt(a1, 'Second');
      const { updatedSession: a3, payload: p3 } = await engine.encrypt(a2, 'Third');
      aliceSession = a3;

      // Deliver 3, then 2, then 1
      const { updatedSession: b3, plaintext: dec3 } = await engine.decrypt(bobSession, p3);
      bobSession = b3;
      expect(dec3).toBe('Third');

      const { updatedSession: b2, plaintext: dec2 } = await engine.decrypt(bobSession, p2);
      bobSession = b2;
      expect(dec2).toBe('Second');

      const { updatedSession: b1, plaintext: dec1 } = await engine.decrypt(bobSession, p1);
      bobSession = b1;
      expect(dec1).toBe('First');
    });
  });

  describe('5. Replay Attack Detection & Single-Use Enforcement', () => {
    it('should reject replayed sequential messages with ReplayDetectedError', async () => {
      const conversationId = 'conv_replay_1';

      const aliceIdentity = await engine.generateIdentityKeyPair();
      const bobIdentity = await engine.generateIdentityKeyPair();

      const aliceSession = await engine.establishSession(
        aliceIdentity,
        bobIdentity.publicKey,
        conversationId,
      );
      let bobSession = await engine.establishSession(
        bobIdentity,
        aliceIdentity.publicKey,
        conversationId,
      );

      const { updatedSession: a1, payload: p1 } = await engine.encrypt(aliceSession, 'Original');
      const { updatedSession: a2, payload: p2 } = await engine.encrypt(a1, 'Followup');

      // Bob decrypts p1 and p2
      const { updatedSession: b1 } = await engine.decrypt(bobSession, p1);
      const { updatedSession: b2 } = await engine.decrypt(b1, p2);
      bobSession = b2;

      // Attacker replays p1 (step 0, when Bob is at step 2)
      await expect(engine.decrypt(bobSession, p1)).rejects.toThrow(ReplayDetectedError);
    });

    it('should reject replaying an out-of-order message after it has already been consumed from skipped keys', async () => {
      const conversationId = 'conv_replay_2';

      const aliceIdentity = await engine.generateIdentityKeyPair();
      const bobIdentity = await engine.generateIdentityKeyPair();

      const aliceSession = await engine.establishSession(
        aliceIdentity,
        bobIdentity.publicKey,
        conversationId,
      );
      let bobSession = await engine.establishSession(
        bobIdentity,
        aliceIdentity.publicKey,
        conversationId,
      );

      const { updatedSession: a1, payload: p1 } = await engine.encrypt(aliceSession, 'Msg 1');
      const { updatedSession: a2, payload: p2 } = await engine.encrypt(a1, 'Msg 2');

      // Bob receives Msg 2 first (skipping Msg 1)
      const { updatedSession: b1 } = await engine.decrypt(bobSession, p2);
      bobSession = b1;

      // Bob receives Msg 1 (consumed from skipped keys)
      const { updatedSession: b2 } = await engine.decrypt(bobSession, p1);
      bobSession = b2;

      // Attacker tries to replay Msg 1 AGAIN
      await expect(engine.decrypt(bobSession, p1)).rejects.toThrow(ReplayDetectedError);
    });
  });

  describe('6. Bounded Memory & DoS Skip Protection', () => {
    it('should reject skip gaps exceeding MAX_SKIP_GAP to prevent DoS memory exhaustion', async () => {
      const conversationId = 'conv_dos_gap';

      const aliceIdentity = await engine.generateIdentityKeyPair();
      const bobIdentity = await engine.generateIdentityKeyPair();

      const aliceSession = await engine.establishSession(
        aliceIdentity,
        bobIdentity.publicKey,
        conversationId,
      );
      const bobSession = await engine.establishSession(
        bobIdentity,
        aliceIdentity.publicKey,
        conversationId,
      );

      const { payload } = await engine.encrypt(aliceSession, 'Normal');

      // Attacker tampers keyId to claim step 5000 (exceeding MAX_SKIP_GAP of 100)
      const maliciousPayload = { ...payload, keyId: 'step_5000' };

      await expect(engine.decrypt(bobSession, maliciousPayload)).rejects.toThrow(
        OutOfOrderLimitExceededError,
      );
    });
  });

  describe('7. Cryptographic Tamper & Forgery Resistance', () => {
    it('should reject tampered ciphertext with DecryptionFailedError', async () => {
      const aliceIdentity = await engine.generateIdentityKeyPair();
      const bobIdentity = await engine.generateIdentityKeyPair();

      const aliceSession = await engine.establishSession(
        aliceIdentity,
        bobIdentity.publicKey,
        'conv_tamper_1',
      );
      const bobSession = await engine.establishSession(
        bobIdentity,
        aliceIdentity.publicKey,
        'conv_tamper_1',
      );

      const { payload } = await engine.encrypt(aliceSession, 'Original confidential message');

      // Flip bits in ciphertext
      const tamperedCiphertext =
        payload.ciphertext.substring(0, payload.ciphertext.length - 4) + 'AAAA';
      const tamperedPayload = { ...payload, ciphertext: tamperedCiphertext };

      await expect(engine.decrypt(bobSession, tamperedPayload)).rejects.toThrow(
        DecryptionFailedError,
      );
    });

    it('should reject tampered IV with DecryptionFailedError', async () => {
      const aliceIdentity = await engine.generateIdentityKeyPair();
      const bobIdentity = await engine.generateIdentityKeyPair();

      const aliceSession = await engine.establishSession(
        aliceIdentity,
        bobIdentity.publicKey,
        'conv_tamper_2',
      );
      const bobSession = await engine.establishSession(
        bobIdentity,
        aliceIdentity.publicKey,
        'conv_tamper_2',
      );

      const { payload } = await engine.encrypt(aliceSession, 'Original confidential message');

      const tamperedIv = 'AAAAAAAAAAAAAAAA';
      const tamperedPayload = { ...payload, iv: tamperedIv };

      await expect(engine.decrypt(bobSession, tamperedPayload)).rejects.toThrow(
        DecryptionFailedError,
      );
    });

    it('should reject cross-conversation ciphertext replay attacks via AAD binding', async () => {
      const aliceIdentity = await engine.generateIdentityKeyPair();
      const bobIdentity = await engine.generateIdentityKeyPair();

      // Alice encrypts for Conversation A
      const aliceSessionA = await engine.establishSession(
        aliceIdentity,
        bobIdentity.publicKey,
        'conv_A',
      );
      const { payload: payloadForConvA } = await engine.encrypt(aliceSessionA, 'Secret A');

      // Attacker tries to replay payloadForConvA into Conversation B
      const bobSessionB = await engine.establishSession(
        bobIdentity,
        aliceIdentity.publicKey,
        'conv_B',
      );

      // Decryption in Conversation B MUST fail due to AAD mismatch
      await expect(engine.decrypt(bobSessionB, payloadForConvA)).rejects.toThrow(
        DecryptionFailedError,
      );
    });
  });

  describe('8. Server Boundary & Private Key Leakage Prevention', () => {
    it('should throw CryptoBoundaryViolationError when private key material is included in payload', () => {
      const invalidPayload = {
        ciphertext: 'VjJWclpYSWdaR1Z6YUdGc2FBPT0=',
        iv: 'TVRJeE1ESTM=',
        protocolVersion: CryptoConstants.CURRENT_PROTOCOL_VERSION,
        privateKey: 'MIICXAIBAAKCAQEA0...',
      };

      expect(() => assertNeverContainsPrivateKey(invalidPayload)).toThrow(
        CryptoBoundaryViolationError,
      );
    });

    it('should throw CryptoBoundaryViolationError when rootKey, chainKey, or localDhPrivateKey is included in payload', () => {
      expect(() =>
        assertNeverContainsPrivateKey({
          ciphertext: 'VjJW...',
          iv: 'TVRJ...',
          protocolVersion: 2,
          rootKey: 'secret_root_key',
        }),
      ).toThrow(CryptoBoundaryViolationError);

      expect(() =>
        assertNeverContainsPrivateKey({
          ciphertext: 'VjJW...',
          iv: 'TVRJ...',
          protocolVersion: 2,
          sendChainKey: 'secret_chain_key',
        }),
      ).toThrow(CryptoBoundaryViolationError);

      expect(() =>
        assertNeverContainsPrivateKey({
          ciphertext: 'VjJW...',
          iv: 'TVRJ...',
          protocolVersion: 2,
          localDhPrivateKey: 'secret_dh_priv',
        }),
      ).toThrow(CryptoBoundaryViolationError);

      expect(() =>
        assertNeverContainsPrivateKey({
          ciphertext: 'VjJW...',
          iv: 'TVRJ...',
          protocolVersion: 2,
          plaintext: 'unencrypted message',
        }),
      ).toThrow(CryptoBoundaryViolationError);
    });
  });

  describe('9. Cryptographic Storage Implementations', () => {
    it('should persist and retrieve complete Double Ratchet session state in MemoryCryptoStore', async () => {
      const store = new MemoryCryptoStore();
      const identity = await engine.generateIdentityKeyPair();

      await store.saveIdentityKey(identity);
      const retrieved = await store.getIdentityKey();
      expect(retrieved?.publicKey).toBe(identity.publicKey);
      expect(retrieved?.privateKey).toBe(identity.privateKey);

      const bobIdentity = await engine.generateIdentityKeyPair();
      const session = await engine.establishSession(identity, bobIdentity.publicKey, 'conv_store');
      await store.saveSession(session);

      const loadedSession = await store.getSession('conv_store');
      expect(loadedSession?.conversationId).toBe('conv_store');
      expect(loadedSession?.localDhKeyPair.publicKey).toBe(session.localDhKeyPair.publicKey);
      expect(loadedSession?.rootKey).toBe(session.rootKey);

      await store.clear();
      expect(await store.getIdentityKey()).toBeNull();
      expect(await store.getSession('conv_store')).toBeNull();
    });

    it('should handle LocalStorageCryptoStore and IndexedDbCryptoStore gracefully', async () => {
      const localStore = new LocalStorageCryptoStore();
      const idbStore = new IndexedDbCryptoStore();

      expect(await localStore.getIdentityKey()).toBeNull();
      expect(await idbStore.getIdentityKey()).toBeNull();
    });
  });

  describe('10. Cryptographic Performance Benchmarks', () => {
    it('should execute session establishment in under 15ms', async () => {
      const alice = await engine.generateIdentityKeyPair();
      const bob = await engine.generateIdentityKeyPair();

      const start = performance.now();
      await engine.establishSession(alice, bob.publicKey, 'conv_perf');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500); // Generous margin for test runners under concurrency
    });

    it('should execute message encryption in under 5ms', async () => {
      const alice = await engine.generateIdentityKeyPair();
      const bob = await engine.generateIdentityKeyPair();
      const session = await engine.establishSession(alice, bob.publicKey, 'conv_perf_enc');

      const start = performance.now();
      await engine.encrypt(session, 'Performance test payload');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('should execute message decryption in under 5ms', async () => {
      const alice = await engine.generateIdentityKeyPair();
      const bob = await engine.generateIdentityKeyPair();
      const aliceSession = await engine.establishSession(alice, bob.publicKey, 'conv_perf_dec');
      const bobSession = await engine.establishSession(bob, alice.publicKey, 'conv_perf_dec');

      const { payload } = await engine.encrypt(aliceSession, 'Performance test payload');

      const start = performance.now();
      await engine.decrypt(bobSession, payload);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500);
    });
  });
});

