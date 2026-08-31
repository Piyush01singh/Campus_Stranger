'use client';

import React, { useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiClient } from '../lib/api-client';

export interface GoogleSignInButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onError'> {
  returnUrl?: string;
  guestToken?: string;
  conversationId?: string;
  label?: string;
  loadingLabel?: string;
  variant?: 'primary' | 'navbar' | 'dropdown' | 'outline' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  onError?: (error: string) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  showIcon?: boolean;
}

/**
 * Standard Google 'G' multicolored SVG icon
 */
export function GoogleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

/**
 * Shared Google Sign In Button component with instant loading state,
 * double-click and multiple OAuth initiation protection, layout stability,
 * and full accessibility support.
 */
export const GoogleSignInButton = React.forwardRef<HTMLButtonElement, GoogleSignInButtonProps>(
  (
    {
      returnUrl,
      guestToken,
      conversationId,
      label = 'Sign In with Google',
      loadingLabel = 'Signing in...',
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      onError,
      onLoadingChange,
      showIcon = true,
      disabled = false,
      className = '',
      onClick,
      children,
      ...rest
    },
    ref
  ) => {
    const [isSigningIn, setIsSigningIn] = useState(false);

    const handleClick = useCallback(
      async (e: React.MouseEvent<HTMLButtonElement>) => {
        // Double-request protection guard: ignore if already signing in or disabled
        if (isSigningIn || disabled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // 1. Immediately enter loading state
        setIsSigningIn(true);
        onLoadingChange?.(true);

        if (onClick) {
          try {
            onClick(e);
          } catch (err) {
            console.error('Custom onClick handler error in GoogleSignInButton:', err);
          }
        }

        try {
          // 2. Resolve returnUrl
          const effectiveReturnUrl =
            returnUrl !== undefined
              ? returnUrl
              : typeof window !== 'undefined'
              ? window.location.pathname
              : undefined;

          // 3. Generate OAuth URL
          const googleUrl = apiClient.getGoogleOAuthUrl(guestToken, conversationId, effectiveReturnUrl);

          // 4. Redirect browser to Google Consent Screen
          if (typeof window !== 'undefined') {
            window.location.href = googleUrl;
          }
        } catch (err: unknown) {
          // 5. Error handling: reset loading state on failure before redirect
          const errorMsg =
            err instanceof Error ? err.message : 'Failed to initiate Google authentication';
          setIsSigningIn(false);
          onLoadingChange?.(false);
          if (onError) {
            onError(errorMsg);
          }
        }
      },
      [isSigningIn, disabled, returnUrl, guestToken, conversationId, onClick, onError, onLoadingChange]
    );

    // Keyboard protection (Enter / Space)
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if ((e.key === 'Enter' || e.key === ' ') && isSigningIn) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      [isSigningIn]
    );

    // Variant-specific styles
    let variantStyles = '';
    switch (variant) {
      case 'navbar':
        variantStyles =
          'bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-full shadow-xs active:scale-95 disabled:active:scale-100';
        break;
      case 'dropdown':
        variantStyles =
          'w-full text-left text-coral hover:bg-coral-light/20 dark:hover:bg-coral-dark/20 transition-colors font-medium rounded-none justify-start px-3.5 py-2';
        break;
      case 'outline':
        variantStyles =
          'bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-full shadow-xs active:scale-95 disabled:active:scale-100';
        break;
      case 'secondary':
        variantStyles =
          'bg-coral-light dark:bg-coral-dark/30 text-coral dark:text-[#fca5a5] hover:bg-coral hover:text-white rounded-full active:scale-95 disabled:active:scale-100';
        break;
      case 'primary':
      default:
        variantStyles =
          'bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-full shadow-md active:scale-95 disabled:active:scale-100';
        break;
    }

    // Size-specific styles
    let sizeStyles = '';
    switch (size) {
      case 'sm':
        sizeStyles = 'px-3.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs min-h-[32px] sm:min-h-[36px]';
        break;
      case 'lg':
        sizeStyles = 'px-6 sm:px-8 py-3.5 sm:py-4 text-sm sm:text-base min-h-[48px] sm:min-h-[52px]';
        break;
      case 'md':
      default:
        sizeStyles = variant === 'dropdown'
          ? 'text-xs min-h-[32px]'
          : 'px-5 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm min-h-[40px] sm:min-h-[44px]';
        break;
    }

    const disabledStyles = isSigningIn || disabled
      ? 'opacity-70 cursor-not-allowed pointer-events-none'
      : 'cursor-pointer';

    const widthStyles = fullWidth ? 'w-full' : '';

    const displayText = isSigningIn ? loadingLabel : (children || label);

    return (
      <button
        ref={ref}
        type="button"
        disabled={isSigningIn || disabled}
        aria-busy={isSigningIn}
        aria-disabled={isSigningIn || disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`inline-flex items-center justify-center gap-2 font-semibold transition-all select-none box-border ${variantStyles} ${sizeStyles} ${disabledStyles} ${widthStyles} ${className}`}
        {...rest}
      >
        {isSigningIn ? (
          <RefreshCw
            className="w-4 h-4 animate-spin shrink-0 text-current"
            aria-hidden="true"
          />
        ) : showIcon ? (
          variant === 'dropdown' ? (
            <GoogleIcon className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <GoogleIcon className="w-4 h-4 shrink-0" />
          )
        ) : null}

        <span className="truncate">{displayText}</span>
      </button>
    );
  }
);

GoogleSignInButton.displayName = 'GoogleSignInButton';
