'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sun, Moon, User as UserIcon } from 'lucide-react';
import { IUser } from '@campus-stranger/shared-types';
import { useTheme } from './theme-provider';
import { AboutModal } from './AboutModal';

interface NavbarProps {
  user: IUser | null;
  onOpenAuthModal?: () => void;
}

export function Navbar({ user, onOpenAuthModal }: NavbarProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [aboutOpen, setAboutOpen] = useState(false);

  const isChatActive = pathname === '/' || pathname.startsWith('/chat');
  const isSavedActive = pathname.startsWith('/saved');

  return (
    <>
      <header className="w-full bg-background/90 backdrop-blur-md sticky top-0 z-40 transition-colors border-b border-border/40">
        <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-18 flex items-center justify-between gap-2 sm:gap-4">
          {/* 1. Brand Logo */}
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2 group select-none shrink-0">
            {/* Custom Brand Mark: Two Overlapping Speech Bubbles with Radiating Spark */}
            <div className="relative flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 shrink-0">
              {/* Radiating Spark on top-left of first bubble */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="absolute -top-1 -left-0.5 sm:-top-1.5 sm:-left-1 w-3 h-3 sm:w-4 sm:h-4 text-coral"
              >
                <path d="M12 3v3M6 6l2 2M3 12h3" />
              </svg>

              {/* Bubble 1 (Left): Coral with 3 dark dots */}
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#ef4a30] flex items-center justify-center shadow-xs z-10">
                <div className="flex gap-[1.5px] sm:gap-[2px]">
                  <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-neutral-900" />
                  <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-neutral-900" />
                  <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-neutral-900" />
                </div>
              </div>

              {/* Bubble 2 (Right): Pastel Yellow overlapping with 1 dark dot */}
              <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#fde396] -ml-2 sm:-ml-2.5 mt-1 border border-white dark:border-neutral-900 shadow-xs flex items-center justify-center">
                <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-neutral-900 ml-0.5 sm:ml-1" />
              </div>
            </div>

            {/* Wordmark */}
            <span className="text-base sm:text-lg lg:text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 flex items-baseline">
              Campus
              <span className="font-script text-coral text-lg sm:text-xl lg:text-2xl ml-0.5 font-bold">
                Stranger
              </span>
            </span>
          </Link>

          {/* 2. Center Navigation Links (Desktop & Tablet) */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-xs sm:text-sm font-medium">
            <Link
              href="/"
              className={`relative py-1.5 transition-colors ${
                isChatActive
                  ? 'text-neutral-900 dark:text-neutral-100 font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              <span>Chat</span>
              {isChatActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-coral rounded-full" />
              )}
            </Link>

            <Link
              href="/saved"
              className={`relative py-1.5 transition-colors ${
                isSavedActive
                  ? 'text-neutral-900 dark:text-neutral-100 font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              <span>Saved</span>
              {isSavedActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-coral rounded-full" />
              )}
            </Link>

            <button
              onClick={() => setAboutOpen(true)}
              className="py-1.5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            >
              About
            </button>
          </nav>

          {/* 3. Right Action Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 lg:gap-3 shrink-0">
            {/* Security Pill: "● Encrypted" (Responsive: hides text on extra small mobile to prevent any overflow) */}
            <div className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-[#e8f7ee] dark:bg-[#162e22] text-[#2d5e3f] dark:text-[#86efac] text-[11px] sm:text-xs font-semibold select-none border border-transparent dark:border-[#225835]/30 shrink-0">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#22c55e] shrink-0" />
              <span className="hidden xs:inline sm:inline">Encrypted</span>
            </div>

            {/* User Session / Sign In Pill */}
            {user ? (
              <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-white dark:bg-neutral-800 border border-[#e5e3de] dark:border-neutral-700 text-[11px] sm:text-xs font-semibold shadow-xs shrink-0 max-w-[130px] sm:max-w-[160px]">
                <UserIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-coral shrink-0" />
                <span className="truncate">{user.displayName}</span>
                {user.accountType === 'authenticated' && (
                  <span className="hidden sm:inline px-1.5 py-0.5 rounded-full bg-coral/15 text-coral text-[9px] font-bold shrink-0">
                    Saved
                  </span>
                )}
              </div>
            ) : (
              onOpenAuthModal && (
                <button
                  onClick={onOpenAuthModal}
                  className="px-3.5 sm:px-5 py-1 sm:py-1.5 sm:py-2 rounded-full bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-[11px] sm:text-xs sm:text-sm font-semibold transition-all shadow-xs active:scale-95 shrink-0"
                >
                  Sign In
                </button>
              )
            )}

            {/* Direct Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              className="p-1.5 sm:p-2 rounded-full text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors shrink-0"
            >
              {theme === 'light' ? (
                <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              ) : (
                <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation sub-bar (Clean & responsive, no horizontal scroll) */}
        <div className="md:hidden flex items-center justify-center gap-6 py-2 border-t border-[#e5e3de]/50 dark:border-neutral-800 text-xs font-medium bg-background/95 w-full">
          <Link
            href="/"
            className={`py-0.5 ${
              isChatActive
                ? 'text-coral font-bold border-b border-coral'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            Chat
          </Link>
          <Link
            href="/saved"
            className={`py-0.5 ${
              isSavedActive
                ? 'text-coral font-bold border-b border-coral'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            Saved
          </Link>
          <button
            onClick={() => setAboutOpen(true)}
            className="py-0.5 text-neutral-600 dark:text-neutral-400"
          >
            About
          </button>
        </div>
      </header>

      <AboutModal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}
