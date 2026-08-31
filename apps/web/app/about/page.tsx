'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, EyeOff, Bookmark, MessageSquare } from 'lucide-react';
import { Navbar } from '../../components/Navbar';
import { SaveStrangerModal } from '../../components/SaveStrangerModal';
import { apiClient } from '../../lib/api-client';
import { IUser } from '@campus-stranger/shared-types';

export default function AboutPage() {
  const [currentUser, setCurrentUser] = useState<IUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    apiClient
      .getMe()
      .then((user) => {
        setCurrentUser(user);
      })
      .catch(() => {});
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

        {/* Stacked Information Cards (3 Cards) */}
        <div className="space-y-3 sm:space-y-3.5 text-left mb-8">
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

          {/* Card 2: Anonymous by Default */}
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3.5 sm:gap-4 transition-all">
            <div className="w-10 h-10 rounded-full bg-[#e6f0fa] dark:bg-[#152a42] text-[#2b6cb0] dark:text-[#90cdf4] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <EyeOff className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">
                Anonymous by Default
              </h2>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Chat without an account. Choose a nickname and start chatting. Anonymous conversations stay temporary.
              </p>
            </div>
          </div>

          {/* Card 3: Save Chat With Mutual Consent */}
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-[#faf8f5] dark:bg-neutral-800/60 border border-[#e5e3de] dark:border-neutral-700/50 flex items-start gap-3.5 sm:gap-4 transition-all">
            <div className="w-10 h-10 rounded-full bg-[#fbf0d9] dark:bg-[#312716] text-[#d97706] dark:text-[#fde047] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <Bookmark className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">
                Save Chat With Mutual Consent
              </h2>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Logged-in users can choose to save a chat. The other person must accept before it is saved for both.
              </p>
            </div>
          </div>
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
