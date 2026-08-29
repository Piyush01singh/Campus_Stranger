import {
  IApiSuccessResponse,
  IEncryptedMessageEnvelope,
  ISavedConnection,
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
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('cs_auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  setToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cs_auth_token', token);
    }
  }

  getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cs_auth_token');
    }
    return null;
  }

  clearToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('cs_auth_token');
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

  getGoogleOAuthUrl(guestToken?: string): string {
    const token = guestToken || this.getToken();
    return `${API_BASE}/api/auth/google${token ? `?state=${encodeURIComponent(token)}` : ''}`;
  }

  async mockLinkGoogle(
    googleId: string,
    email?: string,
    displayName?: string,
  ): Promise<{ user: IUser; accessToken: string }> {
    const res = await fetch(`${API_BASE}/api/auth/google/mock-link`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ googleId, email, displayName }),
    });
    if (!res.ok) throw new Error('Failed to link Google account');
    const json: IApiSuccessResponse<{ user: IUser; accessToken: string }> = await res.json();
    this.setToken(json.data.accessToken);
    return json.data;
  }

  async getSavedStrangers(): Promise<ISavedStrangerView[]> {
    const res = await fetch(`${API_BASE}/api/conversations/saved`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    const json: IApiSuccessResponse<ISavedStrangerView[]> = await res.json();
    return json.data;
  }

  async saveConversation(conversationId: string, alias?: string): Promise<ISavedConnection> {
    const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/save`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ alias }),
    });
    if (!res.ok) throw new Error('Failed to save stranger conversation');
    const json: IApiSuccessResponse<ISavedConnection> = await res.json();
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

  async removeSavedStranger(conversationId: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/saved`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return res.ok;
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
