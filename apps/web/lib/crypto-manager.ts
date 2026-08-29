import {
  cryptoEngine,
  ICachedMessage,
  IIdentityKeyPair,
  IndexedDbCryptoStore,
  IPreKeyBundle,
  ISessionState,
} from '@campus-stranger/crypto';
import { IEncryptedPayload } from '@campus-stranger/shared-types';

export class CryptoManager {
  private readonly engine = cryptoEngine;
  private readonly store = new IndexedDbCryptoStore();
  private identityKey: IIdentityKeyPair | null = null;

  async getOrGenerateIdentity(): Promise<IIdentityKeyPair> {
    if (this.identityKey) return this.identityKey;

    let existing = await this.store.getIdentityKey();
    if (!existing) {
      existing = await this.engine.generateIdentityKeyPair();
      await this.store.saveIdentityKey(existing);
    }
    this.identityKey = existing;
    return existing;
  }

  async getPreKeyBundle(): Promise<IPreKeyBundle> {
    const identity = await this.getOrGenerateIdentity();
    return this.engine.generatePreKeyBundle(identity);
  }

  async establishSession(
    conversationId: string,
    partnerIdentityKey: string,
  ): Promise<ISessionState> {
    const existing = await this.store.getSession(conversationId);
    if (existing) {
      return existing;
    }

    const identity = await this.getOrGenerateIdentity();
    const session = await this.engine.establishSession(
      identity,
      partnerIdentityKey,
      conversationId,
    );
    await this.store.saveSession(session);
    return session;
  }

  async initSessionAsInitiator(
    conversationId: string,
    partnerPreKeyBundle: IPreKeyBundle,
  ): Promise<ISessionState> {
    return this.establishSession(conversationId, partnerPreKeyBundle.identityKey);
  }

  async initSessionAsReceiver(
    conversationId: string,
    partnerIdentityKey: string,
    _partnerEphemeralKey?: string,
  ): Promise<ISessionState> {
    return this.establishSession(conversationId, partnerIdentityKey);
  }

  async encryptMessage(conversationId: string, plaintext: string): Promise<IEncryptedPayload> {
    const session = await this.store.getSession(conversationId);
    if (!session) {
      throw new Error(`Cryptographic session not found for conversation ${conversationId}`);
    }

    const { updatedSession, payload } = await this.engine.encrypt(session, plaintext);
    await this.store.saveSession(updatedSession);
    return payload;
  }

  async decryptMessage(conversationId: string, payload: IEncryptedPayload): Promise<string> {
    const session = await this.store.getSession(conversationId);
    if (!session) {
      throw new Error(`Cryptographic session not found for conversation ${conversationId}`);
    }

    const { updatedSession, plaintext } = await this.engine.decrypt(session, payload);
    await this.store.saveSession(updatedSession);
    return plaintext;
  }

  async saveCachedMessage(conversationId: string, message: ICachedMessage): Promise<void> {
    await this.store.saveCachedMessage(conversationId, message);
  }

  async getCachedMessages(conversationId: string): Promise<ICachedMessage[]> {
    return this.store.getCachedMessages(conversationId);
  }

  async clearAll() {
    this.identityKey = null;
    await this.store.clear();
  }
}

export const cryptoManager = new CryptoManager();
