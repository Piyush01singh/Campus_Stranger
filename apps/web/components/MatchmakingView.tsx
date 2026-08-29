'use client';

import React from 'react';
import { Users, Lock, X, Sparkles } from 'lucide-react';

interface MatchmakingViewProps {
  onCancel: () => void;
}

export function MatchmakingView({ onCancel }: MatchmakingViewProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto space-y-8 animate-in fade-in select-none">
      <div className="relative flex items-center justify-center my-4">
        {/* Animated Radar Pulse Rings in Coral */}
        <div className="absolute w-52 h-52 rounded-full border-2 border-coral/20 animate-ping" />
        <div className="absolute w-40 h-40 rounded-full border border-coral/40 animate-pulse" />
        <div className="w-24 h-24 rounded-full bg-coral-light dark:bg-coral-dark/40 border-2 border-coral flex items-center justify-center text-coral dark:text-[#fca5a5] shadow-xl shadow-coral/20">
          <Users className="w-10 h-10 animate-bounce" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#e8f7ee] dark:bg-[#162e22] text-[#2d5e3f] dark:text-[#86efac] text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Double Ratchet Cryptographic Handshake</span>
        </div>

        <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
          Finding a Stranger...
        </h2>
        <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-xs mx-auto leading-relaxed">
          Connecting you with another campus student. Initializing ephemeral encryption keys.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full text-left">
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-[#e5e3de] dark:border-neutral-800 shadow-sm">
          <div className="w-8 h-8 rounded-full bg-sage-light dark:bg-sage-dark/40 text-sage-dark dark:text-[#86efac] flex items-center justify-center mb-2">
            <Lock className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-200">Zero Plaintext</h4>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Server cannot read your messages.</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-[#e5e3de] dark:border-neutral-800 shadow-sm">
          <div className="w-8 h-8 rounded-full bg-coral-light dark:bg-coral-dark/40 text-coral dark:text-[#fca5a5] flex items-center justify-center mb-2">
            <Sparkles className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-200">Instant Anonymous</h4>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">No account required to chat.</p>
        </div>
      </div>

      <button
        onClick={onCancel}
        className="inline-flex items-center gap-2 py-3 px-6 rounded-full border border-[#e5e3de] dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 font-semibold text-xs sm:text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 shadow-sm transition-all active:scale-95"
      >
        <X className="w-4 h-4" />
        <span>Cancel Matchmaking</span>
      </button>
    </div>
  );
}
