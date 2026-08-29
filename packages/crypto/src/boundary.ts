import { IEncryptedPayload } from '@campus-stranger/shared-types';

/**
 * ============================================================================
 * E2EE ARCHITECTURAL BOUNDARY RULES & SPECIFICATION
 * ============================================================================
 *
 * 1. ZERO-KNOWLEDGE SERVER BOUNDARY:
 *    The server is an untrusted relay for message content.
 *    The server routes and stores ONLY ciphertext envelopes (IEncryptedPayload).
 *
 * 2. WHAT MUST NEVER BE SENT TO THE SERVER:
 *    - Private keys (Identity private key, Signed prekey private key, Ephemeral private keys)
 *    - Session keys / Root keys / Chain keys / Ratchet state
 *    - Plaintext message contents (except user-initiated moderation reports if explicitly authorized)
 *    - Unencrypted local storage backups
 *
 * 3. WHAT MAY BE SENT TO THE SERVER:
 *    - Public identity keys and prekey bundles
 *    - Signed prekey signatures
 *    - Ciphertext payloads (ciphertext, iv, tag, ephemPublicKey, keyId)
 *    - Delivery metadata (message IDs, timestamps, conversation IDs)
 *
 * 4. CRYPTOGRAPHIC PRIMITIVES:
 *    - Key Exchange: ECDH P-256 (NIST secp256r1 via WebCrypto)
 *    - Symmetric Authenticated Encryption: AES-256-GCM with 96-bit random IV & AAD binding
 *    - Key Derivation: HKDF-SHA256
 *
 * ============================================================================
 */

export class CryptoBoundaryViolationError extends Error {
  constructor(message: string) {
    super(`[CryptoBoundaryViolation]: ${message}`);
    this.name = 'CryptoBoundaryViolationError';
  }
}

export class DecryptionFailedError extends Error {
  constructor(message = 'Decryption failed. Authenticated payload verification failed.') {
    super(`[DecryptionFailed]: ${message}`);
    this.name = 'DecryptionFailedError';
  }
}

export class SessionStateError extends Error {
  constructor(message: string) {
    super(`[SessionStateError]: ${message}`);
    this.name = 'SessionStateError';
  }
}

export class ReplayDetectedError extends Error {
  constructor(message = 'Replayed or duplicate message detected.') {
    super(`[ReplayDetected]: ${message}`);
    this.name = 'ReplayDetectedError';
  }
}

export class OutOfOrderLimitExceededError extends Error {
  constructor(message = 'Message skip gap exceeds allowable maximum threshold.') {
    super(`[OutOfOrderLimitExceeded]: ${message}`);
    this.name = 'OutOfOrderLimitExceededError';
  }
}

/**
 * Validates that an object destined for backend transmission or storage
 * does not contain forbidden private key properties.
 */
export function assertNeverContainsPrivateKey(payload: Record<string, unknown>): void {
  const forbiddenKeys = [
    'privateKey',
    'privKey',
    'secretKey',
    'rootKey',
    'sendChainKey',
    'recvChainKey',
    'chainKey',
    'messageKey',
    'localDhPrivateKey',
    'rawPlaintext',
    'plaintext',
    'skippedMessageKeys',
  ];

  for (const key of forbiddenKeys) {
    if (key in payload && payload[key] !== undefined) {
      throw new CryptoBoundaryViolationError(
        `Payload contains sensitive key '${key}' which must never be transmitted or serialized to backend.`,
      );
    }
  }
}

/**
 * Validates that an encrypted payload structure meets the required fields
 * and does not present as raw unencrypted text.
 */
export function assertEncryptedPayloadValid(payload: IEncryptedPayload): void {
  if (!payload.ciphertext || typeof payload.ciphertext !== 'string' || payload.ciphertext.trim() === '') {
    throw new CryptoBoundaryViolationError('Encrypted payload missing valid ciphertext string.');
  }

  if (!payload.iv || typeof payload.iv !== 'string' || payload.iv.trim() === '') {
    throw new CryptoBoundaryViolationError(
      'Encrypted payload missing valid initialization vector (iv).',
    );
  }

  if (typeof payload.protocolVersion !== 'number' || payload.protocolVersion < 1) {
    throw new CryptoBoundaryViolationError('Encrypted payload missing valid protocolVersion.');
  }
}
