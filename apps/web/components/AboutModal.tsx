'use client';

import React from 'react';
import { X, Lock, Users, Sparkles, KeyRound } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto p-6 sm:p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-[#e5e3de] dark:border-neutral-800 shadow-2xl space-y-6 text-foreground">
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon + Title */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-coral-light dark:bg-coral-dark/30 text-coral dark:text-[#fca5a5] text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>CampusStranger Platform</span>
          </div>
          <h2 id="about-modal-title" className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
            About CampusStranger
          </h2>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
            CampusStranger connects students anonymously for serendipitous, authentic conversations
            without compromising their privacy.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="space-y-3 text-left">
          <div className="p-3.5 rounded-2xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-sage-light dark:bg-sage-dark/40 text-sage-dark dark:text-[#86efac] flex items-center justify-center shrink-0 mt-0.5">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-200">Zero-Knowledge E2EE</h4>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Messages are encrypted on your device using Double Ratchet-inspired W3C WebCrypto before sending. The server never sees plaintext.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-coral-light dark:bg-coral-dark/40 text-coral-dark dark:text-[#fca5a5] flex items-center justify-center shrink-0 mt-0.5">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-200">Instant Guest Entry</h4>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                No sign-up or email is required to chat. Pick a temporary nickname or remain completely anonymous.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-buttercup-light dark:bg-buttercup-dark/40 text-buttercup-dark dark:text-[#fde047] flex items-center justify-center shrink-0 mt-0.5">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-200">Save Connections Later</h4>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                When you meet someone interesting, link Google OAuth in 1-click to save the encrypted conversation and resume anytime.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-full bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-semibold text-xs sm:text-sm transition-all shadow-md"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
