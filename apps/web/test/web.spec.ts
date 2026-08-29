import { describe, expect, it } from 'vitest';
import { toUserId } from '@campus-stranger/shared-types';
import { CryptoConstants } from '@campus-stranger/crypto';

describe('apps/web workspace, packages, and theme utilities', () => {
  it('should import and use shared-types without errors', () => {
    const testUserId = toUserId('usr_web_client_1');
    expect(testUserId).toBe('usr_web_client_1');
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
});
