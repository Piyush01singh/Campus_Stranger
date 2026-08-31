'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, ArrowRight, Lock, EyeOff, Users, RefreshCw, Play } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { SaveStrangerModal } from '../components/SaveStrangerModal';
import { apiClient } from '../lib/api-client';
import { socketClient } from '../lib/socket-client';
import { useActiveUsersCount } from '../lib/use-active-users';
import { IUser } from '@campus-stranger/shared-types';

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<IUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const activeUsersCount = useActiveUsersCount(1);

  useEffect(() => {
    apiClient.getMe().then((u) => setCurrentUser(u));
  }, []);

  const handleResumeChat = () => {
    router.push('/chat');
  };

  const handleStartNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem('cs_active_conv');
        } catch {
          // sessionStorage not accessible
        }
      }

      if (currentUser?.accountType === 'authenticated') {
        // Authenticated user starts chat directly with their existing identity
        router.push('/chat');
      } else {
        // Guest user starts chat with nickname
        apiClient.clearToken();
        socketClient.disconnect();
        const guest = await apiClient.createGuest(nickname.trim() || undefined);
        setCurrentUser(guest.user);
        router.push(`/chat${nickname.trim() ? `?nickname=${encodeURIComponent(nickname.trim())}` : ''}`);
      }
    } catch (err) {
      console.error('Failed to initiate chat:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('cs_active_conv');
      } catch {
        // sessionStorage not accessible
      }
    }
    await apiClient.logout();
    socketClient.disconnect();
    setCurrentUser(null);
  };

  const displayActiveCount = activeUsersCount > 0 ? activeUsersCount : 1;

  return (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-background text-foreground transition-colors selection:bg-coral-light selection:text-coral-dark overflow-x-hidden">
      {/* 1. Header Navigation */}
      <Navbar
        user={currentUser}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* 2. Hero & Central Presentation */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-8 max-w-4xl mx-auto w-full">
        {/* Hero Typography Group */}
        <div className="relative text-center mb-6 sm:mb-8 select-none max-w-full">
          {/* Handwritten Annotation + Hand-drawn Arrow (Responsively bounded) */}
          <div className="hidden xs:flex sm:flex absolute -top-12 -left-2 sm:-top-14 sm:-left-16 lg:-top-16 lg:-left-24 -rotate-6 flex-col items-end pointer-events-none z-10">
            <div className="font-handwriting text-base sm:text-xl lg:text-2xl text-neutral-700 dark:text-neutral-300 font-bold leading-[1.08] text-left">
              <span>Same</span>
              <br />
              <span>Campus.</span>
              <br />
              <span>New People.</span>
            </div>

            {/* Hand-drawn Curving Arrow */}
            <svg
              className="w-8 h-6 sm:w-12 sm:h-8 text-neutral-700 dark:text-neutral-300 mt-1 mr-1"
              viewBox="0 0 54 36"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M 6 4 C 18 16, 32 24, 48 26" />
              <path d="M 36 18 L 49 27 L 38 33" />
            </svg>
          </div>

          {/* Primary Headline: "Meet" */}
          <h1 className="text-[44px] xs:text-[52px] sm:text-6xl md:text-[72px] lg:text-[78px] font-black text-neutral-900 dark:text-neutral-50 tracking-[-0.035em] leading-[0.98]">
            Meet
          </h1>

          {/* Accent Headline: "Real People." + Underline */}
          <div className="relative inline-block mt-0.5 sm:mt-1">
            <h2 className="text-[44px] xs:text-[52px] sm:text-6xl md:text-[72px] lg:text-[78px] font-black text-coral tracking-[-0.035em] leading-[0.98]">
              Real People.
            </h2>

            {/* Hand-drawn Accent Underline */}
            <svg
              className="absolute -bottom-2.5 sm:-bottom-3.5 left-0 w-full h-3 sm:h-4 text-coral pointer-events-none"
              viewBox="0 0 300 18"
              fill="none"
              preserveAspectRatio="none"
            >
              <path
                d="M 4 9 C 60 15, 170 15, 296 7 C 220 13, 110 13, 4 9 Z"
                fill="currentColor"
              />
              <path
                d="M 12 11 C 85 15, 210 15, 288 10"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* 3. Hero Nickname Pill Input Form */}
        <div className="w-full max-w-[470px] space-y-3">
          <form
            onSubmit={handleStartNewChat}
            className="w-full h-14 sm:h-16 rounded-full bg-white dark:bg-neutral-900 border border-[#e5e3de] dark:border-neutral-800 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-none flex items-center px-4 sm:px-5 gap-2 sm:gap-3 transition-all focus-within:ring-2 focus-within:ring-coral/40 focus-within:border-coral"
          >
            <User className="w-5 h-5 text-neutral-400 dark:text-neutral-500 shrink-0 ml-0.5" strokeWidth={1.75} />

            <input
              id="nickname-input"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Pick a nickname"
              maxLength={24}
              disabled={loading}
              className="flex-1 bg-transparent border-none outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-xs sm:text-sm md:text-base font-normal min-w-0"
            />

            <button
              type="submit"
              disabled={loading}
              aria-label="Start Anonymous Chat"
              title="Start Chatting"
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-coral hover:bg-coral-hover active:scale-95 text-white flex items-center justify-center shadow-md shadow-coral/25 transition-all shrink-0 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
              )}
            </button>
          </form>

          {/* 4. Active Users Social Proof Counter (Placed directly below nickname input) */}
          <div className="flex items-center justify-center gap-2 py-1 select-none">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-xs sm:text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              {displayActiveCount} {displayActiveCount === 1 ? 'person' : 'people'} online now
            </span>

            {currentUser && (
              <button
                onClick={handleResumeChat}
                className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-coral hover:underline"
              >
                <Play className="w-2.5 h-2.5 fill-current" />
                <span>Resume previous chat</span>
              </button>
            )}
          </div>
        </div>

        {/* 5. Sub-descriptor Text */}
        <p className="text-[9px] xs:text-[10px] sm:text-[11px] font-semibold tracking-[0.25em] text-neutral-500 dark:text-neutral-400 uppercase mt-3 mb-8 sm:mb-10 select-none text-center">
          ANONYMOUS &nbsp;•&nbsp; ENCRYPTED &nbsp;•&nbsp; JUST CHAT
        </p>

        {/* 6. Three Minimalist Feature Blocks (Cohesive Group) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-8 md:gap-10 w-full max-w-lg mx-auto text-center select-none">
          {/* Feature 1: Sage green circle */}
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#e2f2e6] dark:bg-[#162e22] flex items-center justify-center text-[#225835] dark:text-[#86efac] mb-2 shadow-xs">
              <Lock className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={1.5} />
            </div>
            <div className="space-y-0.5">
              <p className="font-semibold text-xs sm:text-[13px] text-neutral-800 dark:text-neutral-200 leading-snug">
                Your chats.
              </p>
              <p className="font-semibold text-xs sm:text-[13px] text-neutral-800 dark:text-neutral-200 leading-snug">
                Only yours.
              </p>
            </div>
          </div>

          {/* Feature 2: Blush coral circle */}
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#fde8e3] dark:bg-[#341c19] flex items-center justify-center text-[#7e3125] dark:text-[#fca5a5] mb-2 shadow-xs">
              <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={1.5} />
            </div>
            <div className="space-y-0.5">
              <p className="font-semibold text-xs sm:text-[13px] text-neutral-800 dark:text-neutral-200 leading-snug">
                No plaintext.
              </p>
              <p className="font-semibold text-xs sm:text-[13px] text-neutral-800 dark:text-neutral-200 leading-snug">
                Anywhere.
              </p>
            </div>
          </div>

          {/* Feature 3: Warm buttercup circle */}
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#fbf0d9] dark:bg-[#312716] flex items-center justify-center text-[#664d1a] dark:text-[#fde047] mb-2 shadow-xs">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={1.5} />
            </div>
            <div className="space-y-0.5">
              <p className="font-semibold text-xs sm:text-[13px] text-neutral-800 dark:text-neutral-200 leading-snug">
                Meet.
              </p>
              <p className="font-semibold text-xs sm:text-[13px] text-neutral-800 dark:text-neutral-200 leading-snug">
                Move on. Or stay.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* 7. Save Stranger / Auth Modal */}
      <SaveStrangerModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => setCurrentUser(u)}
      />
    </div>
  );
}
