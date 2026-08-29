import { IIdentityKeyPair, ISessionState } from './types';

export interface ICachedMessage {
  id: string;
  senderId: string;
  isMine: boolean;
  plaintext: string;
  status: string;
  createdAt: string;
}

export interface ICryptoStore {
  getIdentityKey(): Promise<IIdentityKeyPair | null>;
  saveIdentityKey(key: IIdentityKeyPair): Promise<void>;
  getSession(conversationId: string): Promise<ISessionState | null>;
  saveSession(session: ISessionState): Promise<void>;
  deleteSession(conversationId: string): Promise<void>;
  getCachedMessages(conversationId: string): Promise<ICachedMessage[]>;
  saveCachedMessage(conversationId: string, message: ICachedMessage): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCryptoStore implements ICryptoStore {
  private identityKey: IIdentityKeyPair | null = null;
  private sessions = new Map<string, ISessionState>();
  private messageCache = new Map<string, ICachedMessage[]>();

  async getIdentityKey(): Promise<IIdentityKeyPair | null> {
    return this.identityKey;
  }

  async saveIdentityKey(key: IIdentityKeyPair): Promise<void> {
    this.identityKey = key;
  }

  async getSession(conversationId: string): Promise<ISessionState | null> {
    return this.sessions.get(conversationId) ?? null;
  }

  async saveSession(session: ISessionState): Promise<void> {
    this.sessions.set(session.conversationId, session);
  }

  async deleteSession(conversationId: string): Promise<void> {
    this.sessions.delete(conversationId);
  }

  async getCachedMessages(conversationId: string): Promise<ICachedMessage[]> {
    return this.messageCache.get(conversationId) ?? [];
  }

  async saveCachedMessage(conversationId: string, message: ICachedMessage): Promise<void> {
    let list = this.messageCache.get(conversationId);
    if (!list) {
      list = [];
      this.messageCache.set(conversationId, list);
    }
    if (!list.some((m) => m.id === message.id)) {
      list.push(message);
    }
  }

  async clear(): Promise<void> {
    this.identityKey = null;
    this.sessions.clear();
    this.messageCache.clear();
  }
}

export class LocalStorageCryptoStore implements ICryptoStore {
  private readonly ID_KEY_STORAGE_KEY = 'cs_e2ee_identity_key';
  private readonly SESSION_PREFIX = 'cs_e2ee_session_';
  private readonly MSG_PREFIX = 'cs_chat_messages_';

  private isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  async getIdentityKey(): Promise<IIdentityKeyPair | null> {
    if (!this.isAvailable()) return null;
    const raw = window.localStorage.getItem(this.ID_KEY_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as IIdentityKeyPair;
    } catch {
      return null;
    }
  }

  async saveIdentityKey(key: IIdentityKeyPair): Promise<void> {
    if (!this.isAvailable()) return;
    window.localStorage.setItem(this.ID_KEY_STORAGE_KEY, JSON.stringify(key));
  }

  async getSession(conversationId: string): Promise<ISessionState | null> {
    if (!this.isAvailable()) return null;
    const raw = window.localStorage.getItem(`${this.SESSION_PREFIX}${conversationId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ISessionState;
    } catch {
      return null;
    }
  }

  async saveSession(session: ISessionState): Promise<void> {
    if (!this.isAvailable()) return;
    window.localStorage.setItem(
      `${this.SESSION_PREFIX}${session.conversationId}`,
      JSON.stringify(session),
    );
  }

  async deleteSession(conversationId: string): Promise<void> {
    if (!this.isAvailable()) return;
    window.localStorage.removeItem(`${this.SESSION_PREFIX}${conversationId}`);
  }

  async getCachedMessages(conversationId: string): Promise<ICachedMessage[]> {
    if (!this.isAvailable()) return [];
    const raw = window.localStorage.getItem(`${this.MSG_PREFIX}${conversationId}`);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as ICachedMessage[];
    } catch {
      return [];
    }
  }

  async saveCachedMessage(conversationId: string, message: ICachedMessage): Promise<void> {
    if (!this.isAvailable()) return;
    const current = await this.getCachedMessages(conversationId);
    if (!current.some((m) => m.id === message.id)) {
      current.push(message);
      window.localStorage.setItem(`${this.MSG_PREFIX}${conversationId}`, JSON.stringify(current));
    }
  }

  async clear(): Promise<void> {
    if (!this.isAvailable()) return;
    window.localStorage.removeItem(this.ID_KEY_STORAGE_KEY);
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(this.SESSION_PREFIX) || k?.startsWith(this.MSG_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  }
}

/**
 * Modern browser client storage using IndexedDB with fallback to LocalStorage.
 * IndexedDB provides asynchronous, structured, non-blocking storage for cryptographic keys and message caches.
 */
export class IndexedDbCryptoStore implements ICryptoStore {
  private readonly dbName = 'CampusStrangerCryptoDB';
  private readonly version = 1;
  private readonly fallback = new LocalStorageCryptoStore();

  private isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  }

  private async openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = window.indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('identity')) {
          db.createObjectStore('identity', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'conversationId' });
        }
        if (!db.objectStoreNames.contains('messages')) {
          db.createObjectStore('messages', { keyPath: 'conversationId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getIdentityKey(): Promise<IIdentityKeyPair | null> {
    if (!this.isAvailable()) return this.fallback.getIdentityKey();
    try {
      const db = await this.openDb();
      return new Promise((resolve) => {
        const tx = db.transaction('identity', 'readonly');
        const store = tx.objectStore('identity');
        const req = store.get('current_identity');
        req.onsuccess = () => resolve(req.result?.key || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return this.fallback.getIdentityKey();
    }
  }

  async saveIdentityKey(key: IIdentityKeyPair): Promise<void> {
    if (!this.isAvailable()) return this.fallback.saveIdentityKey(key);
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('identity', 'readwrite');
        const store = tx.objectStore('identity');
        const req = store.put({ id: 'current_identity', key });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      await this.fallback.saveIdentityKey(key);
    }
  }

  async getSession(conversationId: string): Promise<ISessionState | null> {
    if (!this.isAvailable()) return this.fallback.getSession(conversationId);
    try {
      const db = await this.openDb();
      return new Promise((resolve) => {
        const tx = db.transaction('sessions', 'readonly');
        const store = tx.objectStore('sessions');
        const req = store.get(conversationId);
        req.onsuccess = () => resolve(req.result?.session || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return this.fallback.getSession(conversationId);
    }
  }

  async saveSession(session: ISessionState): Promise<void> {
    if (!this.isAvailable()) return this.fallback.saveSession(session);
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('sessions', 'readwrite');
        const store = tx.objectStore('sessions');
        const req = store.put({ conversationId: session.conversationId, session });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      await this.fallback.saveSession(session);
    }
  }

  async deleteSession(conversationId: string): Promise<void> {
    if (!this.isAvailable()) return this.fallback.deleteSession(conversationId);
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('sessions', 'readwrite');
        const store = tx.objectStore('sessions');
        const req = store.delete(conversationId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      await this.fallback.deleteSession(conversationId);
    }
  }

  async getCachedMessages(conversationId: string): Promise<ICachedMessage[]> {
    if (!this.isAvailable()) return this.fallback.getCachedMessages(conversationId);
    try {
      const db = await this.openDb();
      return new Promise((resolve) => {
        const tx = db.transaction('messages', 'readonly');
        const store = tx.objectStore('messages');
        const req = store.get(conversationId);
        req.onsuccess = () => resolve(req.result?.messages || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return this.fallback.getCachedMessages(conversationId);
    }
  }

  async saveCachedMessage(conversationId: string, message: ICachedMessage): Promise<void> {
    if (!this.isAvailable()) return this.fallback.saveCachedMessage(conversationId, message);
    try {
      const current = await this.getCachedMessages(conversationId);
      if (!current.some((m) => m.id === message.id)) {
        current.push(message);
        const db = await this.openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('messages', 'readwrite');
          const store = tx.objectStore('messages');
          const req = store.put({ conversationId, messages: current });
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    } catch {
      await this.fallback.saveCachedMessage(conversationId, message);
    }
  }

  async clear(): Promise<void> {
    if (!this.isAvailable()) return this.fallback.clear();
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['identity', 'sessions', 'messages'], 'readwrite');
        tx.objectStore('identity').clear();
        tx.objectStore('sessions').clear();
        tx.objectStore('messages').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      await this.fallback.clear();
    }
  }
}
