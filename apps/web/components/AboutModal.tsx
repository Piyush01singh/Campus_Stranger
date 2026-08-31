'use client';

import React from 'react';
import { X, Lock, Zap, EyeOff, Bookmark } from 'lucide-react';
import { useActiveUsersCount } from '../lib/use-active-users';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const activeCount = useActiveUsersCount(1);
  const displayActiveCount = Math.max(1, activeCount);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto p-5 sm:p-7 md:p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-[#e5e3de] dark:border-neutral-800 shadow-2xl space-y-5 sm:space-y-6 text-foreground">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Hero Section: Centered Privacy Icon + Title + Subtitle */}
        <div className="text-center space-y-2.5 pt-1">
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-[#e8f7ee] dark:bg-[#162e22] text-[#22c55e] dark:text-[#86efac] flex items-center justify-center mx-auto shadow-xs border border-emerald-200/40 dark:border-emerald-800/30">
            <Lock className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.25]" />
          </div>

          <h2
            id="about-modal-title"
            className="text-xl sm:text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100"
          >
            Your Messages Stay Private
          </h2>

          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-xs mx-auto leading-relaxed">
            End-to-end encrypted, so only you and your stranger can read the messages.
          </p>
        </div>

        {/* Stacked Information Cards */}
        <div className="space-y-2.5 sm:space-y-3 text-left">
          {/* Card 1: End-to-End Encrypted */}
          <div className="p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3 sm:gap-3.5 transition-all">
            <div className="w-9 h-9 rounded-full bg-[#e8f7ee] dark:bg-[#162e22] text-[#22c55e] dark:text-[#86efac] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <Lock className="w-4 h-4 stroke-[2]" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100">
                End-to-End Encrypted
              </h3>
              <p className="text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Messages are encrypted on your device before sending. The server never sees your messages in plaintext.
              </p>
            </div>
          </div>

          {/* Card 2: Chat Instantly */}
          <div className="p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3 sm:gap-3.5 transition-all">
            <div className="w-9 h-9 rounded-full bg-[#fde8e3] dark:bg-[#341c19] text-[#ef4a30] dark:text-[#fca5a5] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <Zap className="w-4 h-4 stroke-[2]" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Chat Instantly
              </h3>
              <p className="text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                No sign-up or email is required. Choose a temporary nickname and start chatting right away.
              </p>
            </div>
          </div>

          {/* Card 3: Anonymous by Default */}
          <div className="p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3 sm:gap-3.5 transition-all">
            <div className="w-9 h-9 rounded-full bg-[#e6f0fa] dark:bg-[#152a42] text-[#2b6cb0] dark:text-[#90cdf4] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <EyeOff className="w-4 h-4 stroke-[2]" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Anonymous by Default
              </h3>
              <p className="text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Anonymous chats stay temporary. No account is created just to start chatting.
              </p>
            </div>
          </div>

          {/* Card 4: Save Chat With Mutual Consent */}
          <div className="p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3 sm:gap-3.5 transition-all">
            <div className="w-9 h-9 rounded-full bg-[#fbf0d9] dark:bg-[#312716] text-[#d97706] dark:text-[#fde047] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <Bookmark className="w-4 h-4 stroke-[2]" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Save Chat With Mutual Consent
              </h3>
              <p className="text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Logged-in users can choose to save a conversation. The other person must accept before the chat is saved for both.
              </p>
            </div>
          </div>
        </div>

        {/* Account feature note */}
        <p className="text-[11px] sm:text-xs text-center text-neutral-500 dark:text-neutral-400">
          Logged-in mode gives you access to account-based features such as saved chats.
        </p>

        {/* Real-time active users presence counter */}
        <div className="flex items-center justify-center gap-2 py-1 select-none text-[11px] sm:text-xs font-semibold text-neutral-700 dark:text-neutral-300">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span>
            {displayActiveCount} {displayActiveCount === 1 ? 'person is' : 'people are'} chatting on CampusStranger right now
          </span>
        </div>

        {/* Bottom CTA Action Button */}
        <button
          onClick={onClose}
          className="w-full py-3 sm:py-3.5 rounded-full bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-semibold text-xs sm:text-sm transition-all shadow-md active:scale-95"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
