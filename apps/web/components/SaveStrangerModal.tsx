'use client';

import React, { useState } from 'react';
import { Bookmark, X, Sparkles, CheckCircle2, Send, Clock } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { IUser } from '@campus-stranger/shared-types';

interface SaveStrangerModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string;
  currentUser?: IUser | null;
  partnerDisplayName?: string;
  onSendSaveRequest?: () => void;
  isSaveRequestPending?: boolean;
  onSuccess?: (user: IUser) => void;
}

export function SaveStrangerModal({
  isOpen,
  onClose,
  conversationId,
  currentUser,
  partnerDisplayName = 'your stranger',
  onSendSaveRequest,
  isSaveRequestPending = false,
  onSuccess: _onSuccess,
}: SaveStrangerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isAuthenticated = currentUser?.accountType === 'authenticated';

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const googleUrl = apiClient.getGoogleOAuthUrl(undefined, conversationId);
      if (typeof window !== 'undefined') {
        window.location.href = googleUrl;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to initiate Google authentication');
      setLoading(false);
    }
  };

  const handleDirectSaveRequest = () => {
    if (onSendSaveRequest) {
      onSendSaveRequest();
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-stranger-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative w-full max-w-md p-6 sm:p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-[#e5e3de] dark:border-neutral-800 shadow-2xl space-y-6 text-foreground">
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-coral-light dark:bg-coral-dark/40 text-coral dark:text-[#fca5a5] flex items-center justify-center mx-auto shadow-sm">
            <Bookmark className="w-6 h-6" />
          </div>
          <h2 id="save-stranger-title" className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
            {isAuthenticated ? 'Save This Stranger' : 'Save This Stranger'}
          </h2>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-xs mx-auto leading-relaxed">
            {isAuthenticated
              ? `Send a mutual save request to ${partnerDisplayName}. If they accept, both of you will retain this encrypted chat.`
              : 'Sign in with Google to retain this encrypted chat and reconnect anytime with mutual consent.'}
          </p>
        </div>

        <div className="space-y-2.5 bg-[#faf8f5] dark:bg-neutral-800/60 p-4 rounded-2xl border border-[#e5e3de] dark:border-neutral-700/50 text-xs">
          <div className="flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Two-sided mutual consent required</span>
          </div>
          <div className="flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Zero-Knowledge End-to-End Encryption preserved</span>
          </div>
          <div className="flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Never reveals your real identity or email to the stranger</span>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 text-center font-medium">{error}</p>}

        <div className="space-y-2.5 pt-2">
          {isAuthenticated ? (
            <button
              onClick={handleDirectSaveRequest}
              disabled={isSaveRequestPending}
              className="w-full py-3.5 px-5 rounded-full bg-coral hover:bg-coral-hover active:scale-95 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-coral/25 disabled:opacity-50"
            >
              {isSaveRequestPending ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>Request Pending...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Save Request</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full py-3.5 px-5 rounded-full bg-coral hover:bg-coral-hover active:scale-95 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-coral/25 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{loading ? 'Redirecting to Google...' : 'Continue with Google'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
