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

  private getHeaders(customHeaders: HeadersInit = {}): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((customHeaders as Record<string, string>) || {}),
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = this.getHeaders(init.headers);
    return fetch(url, {
      ...init,
      credentials: 'include',
      headers,
    });
  }

  setToken(token: string | null) {
    this.inMemoryToken = token;
  }

  getToken(): string | null {
    return this.inMemoryToken;
  }

  clearToken() {
    this.inMemoryToken = null;
  }

  async createGuest(displayName?: string): Promise<{ user: IUser; accessToken: string }> {
    const res = await this.fetchWithAuth(`${API_BASE}/api/auth/guest`, {
      method: 'POST',
      body: JSON.stringify({ displayName }),
    });
    if (!res.ok) throw new Error('Failed to create guest session');
    const json: IApiSuccessResponse<{ user: IUser; accessToken: string }> = await res.json();
    this.setToken(json.data.accessToken);
    return json.data;
  }

  async getMe(): Promise<IUser | null> {
    try {
      const res = await this.fetchWithAuth(`${API_BASE}/api/auth/me`);
      if (!res.ok) return null;
      const json: IApiSuccessResponse<IUser> = await res.json();
      return json.data;
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
    this.clearToken();
    try {
      await this.fetchWithAuth(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
      });
    } catch {
      // Ignore network error on logout
    }
  }

  async getActiveUserCount(): Promise<number> {
    try {
      const res = await this.fetchWithAuth(`${API_BASE}/api/presence/active-users`);
      if (!res.ok) return 0;
      const json: IApiSuccessResponse<{ count: number }> = await res.json();
      return json.data.count;
    } catch {
      return 0;
    }
  }

  getGoogleOAuthUrl(guestToken?: string, conversationId?: string, returnUrl?: string): string {
    const token = guestToken || this.getToken();
    if (!token && !conversationId && !returnUrl) {
      return `${API_BASE}/api/auth/google`;
    }

    if (conversationId || returnUrl) {
      const stateObj: { token?: string; conversationId?: string; returnUrl?: string } = {};
      if (token) stateObj.token = token;
      if (conversationId) stateObj.conversationId = conversationId;
      if (returnUrl) stateObj.returnUrl = returnUrl;
      const stateStr = btoa(JSON.stringify(stateObj));
      return `${API_BASE}/api/auth/google?state=${encodeURIComponent(stateStr)}`;
    }

    return `${API_BASE}/api/auth/google${token ? `?state=${encodeURIComponent(token)}` : ''}`;
  }

  /**
   * Safe development and test login helper. Disabled in production.
   */
  async testLogin(displayName?: string, email?: string, googleId?: string): Promise<{ user: IUser; accessToken: string }> {
    const res = await this.fetchWithAuth(`${API_BASE}/api/auth/test-login`, {
      method: 'POST',
      body: JSON.stringify({ displayName, email, googleId }),
    });
    if (!res.ok) throw new Error('Failed to perform dev test login');
    const json: IApiSuccessResponse<{ user: IUser; accessToken: string }> = await res.json();
    this.setToken(json.data.accessToken);
    return json.data;
  }

  async getSavedStrangers(): Promise<ISavedStrangerView[]> {
    const res = await this.fetchWithAuth(`${API_BASE}/api/conversations/saved`);
    if (!res.ok) return [];
    const json: IApiSuccessResponse<ISavedStrangerView[]> = await res.json();
    return json.data;
  }

  async getConversationMessages(conversationId: string): Promise<IEncryptedMessageEnvelope[]> {
    const res = await this.fetchWithAuth(`${API_BASE}/api/conversations/${conversationId}/messages`);
    if (!res.ok) throw new Error('Failed to fetch conversation history');
    const json: IApiSuccessResponse<IEncryptedMessageEnvelope[]> = await res.json();
    return json.data;
  }

  /**
   * Deletes a saved conversation from the authenticated user's own saved list.
   */
  async deleteMutualSavedConnection(conversationId: string): Promise<boolean> {
    const res = await this.fetchWithAuth(`${API_BASE}/api/conversations/${conversationId}/saved`, {
      method: 'DELETE',
    });
    return res.ok;
  }

  /**
   * Alias for deleteSavedConnection
   */
  async removeSavedStranger(conversationId: string): Promise<boolean> {
    return this.deleteMutualSavedConnection(conversationId);
  }

  async blockUser(targetUserId: string): Promise<void> {
    await this.fetchWithAuth(`${API_BASE}/api/moderation/block`, {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
  }

  async reportUser(
    reportedUserId: string,
    conversationId: string,
    reason: string,
    details?: string,
  ): Promise<void> {
    await this.fetchWithAuth(`${API_BASE}/api/moderation/report`, {
      method: 'POST',
      body: JSON.stringify({ reportedUserId, conversationId, reason, details }),
    });
  }
}

export const apiClient = new ApiClient();
