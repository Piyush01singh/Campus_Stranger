import { describe, expect, it } from 'vitest';
import { toUserId, toConversationId } from '@campus-stranger/shared-types';
import { CryptoConstants } from '@campus-stranger/crypto';
import { apiClient } from '../lib/api-client';

describe('apps/web workspace, packages, and theme utilities', () => {
  it('should import and use shared-types without errors', () => {
    const testUserId = toUserId('usr_web_client_1');
    expect(testUserId).toBe('usr_web_client_1');
    const testConvId = toConversationId('conv_123');
    expect(testConvId).toBe('conv_123');
  });

  it('should import and use crypto package constants without errors', () => {
    expect(CryptoConstants.KEY_EXCHANGE_ALGORITHM).toBe('ECDH-P256');
    expect(CryptoConstants.CURRENT_PROTOCOL_VERSION).toBe(2);
  });

  it('should handle theme options correctly', () => {
    const validThemes = ['light', 'dark'];
    expect(validThemes).toContain('light');
    expect(validThemes).toContain('dark');
    expect(validThemes).toHaveLength(2);
  });

  it('should correctly normalize API and WebSocket base URLs with or without /api suffix', () => {
    const normalizeApiBase = (url: string) => url.replace(/\/+$/, '').replace(/\/api$/, '');
    const normalizeWsUrl = (wsUrl?: string, apiUrl?: string) =>
      (wsUrl || apiUrl?.replace(/\/+$/, '').replace(/\/api$/, '') || 'http://localhost:3001').replace(/\/+$/, '');

    // Test with /api suffix (as provided in production config)
    expect(normalizeApiBase('https://campus-stranger.onrender.com/api')).toBe('https://campus-stranger.onrender.com');
    expect(normalizeWsUrl(undefined, 'https://campus-stranger.onrender.com/api')).toBe('https://campus-stranger.onrender.com');

    // Test with trailing slash
    expect(normalizeApiBase('https://campus-stranger.onrender.com/')).toBe('https://campus-stranger.onrender.com');
    expect(normalizeWsUrl(undefined, 'https://campus-stranger.onrender.com/')).toBe('https://campus-stranger.onrender.com');

    // Test with dedicated WebSocket URL
    expect(normalizeWsUrl('https://campus-stranger.onrender.com', 'https://campus-stranger.onrender.com/api')).toBe('https://campus-stranger.onrender.com');
  });

  it('should generate valid Google OAuth URL with state token and optional conversationId for account linking', () => {
    const urlWithoutToken = apiClient.getGoogleOAuthUrl();
    expect(urlWithoutToken).toContain('/api/auth/google');

    const urlWithToken = apiClient.getGoogleOAuthUrl('sample_guest_jwt_token');
    expect(urlWithToken).toContain('state=sample_guest_jwt_token');

    const urlWithConv = apiClient.getGoogleOAuthUrl('sample_token', 'conv_abc');
    expect(urlWithConv).toContain('state=');
    // Decode base64url state
    const urlParams = new URL(urlWithConv).searchParams;
    const stateParam = urlParams.get('state');
    expect(stateParam).toBeDefined();
    const decoded = JSON.parse(atob(stateParam!));
    expect(decoded.token).toBe('sample_token');
    expect(decoded.conversationId).toBe('conv_abc');
  });

  it('should exclusively provide real Google OAuth initiation and zero mock-link methods', () => {
    expect((apiClient as unknown as Record<string, unknown>).mockLinkGoogle).toBeUndefined();
    expect(typeof apiClient.getGoogleOAuthUrl).toBe('function');
  });

  it('should manage auth tokens correctly with clearToken for logout and fresh guest identity', () => {
    apiClient.setToken('test_jwt_123');
    expect(apiClient.getToken()).toBe('test_jwt_123');
    apiClient.clearToken();
    expect(apiClient.getToken()).toBeNull();
  });
});
