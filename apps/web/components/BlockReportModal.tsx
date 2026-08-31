'use client';

import React, { useState } from 'react';
import { Ban, Flag, X } from 'lucide-react';
import { ReportReason } from '@campus-stranger/shared-types';

interface BlockReportModalProps {
  isOpen: boolean;
  mode: 'block' | 'report';
  partnerDisplayName: string;
  onClose: () => void;
  onConfirmBlock: () => void;
  onConfirmReport: (reason: ReportReason, details?: string) => void;
}

export function BlockReportModal({
  isOpen,
  mode,
  partnerDisplayName,
  onClose,
  onConfirmBlock,
  onConfirmReport,
}: BlockReportModalProps) {
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');

  if (!isOpen) return null;

  const isBlock = mode === 'block';

  const handleSubmit = () => {
    if (isBlock) {
      onConfirmBlock();
    } else {
      onConfirmReport(reason, details.trim() || undefined);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-report-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto p-6 sm:p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-[#e5e3de] dark:border-neutral-800 shadow-2xl space-y-6 text-foreground">
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-sm ${
              isBlock
                ? 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400'
                : 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
            }`}
          >
            {isBlock ? <Ban className="w-6 h-6" /> : <Flag className="w-6 h-6" />}
          </div>
          <h2 id="block-report-title" className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
            {isBlock ? `Block ${partnerDisplayName}?` : `Report ${partnerDisplayName}`}
          </h2>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-xs mx-auto leading-relaxed">
            {isBlock
              ? 'You will end this conversation immediately and will never be matched with this stranger again.'
              : 'Our safety system reviews reports to maintain a respectful and safe campus environment.'}
          </p>
        </div>

        {!isBlock && (
          <div className="space-y-3 text-left">
            <div>
              <label htmlFor="report-reason-select" className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Reason for report
              </label>
              <select
                id="report-reason-select"
                value={reason}
                onChange={(e) => setReason(e.target.value as ReportReason)}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#faf8f5] dark:bg-neutral-800 border border-[#e5e3de] dark:border-neutral-700 text-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral"
              >
                <option value="harassment">Harassment / Bullying</option>
                <option value="inappropriate_content">Inappropriate Content</option>
                <option value="spam">Spam or Advertising</option>
                <option value="bot_behavior">Suspected Bot / Automation</option>
                <option value="illegal_content">Illegal Content</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="report-details-textarea" className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Additional Details (Optional)
              </label>
              <textarea
                id="report-details-textarea"
                rows={3}
                placeholder="Describe what occurred..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#faf8f5] dark:bg-neutral-800 border border-[#e5e3de] dark:border-neutral-700 text-foreground text-xs sm:text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral resize-none"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-full border border-[#e5e3de] dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold text-xs sm:text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className={`flex-1 py-3 px-4 rounded-full font-semibold text-xs sm:text-sm text-white transition-all shadow-md active:scale-95 ${
              isBlock
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {isBlock ? 'Block Stranger' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
