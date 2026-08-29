import { IEncryptedPayload } from '@campus-stranger/shared-types';

/**
 * Public/Private key pair representation.
 */
export interface IKeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Public Identity Key safe for publication.
 */
export interface IPublicIdentityKey {
  keyId: string;
  publicKey: string;
  createdAt: string;
}

/**
 * Full Identity Key Pair (Client device only).
 */
export interface IIdentityKeyPair {
  keyId: string;
  publicKey: string;
  /** Private key material - MUST NEVER LEAVE CLIENT */
  privateKey: string;
}

/**
 * Ephemeral prekey bundle for X3DH-style key agreement.
 */
export interface IPreKeyBundle {
  identityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey?: string;
  keyId: number;
}

export type IEncryptedCiphertext = IEncryptedPayload;

/**
 * Client-side Double Ratchet session state.
 */
export interface ISessionState {
  conversationId: string;
  remoteIdentityKey: string;
  /** Current local ephemeral DH ratchet key pair */
  localDhKeyPair: IKeyPair;
  /** Current remote ephemeral DH ratchet public key */
  remoteDhPublicKey: string;
  /** 256-bit Root KDF Key (Base64) */
  rootKey: string;
  /** Current sending KDF chain key (Base64), or null if not yet ratcheted for send */
  sendChainKey: string | null;
  /** Current receiving KDF chain key (Base64), or null if not yet ratcheted for receive */
  recvChainKey: string | null;
  /** Message step index in the current sending chain */
  sendRatchetStep: number;
  /** Message step index in the current receiving chain */
  recvRatchetStep: number;
  /** Length of previous sending chain (Pn parameter in Double Ratchet) */
  previousSendChainLength: number;
  /** Bounded skipped message keys map: key is `${dhRatchetPublicKey}:${step}`, value is 256-bit AES message key (Base64) */
  skippedMessageKeys: Record<string, string>;
  updatedAt: string;
}

/**
 * Client-side cryptographic engine interface.
 */
export interface ICryptoEngine {
  generateIdentityKeyPair(): Promise<IIdentityKeyPair>;
  generatePreKeyBundle(identityKey: IIdentityKeyPair): Promise<IPreKeyBundle>;
  establishSession(
    myIdentity: IIdentityKeyPair,
    remotePublicKeyBase64: string,
    conversationId: string,
  ): Promise<ISessionState>;
  initOutboundSession(
    myIdentity: IIdentityKeyPair,
    recipientBundle: IPreKeyBundle,
    conversationId: string,
  ): Promise<{ session: ISessionState; initialMessagePayload?: IEncryptedPayload }>;
  initInboundSession(
    myIdentity: IIdentityKeyPair,
    senderIdentityKey: string,
    senderEphemeralKey: string,
    conversationId: string,
  ): Promise<ISessionState>;
  encrypt(
    session: ISessionState,
    plaintext: string,
  ): Promise<{ updatedSession: ISessionState; payload: IEncryptedPayload }>;
  decrypt(
    session: ISessionState,
    payload: IEncryptedPayload,
  ): Promise<{ updatedSession: ISessionState; plaintext: string }>;
}
