import { IEncryptedPayload } from '@campus-stranger/shared-types';
import {
  assertEncryptedPayloadValid,
  assertNeverContainsPrivateKey,
  DecryptionFailedError,
  OutOfOrderLimitExceededError,
  ReplayDetectedError,
} from './boundary';
import { CryptoConstants } from './constants';
import {
  ICryptoEngine,
  IIdentityKeyPair,
  IKeyPair,
  IPreKeyBundle,
  ISessionState,
} from './types';

// Helper for cross-environment WebCrypto API access (Browser + Node 18+)
function getSubtleCrypto(): SubtleCrypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('Web Cryptography API (crypto.subtle) is unavailable in this environment.');
}

// ArrayBuffer <-> Base64 helpers
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

export function base64ToBuffer(base64: string): Uint8Array {
  if (typeof atob !== 'undefined') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export class WebCryptoEngine implements ICryptoEngine {
  private readonly subtle: SubtleCrypto;

  constructor() {
    this.subtle = getSubtleCrypto();
  }

  /**
   * Generates a persistent ECDH P-256 Identity Key Pair.
   */
  async generateIdentityKeyPair(): Promise<IIdentityKeyPair> {
    const keyPair = (await this.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: CryptoConstants.NAMED_CURVE,
      },
      true,
      ['deriveKey', 'deriveBits'],
    )) as CryptoKeyPair;

    const publicBuffer = await this.subtle.exportKey('spki', keyPair.publicKey);
    const privateBuffer = await this.subtle.exportKey('pkcs8', keyPair.privateKey);

    const keyId = `key_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return {
      keyId,
      publicKey: bufferToBase64(publicBuffer),
      privateKey: bufferToBase64(privateBuffer),
    };
  }

  /**
   * Generates a public PreKey bundle shareable via matchmaking.
   */
  async generatePreKeyBundle(identityKey: IIdentityKeyPair): Promise<IPreKeyBundle> {
    const signedPreKey = (await this.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: CryptoConstants.NAMED_CURVE,
      },
      true,
      ['deriveKey', 'deriveBits'],
    )) as CryptoKeyPair;

    const signedPreKeyPublic = await this.subtle.exportKey('spki', signedPreKey.publicKey);
    const signedPreKeyPublicBase64 = bufferToBase64(signedPreKeyPublic);

    return {
      identityKey: identityKey.publicKey,
      signedPreKey: signedPreKeyPublicBase64,
      signedPreKeySignature: bufferToBase64(new Uint8Array(32)),
      keyId: 1,
    };
  }

  /**
   * Derives a 256-bit ECDH shared secret from private key and remote public key.
   */
  async deriveEcdhSharedSecret(
    privateKeyBase64: string,
    publicKeyBase64: string,
  ): Promise<ArrayBuffer> {
    const privKey = await this.subtle.importKey(
      'pkcs8',
      base64ToBuffer(privateKeyBase64) as unknown as BufferSource,
      { name: 'ECDH', namedCurve: CryptoConstants.NAMED_CURVE },
      false,
      ['deriveBits'],
    );

    const pubKey = await this.subtle.importKey(
      'spki',
      base64ToBuffer(publicKeyBase64) as unknown as BufferSource,
      { name: 'ECDH', namedCurve: CryptoConstants.NAMED_CURVE },
      false,
      [],
    );

    return this.subtle.deriveBits(
      {
        name: 'ECDH',
        public: pubKey,
      },
      privKey,
      256,
    );
  }

  /**
   * Root KDF step: mixes a DH shared secret into the Root Key, deriving a new Root Key and a Chain Key.
   */
  async kdfRoot(
    rootKeyBase64: string,
    dhSecretBits: ArrayBuffer,
  ): Promise<{ newRootKey: string; newChainKey: string }> {
    const rawRootKey = base64ToBuffer(rootKeyBase64);
    const baseKey = await this.subtle.importKey(
      'raw',
      rawRootKey as unknown as BufferSource,
      { name: 'HKDF' },
      false,
      ['deriveBits'],
    );

    const encoder = new TextEncoder();
    const derived512Bits = await this.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(dhSecretBits) as unknown as BufferSource,
        info: encoder.encode('CampusStranger-DoubleRatchet-RootKDF') as unknown as BufferSource,
      },
      baseKey,
      512,
    );

    const bytes = new Uint8Array(derived512Bits);
    const newRootKey = bufferToBase64(bytes.subarray(0, 32));
    const newChainKey = bufferToBase64(bytes.subarray(32, 64));

    return { newRootKey, newChainKey };
  }

  /**
   * Chain KDF step: derives a message encryption key and ratchets the chain key forward (symmetric forward secrecy).
   */
  async kdfChain(
    chainKeyBase64: string,
  ): Promise<{ nextChainKey: string; messageKeyBase64: string }> {
    const rawChainKey = base64ToBuffer(chainKeyBase64);
    const baseKey = await this.subtle.importKey(
      'raw',
      rawChainKey as unknown as BufferSource,
      { name: 'HKDF' },
      false,
      ['deriveBits'],
    );

    const encoder = new TextEncoder();
    const derived512Bits = await this.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32) as unknown as BufferSource,
        info: encoder.encode('CampusStranger-DoubleRatchet-ChainKDF') as unknown as BufferSource,
      },
      baseKey,
      512,
    );

    const bytes = new Uint8Array(derived512Bits);
    const nextChainKey = bufferToBase64(bytes.subarray(0, 32));
    const messageKeyBase64 = bufferToBase64(bytes.subarray(32, 64));

    return { nextChainKey, messageKeyBase64 };
  }

  /**
   * Limits the size of the skipped message keys dictionary to prevent memory exhaustion attacks.
   */
  private trimSkippedKeys(keys: Record<string, string>): Record<string, string> {
    const entries = Object.entries(keys);
    if (entries.length <= CryptoConstants.MAX_SKIPPED_KEYS) {
      return keys;
    }
    const trimmed = entries.slice(entries.length - CryptoConstants.MAX_SKIPPED_KEYS);
    return Object.fromEntries(trimmed);
  }

  /**
   * Encrypts plaintext using a derived 256-bit AES-GCM message key and Authenticated Associated Data.
   */
  private async encryptWithKey(
    messageKeyBase64: string,
    plaintext: string,
    aadString: string,
  ): Promise<{ ciphertext: string; iv: string }> {
    const rawMsgKey = base64ToBuffer(messageKeyBase64);
    const msgKey = await this.subtle.importKey(
      'raw',
      rawMsgKey as unknown as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );

    const iv = new Uint8Array(12);
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(iv);
    } else {
      throw new Error('CSPRNG (crypto.getRandomValues) is unavailable.');
    }

    const encoder = new TextEncoder();
    const aad = encoder.encode(aadString) as unknown as BufferSource;
    const plaintextBytes = encoder.encode(plaintext) as unknown as BufferSource;

    const ciphertextBuffer = await this.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
        additionalData: aad,
      },
      msgKey,
      plaintextBytes,
    );

    return {
      ciphertext: bufferToBase64(ciphertextBuffer),
      iv: bufferToBase64(iv),
    };
  }

  /**
   * Decrypts ciphertext using a derived 256-bit AES-GCM message key and verifies Authenticated Associated Data.
   */
  private async decryptWithKey(
    messageKeyBase64: string,
    ciphertextBase64: string,
    ivBase64: string,
    aadString: string,
    errorContext: string,
  ): Promise<string> {
    const rawMsgKey = base64ToBuffer(messageKeyBase64);
    const msgKey = await this.subtle.importKey(
      'raw',
      rawMsgKey as unknown as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );

    const iv = base64ToBuffer(ivBase64) as unknown as BufferSource;
    const ciphertext = base64ToBuffer(ciphertextBase64) as unknown as BufferSource;
    const encoder = new TextEncoder();
    const aad = encoder.encode(aadString) as unknown as BufferSource;

    let decryptedBuffer: ArrayBuffer;
    try {
      decryptedBuffer = await this.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: aad,
        },
        msgKey,
        ciphertext,
      );
    } catch {
      throw new DecryptionFailedError(
        `Decryption failed for ${errorContext}. Authentication tag or AAD mismatch.`,
      );
    }

    return new TextDecoder().decode(decryptedBuffer);
  }

  /**
   * Establishes a Double Ratchet session between two parties using ECDH + HKDF.
   */
  async establishSession(
    myIdentity: IIdentityKeyPair,
    remotePublicKeyBase64: string,
    conversationId: string,
  ): Promise<ISessionState> {
    // Initial master shared secret via ECDH
    const sharedSecretBits = await this.deriveEcdhSharedSecret(
      myIdentity.privateKey,
      remotePublicKeyBase64,
    );

    const encoder = new TextEncoder();
    const salt = encoder.encode(
      `CampusStranger-DoubleRatchet-Salt-${conversationId}`,
    ) as unknown as BufferSource;

    const hkdfMasterKey = await this.subtle.importKey(
      'raw',
      sharedSecretBits as unknown as BufferSource,
      { name: 'HKDF' },
      false,
      ['deriveBits'],
    );

    const rootKeyBits = await this.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: encoder.encode('CampusStranger-DoubleRatchet-MasterRoot') as unknown as BufferSource,
      },
      hkdfMasterKey,
      256,
    );

    const rootKeyBase64 = bufferToBase64(rootKeyBits);

    // Both peers initialize session symmetrically with their identity keypair
    const localDhKeyPair: IKeyPair = {
      publicKey: myIdentity.publicKey,
      privateKey: myIdentity.privateKey,
    };

    return {
      conversationId,
      remoteIdentityKey: remotePublicKeyBase64,
      localDhKeyPair,
      remoteDhPublicKey: remotePublicKeyBase64,
      rootKey: rootKeyBase64,
      sendChainKey: null,
      recvChainKey: null,
      sendRatchetStep: 0,
      recvRatchetStep: 0,
      previousSendChainLength: 0,
      skippedMessageKeys: {},
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Initializes an outbound encrypted session (Sender initiating conversation).
   */
  async initOutboundSession(
    myIdentity: IIdentityKeyPair,
    recipientBundle: IPreKeyBundle,
    conversationId: string,
  ): Promise<{ session: ISessionState; initialMessagePayload?: IEncryptedPayload }> {
    const session = await this.establishSession(
      myIdentity,
      recipientBundle.identityKey,
      conversationId,
    );
    return { session };
  }

  /**
   * Initializes an inbound encrypted session (Receiver joining conversation).
   */
  async initInboundSession(
    myIdentity: IIdentityKeyPair,
    senderIdentityKey: string,
    _senderEphemeralKey: string,
    conversationId: string,
  ): Promise<ISessionState> {
    return this.establishSession(myIdentity, senderIdentityKey, conversationId);
  }

  /**
   * Encrypts plaintext message locally using Double Ratchet state (AES-256-GCM + AAD binding).
   */
  async encrypt(
    session: ISessionState,
    plaintext: string,
  ): Promise<{ updatedSession: ISessionState; payload: IEncryptedPayload }> {
    const currentSession: ISessionState = { ...session };

    // If sending chain is not yet established, generate fresh ephemeral DH keypair and derive initial send chain
    if (!currentSession.sendChainKey) {
      const freshLocalDh = await this.generateIdentityKeyPair();
      const freshDhKeyPair: IKeyPair = {
        publicKey: freshLocalDh.publicKey,
        privateKey: freshLocalDh.privateKey,
      };
      const dhOutput = await this.deriveEcdhSharedSecret(
        freshDhKeyPair.privateKey,
        currentSession.remoteDhPublicKey,
      );
      const { newRootKey, newChainKey } = await this.kdfRoot(currentSession.rootKey, dhOutput);
      currentSession.localDhKeyPair = freshDhKeyPair;
      currentSession.rootKey = newRootKey;
      currentSession.sendChainKey = newChainKey;
      currentSession.sendRatchetStep = 0;
    }

    const step = currentSession.sendRatchetStep;
    const { nextChainKey, messageKeyBase64 } = await this.kdfChain(currentSession.sendChainKey);

    const aad = `CampusStranger-AAD:${currentSession.conversationId}:${currentSession.localDhKeyPair.publicKey}:${step}`;
    const { ciphertext, iv } = await this.encryptWithKey(messageKeyBase64, plaintext, aad);

    const payload: IEncryptedPayload = {
      ciphertext,
      iv,
      ephemPublicKey: currentSession.localDhKeyPair.publicKey,
      protocolVersion: CryptoConstants.CURRENT_PROTOCOL_VERSION,
      keyId: `step_${step}`,
      previousChainLength: currentSession.previousSendChainLength,
    };

    assertEncryptedPayloadValid(payload);
    assertNeverContainsPrivateKey(payload as unknown as Record<string, unknown>);

    const updatedSession: ISessionState = {
      ...currentSession,
      sendChainKey: nextChainKey,
      sendRatchetStep: step + 1,
      updatedAt: new Date().toISOString(),
    };

    return { updatedSession, payload };
  }

  /**
   * Decrypts ciphertext message locally using Double Ratchet state (handling out-of-order skipped keys and DH ratchets).
   */
  async decrypt(
    session: ISessionState,
    payload: IEncryptedPayload,
  ): Promise<{ updatedSession: ISessionState; plaintext: string }> {
    assertEncryptedPayloadValid(payload);

    let step = 0;
    if (payload.keyId && payload.keyId.startsWith('step_')) {
      step = parseInt(payload.keyId.replace('step_', ''), 10);
      if (isNaN(step) || step < 0) step = 0;
    }

    const ratchetPub = payload.ephemPublicKey || session.remoteDhPublicKey;
    const skippedKeyId = `${ratchetPub}:${step}`;

    // 1. Check if message key was previously stored in skippedMessageKeys (out-of-order recovery)
    if (session.skippedMessageKeys && skippedKeyId in session.skippedMessageKeys) {
      const msgKey = session.skippedMessageKeys[skippedKeyId]!;
      const newSkipped = { ...session.skippedMessageKeys };
      delete newSkipped[skippedKeyId]; // Consumed: single-use replay protection

      const aad = `CampusStranger-AAD:${session.conversationId}:${ratchetPub}:${step}`;
      const plaintext = await this.decryptWithKey(
        msgKey,
        payload.ciphertext,
        payload.iv,
        aad,
        `conversation ${session.conversationId} skipped step ${step}`,
      );

      return {
        updatedSession: {
          ...session,
          skippedMessageKeys: newSkipped,
          updatedAt: new Date().toISOString(),
        },
        plaintext,
      };
    }

    let currentSession: ISessionState = {
      ...session,
      skippedMessageKeys: { ...session.skippedMessageKeys },
    };

    // 2. Check if a new ephemeral DH public key arrived (Asymmetric DH Ratchet Turn)
    const hasNewRemoteDhKey =
      payload.ephemPublicKey && payload.ephemPublicKey !== currentSession.remoteDhPublicKey;

    if (hasNewRemoteDhKey) {
      const newRemoteDhPub = payload.ephemPublicKey!;

      // Skip and derive any remaining unreceived messages in the PREVIOUS receiving chain
      if (currentSession.recvChainKey && payload.previousChainLength !== undefined) {
        const prevLen = payload.previousChainLength;
        if (prevLen > currentSession.recvRatchetStep) {
          const gap = prevLen - currentSession.recvRatchetStep;
          if (gap > CryptoConstants.MAX_SKIP_GAP) {
            throw new OutOfOrderLimitExceededError(
              `Previous chain skip gap of ${gap} exceeds threshold of ${CryptoConstants.MAX_SKIP_GAP}.`,
            );
          }
          let chain = currentSession.recvChainKey;
          for (let s = currentSession.recvRatchetStep; s < prevLen; s++) {
            const { nextChainKey, messageKeyBase64 } = await this.kdfChain(chain);
            currentSession.skippedMessageKeys[`${currentSession.remoteDhPublicKey}:${s}`] =
              messageKeyBase64;
            chain = nextChainKey;
          }
          currentSession.skippedMessageKeys = this.trimSkippedKeys(
            currentSession.skippedMessageKeys,
          );
        }
      }

      // Ephemeral DH Ratchet Step 1: Receiving DH (derive new receive chain key)
      const dhRecvOutput = await this.deriveEcdhSharedSecret(
        currentSession.localDhKeyPair.privateKey,
        newRemoteDhPub,
      );
      const { newRootKey: rootKey1, newChainKey: newRecvChainKey } = await this.kdfRoot(
        currentSession.rootKey,
        dhRecvOutput,
      );

      // Ephemeral DH Ratchet Step 2: Sending DH (generate fresh ephemeral keypair for next send turn)
      const freshLocalDh = await this.generateIdentityKeyPair();
      const freshLocalDhKeyPair: IKeyPair = {
        publicKey: freshLocalDh.publicKey,
        privateKey: freshLocalDh.privateKey,
      };
      const dhSendOutput = await this.deriveEcdhSharedSecret(
        freshLocalDhKeyPair.privateKey,
        newRemoteDhPub,
      );
      const { newRootKey: rootKey2, newChainKey: newSendChainKey } = await this.kdfRoot(
        rootKey1,
        dhSendOutput,
      );

      currentSession = {
        ...currentSession,
        previousSendChainLength: currentSession.sendRatchetStep,
        sendRatchetStep: 0,
        recvRatchetStep: 0,
        remoteDhPublicKey: newRemoteDhPub,
        localDhKeyPair: freshLocalDhKeyPair,
        rootKey: rootKey2,
        sendChainKey: newSendChainKey,
        recvChainKey: newRecvChainKey,
      };
    }

    // If receive chain still not established, perform receiving DH
    if (!currentSession.recvChainKey) {
      const dhRecvOutput = await this.deriveEcdhSharedSecret(
        currentSession.localDhKeyPair.privateKey,
        currentSession.remoteDhPublicKey,
      );
      const { newRootKey, newChainKey } = await this.kdfRoot(
        currentSession.rootKey,
        dhRecvOutput,
      );
      currentSession.rootKey = newRootKey;
      currentSession.recvChainKey = newChainKey;
      currentSession.recvRatchetStep = 0;
    }

    // 3. Replay / Duplicate protection check on current receiving chain
    if (step < currentSession.recvRatchetStep) {
      throw new ReplayDetectedError(
        `Replayed or duplicate message step ${step} (expected step >= ${currentSession.recvRatchetStep}).`,
      );
    }

    // 4. Skip gap within current receiving chain
    const skipGap = step - currentSession.recvRatchetStep;
    if (skipGap > CryptoConstants.MAX_SKIP_GAP) {
      throw new OutOfOrderLimitExceededError(
        `Step skip gap of ${skipGap} exceeds maximum allowable gap of ${CryptoConstants.MAX_SKIP_GAP}.`,
      );
    }

    // Derive and store skipped message keys for intermediate messages
    let chain = currentSession.recvChainKey!;
    while (currentSession.recvRatchetStep < step) {
      const { nextChainKey, messageKeyBase64 } = await this.kdfChain(chain);
      currentSession.skippedMessageKeys[`${ratchetPub}:${currentSession.recvRatchetStep}`] =
        messageKeyBase64;
      chain = nextChainKey;
      currentSession.recvRatchetStep++;
    }
    currentSession.skippedMessageKeys = this.trimSkippedKeys(currentSession.skippedMessageKeys);

    // Advance receive chain for current message
    const { nextChainKey: finalRecvChainKey, messageKeyBase64 } = await this.kdfChain(chain);
    currentSession.recvChainKey = finalRecvChainKey;
    currentSession.recvRatchetStep = step + 1;

    const aad = `CampusStranger-AAD:${currentSession.conversationId}:${ratchetPub}:${step}`;
    const plaintext = await this.decryptWithKey(
      messageKeyBase64,
      payload.ciphertext,
      payload.iv,
      aad,
      `conversation ${currentSession.conversationId} step ${step}`,
    );

    const updatedSession: ISessionState = {
      ...currentSession,
      updatedAt: new Date().toISOString(),
    };

    return { updatedSession, plaintext };
  }
}

export const cryptoEngine = new WebCryptoEngine();
