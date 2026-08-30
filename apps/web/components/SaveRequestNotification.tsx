'use client';

import React from 'react';
import { Bookmark, Check, X } from 'lucide-react';

interface SaveRequestNotificationProps {
  requesterDisplayName: string;
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}

export function SaveRequestNotification({
  requesterDisplayName,
  onAccept,
  onDecline,
  loading = false,
}: SaveRequestNotificationProps) {
  return (
    <div
      role="region"
      aria-label="Save Request Notification"
      className="p-3.5 sm:p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 shadow-md animate-in slide-in-from-top-2 duration-300"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <Bookmark className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100">
              <span className="text-coral dark:text-[#fca5a5]">{requesterDisplayName}</span> wants to save this chat
            </p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Mutual consent required. If accepted, both participants retain encrypted conversation history.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            onClick={onDecline}
            disabled={loading}
            className="px-3 py-1.5 rounded-full bg-neutral-200/80 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition-colors active:scale-95 disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            <span>Decline</span>
          </button>

          <button
            onClick={onAccept}
            disabled={loading}
            className="px-4 py-1.5 rounded-full bg-coral hover:bg-coral-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm shadow-coral/20 active:scale-95 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}
