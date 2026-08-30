'use client';

import React, { useState } from 'react';
import { Bookmark, X, Sparkles, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { IUser } from '@campus-stranger/shared-types';

interface SaveStrangerModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string;
  onSuccess?: (user: IUser) => void;
}

export function SaveStrangerModal({
  isOpen,
  onClose,
  conversationId,
  onSuccess,
}: SaveStrangerModalProps) {
  const [alias, setAlias] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      if (conversationId) {
        try {
          await apiClient.saveConversation(conversationId, alias.trim() || undefined);
        } catch {
          // Store in sessionStorage to ensure it is saved upon return if guest permissions differ
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('pending_save_conv', conversationId);
            if (alias.trim()) sessionStorage.setItem('pending_save_alias', alias.trim());
          }
        }
      }

      const googleUrl = apiClient.getGoogleOAuthUrl();
      if (typeof window !== 'undefined') {
        window.location.href = googleUrl;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to initiate Google authentication');
      setLoading(false);
    }
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
            Save This Stranger
          </h2>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-xs mx-auto leading-relaxed">
            Sign in once with Google to retain this encrypted chat and reconnect anytime without losing your conversation history.
          </p>
        </div>

        <div className="space-y-2.5 bg-[#faf8f5] dark:bg-neutral-800/60 p-4 rounded-2xl border border-[#e5e3de] dark:border-neutral-700/50 text-xs">
          <div className="flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Preserves current ongoing conversation</span>
          </div>
          <div className="flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>End-to-End Encryption remains active</span>
          </div>
          <div className="flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Never reveals your real identity or email to the stranger</span>
          </div>
        </div>

        <div className="space-y-1.5 text-left">
          <label htmlFor="alias-input" className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            Optional Custom Alias / Note
          </label>
          <input
            id="alias-input"
            type="text"
            placeholder="e.g. CS201 Study Partner, Dorm neighbor..."
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className="w-full px-4 py-2.5 rounded-full bg-white dark:bg-neutral-800 border border-[#e5e3de] dark:border-neutral-700 text-foreground text-xs sm:text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral"
          />
        </div>

        {error && <p className="text-xs text-red-500 text-center font-medium">{error}</p>}

        <div className="space-y-2.5 pt-2">
          <button
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full py-3.5 px-5 rounded-full bg-coral hover:bg-coral-hover active:scale-95 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-coral/25 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>{loading ? 'Redirecting to Google...' : 'Continue with Google'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
