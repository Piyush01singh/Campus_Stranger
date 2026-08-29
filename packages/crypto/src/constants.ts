/**
 * Cryptographic constants and algorithm identifiers for CampusStranger.
 */
export const CryptoConstants = {
  CURRENT_PROTOCOL_VERSION: 2,
  KEY_EXCHANGE_ALGORITHM: 'ECDH-P256',
  NAMED_CURVE: 'P-256',
  SYMMETRIC_CIPHER: 'AES-256-GCM',
  KDF_ALGORITHM: 'HKDF-SHA256',
  IV_LENGTH_BYTES: 12,
  TAG_LENGTH_BYTES: 16,
  KEY_LENGTH_BYTES: 32,
  /** Maximum number of skipped message keys cached in session state (prevents unbounded memory growth) */
  MAX_SKIPPED_KEYS: 500,
  /** Maximum allowable forward step skip gap in a single message */
  MAX_SKIP_GAP: 100,
} as const;
