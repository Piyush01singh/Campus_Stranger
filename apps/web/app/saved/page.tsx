'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bookmark, MessageSquare, Trash2, ArrowLeft, Lock, Users, Sparkles, AlertTriangle } from 'lucide-react';
import { Navbar } from '../../components/Navbar';
import { SaveStrangerModal } from '../../components/SaveStrangerModal';
import { apiClient } from '../../lib/api-client';
import { socketClient } from '../../lib/socket-client';
import { IUser } from '@campus-stranger/shared-types';

interface SavedStrangerItem {
  conversationId: string;
  partnerDisplayName: string;
  savedAt: string;
  lastMessageAt?: string;
  isMutualSaved?: boolean;
}

export default function SavedStrangersPage() {
  const [currentUser, setCurrentUser] = useState<IUser | null>(null);
  const [savedList, setSavedList] = useState<SavedStrangerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);
  const [deletingPartnerName, setDeletingPartnerName] = useState<string>('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    async function loadSaved() {
      setLoading(true);
      try {
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          const authToken = urlParams.get('auth_token');
          if (authToken) {
            apiClient.setToken(authToken);
            window.history.replaceState({}, '', '/saved');
          }
        }

        const user = await apiClient.getMe();
        setCurrentUser(user);

        if (user) {
          const list = await apiClient.getSavedStrangers();
          setSavedList(list);

          // Connect socket to receive realtime updates like mutual deletion
          await socketClient.connect();
        }
      } catch (err) {
        console.error('Error fetching saved strangers:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSaved();

    // Listen for realtime bilateral deletion by partner
    const unsubDeleted = socketClient.onSaveDeleted((payload) => {
      setSavedList((prev) => prev.filter((item) => item.conversationId !== payload.conversationId));
    });

    return () => {
      unsubDeleted();
    };
  }, []);

  const confirmDelete = (conversationId: string, partnerDisplayName: string) => {
    setDeletingConvId(conversationId);
    setDeletingPartnerName(partnerDisplayName);
  };

  const handleExecuteDelete = async () => {
    if (!deletingConvId) return;
    setDeleteLoading(true);
    try {
      await apiClient.deleteMutualSavedConnection(deletingConvId);
      setSavedList((prev) => prev.filter((item) => item.conversationId !== deletingConvId));
      setDeletingConvId(null);
    } catch (err) {
      console.error('Failed to remove saved connection:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground transition-colors selection:bg-coral-light selection:text-coral-dark">
      <Navbar
        user={currentUser}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onLogout={async () => {
          await apiClient.logout();
          socketClient.disconnect();
          setCurrentUser(null);
          setSavedList([]);
        }}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-full text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
                Saved Strangers
              </h1>
              <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
                Persistent end-to-end encrypted conversations with mutual consent.
              </p>
            </div>
          </div>

          <Link
            href="/chat"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-coral hover:bg-coral-hover text-white font-semibold text-xs sm:text-sm shadow-md shadow-coral/20 transition-all active:scale-95"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Find New Stranger</span>
          </Link>
        </div>

        {/* Guest Warning / CTA Banner */}
        {currentUser && currentUser.accountType === 'guest' && (
          <div className="p-4 sm:p-5 rounded-3xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>You are browsing as Guest</span>
              </h4>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/70">
                Sign in with Google to permanently link your saved strangers and sync securely across devices.
              </p>
            </div>
            <button
              onClick={() => setAuthModalOpen(true)}
              className="px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors shrink-0 shadow-sm"
            >
              Sign In with Google
            </button>
          </div>
        )}

        {/* Saved List */}
        {loading ? (
          <div className="py-24 text-center text-xs sm:text-sm text-neutral-400 animate-pulse">
            Loading your saved conversations...
          </div>
        ) : savedList.length === 0 ? (
          <div className="p-12 sm:p-16 text-center rounded-3xl border border-dashed border-[#e5e3de] dark:border-neutral-800 bg-white/40 dark:bg-neutral-900/40 space-y-4">
            <div className="w-14 h-14 rounded-full bg-coral-light dark:bg-coral-dark/40 text-coral dark:text-[#fca5a5] flex items-center justify-center mx-auto shadow-sm">
              <Bookmark className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">No Saved Strangers Yet</h3>
              <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto leading-relaxed">
                When chatting with someone you connect with, click &quot;Save Stranger&quot; to initiate mutual saving of your encrypted conversation.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-coral hover:bg-coral-hover text-white font-semibold text-xs sm:text-sm shadow-md shadow-coral/20 transition-all active:scale-95"
              >
                <Users className="w-4 h-4" />
                <span>Start Chatting Now</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {savedList.map((item) => (
              <div
                key={item.conversationId}
                className="p-5 rounded-3xl border border-[#e5e3de] dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4 shadow-sm hover:border-coral/40 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-coral-light dark:bg-coral-dark/40 text-coral dark:text-[#fca5a5] flex items-center justify-center font-bold text-sm shadow-sm">
                      {item.partnerDisplayName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm sm:text-base text-neutral-900 dark:text-neutral-100">
                          {item.partnerDisplayName}
                        </h3>
                        {item.isMutualSaved && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#e8f7ee] dark:bg-[#162e22] text-[#2d5e3f] dark:text-[#86efac] font-bold">
                            Mutual Save
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400">
                        Saved on {new Date(item.savedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => confirmDelete(item.conversationId, item.partnerDisplayName)}
                    title="Delete saved conversation"
                    aria-label={`Delete saved connection with ${item.partnerDisplayName}`}
                    className="p-2 rounded-full text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="pt-3 border-t border-[#e5e3de]/60 dark:border-neutral-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#2d5e3f] dark:text-[#86efac] font-semibold bg-[#e8f7ee] dark:bg-[#162e22] px-2.5 py-0.5 rounded-full">
                    <Lock className="w-3 h-3" />
                    <span>E2EE Active</span>
                  </div>

                  <Link
                    href={`/chat/${item.conversationId}`}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-coral-light dark:bg-coral-dark/30 text-coral dark:text-[#fca5a5] hover:bg-coral hover:text-white text-xs font-bold transition-all active:scale-95"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Continue Chat</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Mutual Deletion Confirmation Modal */}
      {deletingConvId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete Saved Conversation"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
        >
          <div className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-[#e5e3de] dark:border-neutral-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                Delete Saved Conversation?
              </h3>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Deleting this saved chat with <strong>{deletingPartnerName}</strong> removes the saved connection and erases encrypted message history from the server for both of you.
            </p>

            <div className="p-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800/60 text-[11px] text-neutral-500 dark:text-neutral-400">
              Note: Server-side stored ciphertext is erased immediately. Local client caches on offline devices will be unlinked upon reconnection.
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setDeletingConvId(null)}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-full text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleExecuteDelete}
                disabled={deleteLoading}
                className="px-5 py-2 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : 'Delete for Both'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SaveStrangerModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => setCurrentUser(u)}
      />
    </div>
  );
}
