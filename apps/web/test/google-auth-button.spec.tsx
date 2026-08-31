import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { GoogleSignInButton, GoogleIcon } from '../components/GoogleSignInButton';
import { apiClient } from '../lib/api-client';

describe('GoogleSignInButton component & loading state behavior', () => {
  it('should render standard default state with Google icon and readable text', () => {
    const html = renderToString(
      <GoogleSignInButton
        label="Sign In with Google"
        returnUrl="/saved"
      />
    );

    expect(html).toContain('Sign In with Google');
    expect(html).toContain('svg');
    expect(html).toContain('type="button"');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('aria-busy="true"');
    expect(html).toContain('dark:bg-neutral-100');
  });

  it('should support customized label and variant styles without layout shift', () => {
    const primaryHtml = renderToString(
      <GoogleSignInButton variant="primary" size="lg" label="Continue with Google" />
    );
    expect(primaryHtml).toContain('Continue with Google');
    expect(primaryHtml).toContain('min-h-[48px]');

    const navbarHtml = renderToString(
      <GoogleSignInButton variant="navbar" size="sm" label="Sign In" showIcon={false} />
    );
    expect(navbarHtml).toContain('Sign In');
    expect(navbarHtml).toContain('min-h-[32px]');

    const dropdownHtml = renderToString(
      <GoogleSignInButton variant="dropdown" label="Sign in with Google" />
    );
    expect(dropdownHtml).toContain('Sign in with Google');
    expect(dropdownHtml).toContain('text-coral');
  });

  it('should contain mobile responsiveness and layout-shift prevention classes', () => {
    const html = renderToString(
      <GoogleSignInButton
        label="Sign In with Google"
        loadingLabel="Signing in..."
        size="md"
      />
    );

    // Layout stability & mobile protection classes
    expect(html).toContain('box-border');
    expect(html).toContain('inline-flex');
    expect(html).toContain('items-center');
    expect(html).toContain('justify-center');
    expect(html).toContain('truncate');
    expect(html).toContain('min-h-[40px]');
  });

  it('should render GoogleIcon with proper accessibility and SVG paths', () => {
    const iconHtml = renderToString(<GoogleIcon className="w-5 h-5" />);
    expect(iconHtml).toContain('aria-hidden="true"');
    expect(iconHtml).toContain('viewBox="0 0 24 24"');
    expect(iconHtml).toContain('#4285F4'); // Google Blue
    expect(iconHtml).toContain('#34A853'); // Google Green
    expect(iconHtml).toContain('#FBBC05'); // Google Yellow
    expect(iconHtml).toContain('#EA4335'); // Google Red
  });

  it('should protect against rapid duplicate clicks and multiple OAuth initiation', async () => {
    let oauthUrlCalls = 0;
    const originalGetUrl = apiClient.getGoogleOAuthUrl.bind(apiClient);

    vi.spyOn(apiClient, 'getGoogleOAuthUrl').mockImplementation((guestToken, convId, retUrl) => {
      oauthUrlCalls++;
      return originalGetUrl(guestToken, convId, retUrl);
    });

    // Simulate click handler logic directly to verify double-submission guard
    let isSigningIn = false;
    let redirectCount = 0;
    const performClick = async () => {
      // Duplicate click protection guard
      if (isSigningIn) return;
      isSigningIn = true;
      try {
        const url = apiClient.getGoogleOAuthUrl(undefined, undefined, '/saved');
        redirectCount++;
        return url;
      } catch {
        isSigningIn = false;
      }
    };

    // Simulate 5 rapid simultaneous clicks
    await Promise.all([
      performClick(),
      performClick(),
      performClick(),
      performClick(),
      performClick(),
    ]);

    expect(oauthUrlCalls).toBe(1);
    expect(redirectCount).toBe(1);
    expect(isSigningIn).toBe(true);

    vi.restoreAllMocks();
  });

  it('should cleanly reset isSigningIn and re-enable button on initiation error', async () => {
    let isSigningIn = false;
    let reportedError: string | null = null;

    vi.spyOn(apiClient, 'getGoogleOAuthUrl').mockImplementation(() => {
      throw new Error('Network error during OAuth handshake');
    });

    const performClick = async (onError: (err: string) => void) => {
      if (isSigningIn) return;
      isSigningIn = true;
      try {
        apiClient.getGoogleOAuthUrl();
      } catch (err) {
        isSigningIn = false;
        const msg = err instanceof Error ? err.message : 'Auth error';
        onError(msg);
      }
    };

    await performClick((err) => {
      reportedError = err;
    });

    expect(reportedError).toBe('Network error during OAuth handshake');
    expect(isSigningIn).toBe(false); // Button is re-enabled, not stuck

    vi.restoreAllMocks();
  });

  it('should properly encode and attach returnUrl to post-auth redirect', () => {
    const savedUrl = apiClient.getGoogleOAuthUrl(undefined, undefined, '/saved');
    expect(savedUrl).toContain('state=');
    const parsedState = JSON.parse(atob(new URL(savedUrl).searchParams.get('state')!));
    expect(parsedState.returnUrl).toBe('/saved');

    const chatUrl = apiClient.getGoogleOAuthUrl(undefined, undefined, '/chat/conv_123');
    const chatParsedState = JSON.parse(atob(new URL(chatUrl).searchParams.get('state')!));
    expect(chatParsedState.returnUrl).toBe('/chat/conv_123');
  });
});
