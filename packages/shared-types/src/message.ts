import { ConversationId, MessageId, UserId } from './ids.js';

export type MessageStatus = 'sent' | 'stored' | 'delivered' | 'read';

/**
 * Encrypted payload containing ciphertext and cryptographic metadata.
 *
 * ARCHITECTURAL SAFETY GUARANTEE:
 * Normal message content is encrypted client-side before transmission.
 * The backend server and persistent database only ever handle and store
 * this ciphertext container. The backend must NEVER receive or store plaintext
 * message bodies in this contract.
 */
export interface IEncryptedPayload {
  /** Base64-encoded encrypted ciphertext payload */
  ciphertext: string;
  /** Base64-encoded initialization vector / nonce */
  iv: string;
  /** Base64-encoded authentication tag / MAC (if required by the cipher mode) */
  tag?: string;
  /** Ephemeral public key (Base64) used in the cryptographic handshake / ratcheting */
  ephemPublicKey?: string;
  /** Version identifier of the encryption protocol */
  protocolVersion: number;
  /** Key identifier, ratchet index, or session counter */
  keyId?: string;
  /** Number of messages in the previous sending chain (Double Ratchet Pn parameter) */
  previousChainLength?: number;
}

/**
 * Message envelope persisted in the database and relayed via WebSocket.
 */
export interface IEncryptedMessageEnvelope {
  id: MessageId;
  conversationId: ConversationId;
  senderId: UserId;
  recipientId?: UserId;
  encryptedPayload: IEncryptedPayload;
  status: MessageStatus;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
}
