import {
  IApiSuccessResponse,
  IEncryptedMessageEnvelope,
  IUser,
} from '@campus-stranger/shared-types';

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const API_BASE = rawApiUrl.replace(/\/+$/, '').replace(/\/api$/, '');

export interface ISavedStrangerView {
  conversationId: string;
  partnerDisplayName: string;
  savedAt: string;
  lastMessageAt?: string;
  isMutualSaved?: boolean;
}

class ApiClient {
  private inMemoryToken: string | null = null;

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  setToken(token: string) {
    this.inMemoryToken = token;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cs_auth_token', token);
      } catch {
        // localStorage not accessible
      }
    }
  }

  getToken(): string | null {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('cs_auth_token');
        if (stored) return stored;
      } catch {
        // localStorage not accessible
      }
    }
    return this.inMemoryToken;
  }

  clearToken() {
    this.inMemoryToken = null;
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('cs_auth_token');
      } catch {
        // localStorage not accessible
      }
    }
  }

  async createGuest(displayName?: string): Promise<{ user: IUser; accessToken: string }> {
    const res = await fetch(`${API_BASE}/api/auth/guest`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ displayName }),
    });
    if (!res.ok) throw new Error('Failed to create guest session');
    const json: IApiSuccessResponse<{ user: IUser; accessToken: string }> = await res.json();
    this.setToken(json.data.accessToken);
    return json.data;
  }

  async getMe(): Promise<IUser | null> {
    const token = this.getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return null;
      const json: IApiSuccessResponse<IUser> = await res.json();
      return json.data;
    } catch {
      return null;
    }
  }

  getGoogleOAuthUrl(guestToken?: string, conversationId?: string): string {
    const token = guestToken || this.getToken();
    if (!token && !conversationId) {
      return `${API_BASE}/api/auth/google`;
    }

    if (conversationId) {
      const stateObj = { token: token || undefined, conversationId };
      const stateStr = btoa(JSON.stringify(stateObj));
      return `${API_BASE}/api/auth/google?state=${encodeURIComponent(stateStr)}`;
    }

    return `${API_BASE}/api/auth/google${token ? `?state=${encodeURIComponent(token)}` : ''}`;
  }

  async getSavedStrangers(): Promise<ISavedStrangerView[]> {
    const res = await fetch(`${API_BASE}/api/conversations/saved`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    const json: IApiSuccessResponse<ISavedStrangerView[]> = await res.json();
    return json.data;
  }

  async getConversationMessages(conversationId: string): Promise<IEncryptedMessageEnvelope[]> {
    const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch conversation history');
    const json: IApiSuccessResponse<IEncryptedMessageEnvelope[]> = await res.json();
    return json.data;
  }

  /**
   * Mutually deletes a saved conversation for both participants from the server.
   */
  async deleteMutualSavedConnection(conversationId: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/saved`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return res.ok;
  }

  /**
   * Alias for deleteMutualSavedConnection
   */
  async removeSavedStranger(conversationId: string): Promise<boolean> {
    return this.deleteMutualSavedConnection(conversationId);
  }

  async blockUser(targetUserId: string): Promise<void> {
    await fetch(`${API_BASE}/api/moderation/block`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ targetUserId }),
    });
  }

  async reportUser(
    reportedUserId: string,
    conversationId: string,
    reason: string,
    details?: string,
  ): Promise<void> {
    await fetch(`${API_BASE}/api/moderation/report`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ reportedUserId, conversationId, reason, details }),
    });
  }
}

export const apiClient = new ApiClient();
