'use client';

import React, { useState } from 'react';
import { User, X, CheckCircle2, ShieldCheck } from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { apiClient } from '../lib/api-client';
import { IUser } from '@campus-stranger/shared-types';

interface SaveStrangerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: IUser | null;
  onSuccess?: (user: IUser) => void;
}

export function SaveStrangerModal({
  isOpen,
  onClose,
  currentUser: _currentUser,
  onSuccess,
}: SaveStrangerModalProps) {
  const [devLoading, setDevLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isDev = process.env.NODE_ENV !== 'production';

  const handleDevTestLogin = async (name: string, email: string) => {
    setDevLoading(true);
    setError(null);
    try {
      const res = await apiClient.testLogin(name, email);
      if (onSuccess) {
        onSuccess(res.user);
      }
      onClose();
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dev test login failed');
      setDevLoading(false);
    }
  };

  const returnUrl = typeof window !== 'undefined' ? window.location.pathname : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto p-6 sm:p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-[#e5e3de] dark:border-neutral-800 shadow-2xl space-y-6 text-foreground">
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-coral-light dark:bg-coral-dark/40 text-coral dark:text-[#fca5a5] flex items-center justify-center mx-auto shadow-sm">
            <User className="w-6 h-6" />
          </div>
          <h2 id="auth-modal-title" className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
            Sign In to CampusStranger
          </h2>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-xs mx-auto leading-relaxed">
            Sign in with Google to enable mutual Save Chat, access your saved conversations, and chat across devices.
          </p>
        </div>

        <div className="space-y-2.5 bg-[#faf8f5] dark:bg-neutral-800/60 p-4 rounded-2xl border border-[#e5e3de] dark:border-neutral-700/50 text-xs">
          <div className="flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Mutual consent Save Chat between authenticated users</span>
          </div>
          <div className="flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Zero-Knowledge Double Ratchet E2EE preserved</span>
          </div>
          <div className="flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Never reveals your real identity or email to strangers</span>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 text-center font-medium">{error}</p>}

        <div className="space-y-3 pt-2">
          <GoogleSignInButton
            fullWidth
            size="lg"
            label="Sign In with Google"
            loadingLabel="Signing in..."
            returnUrl={returnUrl}
            onError={(errMsg) => setError(errMsg)}
          />

          {isDev && (
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
              <p className="text-[11px] font-semibold text-neutral-400 text-center uppercase tracking-wider">
                Local Dev Quick Test Login
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleDevTestLogin('Alice Cooper', 'alice@campus.local')}
                  disabled={devLoading}
                  className="py-2.5 px-3 rounded-full bg-coral-light dark:bg-coral-dark/30 text-coral dark:text-[#fca5a5] hover:bg-coral hover:text-white font-semibold text-xs transition-all text-center disabled:opacity-50"
                >
                  Login as Alice
                </button>
                <button
                  onClick={() => handleDevTestLogin('Bob Dylan', 'bob@campus.local')}
                  disabled={devLoading}
                  className="py-2.5 px-3 rounded-full bg-coral-light dark:bg-coral-dark/30 text-coral dark:text-[#fca5a5] hover:bg-coral hover:text-white font-semibold text-xs transition-all text-center disabled:opacity-50"
                >
                  Login as Bob
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
