'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, Zap, EyeOff, Bookmark, MessageSquare } from 'lucide-react';
import { Navbar } from '../../components/Navbar';
import { SaveStrangerModal } from '../../components/SaveStrangerModal';
import { apiClient } from '../../lib/api-client';
import { useActiveUsersCount } from '../../lib/use-active-users';
import { IUser } from '@campus-stranger/shared-types';

export default function AboutPage() {
  const [currentUser, setCurrentUser] = useState<IUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const activeCount = useActiveUsersCount(1);
  const displayActiveCount = Math.max(1, activeCount);

  useEffect(() => {
    apiClient.getMe().then((user) => {
      setCurrentUser(user);
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col transition-colors selection:bg-coral-light selection:text-coral-dark">
      <Navbar
        user={currentUser}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onLogout={async () => {
          await apiClient.logout();
          setCurrentUser(null);
        }}
      />

      <main className="flex-1 max-w-xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-center">
        {/* Navigation & Header */}
        <div className="mb-6 sm:mb-8">
          <Link
            href="/"
            aria-label="Back to home"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>

          {/* Hero Section: Centered Privacy Icon + Title + Subtitle */}
          <div className="text-center space-y-3">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#e8f7ee] dark:bg-[#162e22] text-[#22c55e] dark:text-[#86efac] flex items-center justify-center mx-auto shadow-xs border border-emerald-200/40 dark:border-emerald-800/30">
              <Lock className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.25]" />
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
              Your Messages Stay Private
            </h1>

            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-sm mx-auto leading-relaxed">
              End-to-end encrypted, so only you and your stranger can read the messages.
            </p>
          </div>
        </div>

        {/* Stacked Information Cards */}
        <div className="space-y-3 sm:space-y-3.5 text-left mb-6">
          {/* Card 1: End-to-End Encrypted */}
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3.5 sm:gap-4 transition-all">
            <div className="w-10 h-10 rounded-full bg-[#e8f7ee] dark:bg-[#162e22] text-[#22c55e] dark:text-[#86efac] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <Lock className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">
                End-to-End Encrypted
              </h2>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Messages are encrypted on your device before sending. The server never sees your messages in plaintext.
              </p>
            </div>
          </div>

          {/* Card 2: Chat Instantly */}
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3.5 sm:gap-4 transition-all">
            <div className="w-10 h-10 rounded-full bg-[#fde8e3] dark:bg-[#341c19] text-[#ef4a30] dark:text-[#fca5a5] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <Zap className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">
                Chat Instantly
              </h2>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                No sign-up or email is required. Choose a temporary nickname and start chatting right away.
              </p>
            </div>
          </div>

          {/* Card 3: Anonymous by Default */}
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3.5 sm:gap-4 transition-all">
            <div className="w-10 h-10 rounded-full bg-[#e6f0fa] dark:bg-[#152a42] text-[#2b6cb0] dark:text-[#90cdf4] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <EyeOff className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">
                Anonymous by Default
              </h2>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Anonymous chats stay temporary. No account is created just to start chatting.
              </p>
            </div>
          </div>

          {/* Card 4: Save Chat With Mutual Consent */}
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3.5 sm:gap-4 transition-all">
            <div className="w-10 h-10 rounded-full bg-[#fbf0d9] dark:bg-[#312716] text-[#d97706] dark:text-[#fde047] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <Bookmark className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">
                Save Chat With Mutual Consent
              </h2>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Logged-in users can choose to save a conversation. The other person must accept before the chat is saved for both.
              </p>
            </div>
          </div>
        </div>

        {/* Account feature note */}
        <p className="text-xs sm:text-sm text-center text-neutral-500 dark:text-neutral-400 mb-4">
          Logged-in mode gives you access to account-based features such as saved chats.
        </p>

        {/* Real-time active users presence counter */}
        <div className="flex items-center justify-center gap-2 py-1 select-none text-xs sm:text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-8">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span>
            {displayActiveCount} {displayActiveCount === 1 ? 'person is' : 'people are'} chatting on CampusStranger right now
          </span>
        </div>

        {/* Start Chatting CTA */}
        <div className="text-center">
          <Link
            href="/chat"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-coral hover:bg-coral-hover text-white font-semibold text-sm shadow-md shadow-coral/25 transition-all active:scale-95 w-full sm:w-auto"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Start Chatting</span>
          </Link>
        </div>
      </main>

      <SaveStrangerModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => setCurrentUser(u)}
      />
    </div>
  );
}
