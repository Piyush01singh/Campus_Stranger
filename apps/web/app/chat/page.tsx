'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '../../components/Navbar';
import { MatchmakingView } from '../../components/MatchmakingView';
import { ChatRoom } from '../../components/ChatRoom';
import { SaveStrangerModal } from '../../components/SaveStrangerModal';
import { BlockReportModal } from '../../components/BlockReportModal';
import { apiClient } from '../../lib/api-client';
import { socketClient } from '../../lib/socket-client';
import {
  IUser,
  IWsMatchFoundPayload,
  IWsSaveRequestReceivedPayload,
  ReportReason,
  toConversationId,
} from '@campus-stranger/shared-types';

const ACTIVE_CONV_STORAGE_KEY = 'cs_active_conv';

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nicknameParam = searchParams.get('nickname');
  const returnConvParam = searchParams.get('return_conv');

  const [currentUser, setCurrentUser] = useState<IUser | null>(null);
  const [matchState, setMatchState] = useState<'idle' | 'searching' | 'matched' | 'ended'>('searching');
  const [activeConversation, setActiveConversation] = useState<IWsMatchFoundPayload | null>(null);
  const [endedReason, setEndedReason] = useState<string | null>(null);

  // Mutual Save Request State
  const [incomingSaveRequest, setIncomingSaveRequest] = useState<IWsSaveRequestReceivedPayload | null>(null);
  const [isMutualSaved, setIsMutualSaved] = useState(false);
  const [isSaveRequestPending, setIsSaveRequestPending] = useState(false);

  // Modals
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const initAttemptedRef = useRef(false);

  // 1. Persistent Realtime Socket Listeners (Never torn down on URL query changes)
  useEffect(() => {
    // A. Match Found
    const unsubMatch = socketClient.onMatchFound((payload) => {
      setActiveConversation(payload);
      setMatchState('matched');
      setEndedReason(null);
      setIncomingSaveRequest(null);
      setIsMutualSaved(false);
      setIsSaveRequestPending(false);

      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(ACTIVE_CONV_STORAGE_KEY, JSON.stringify(payload));
        } catch {
          // sessionStorage not accessible
        }
      }
    });

    // B. Chat Ended
    const unsubEnded = socketClient.onChatEnded((reason) => {
      setEndedReason(reason);
      setMatchState('ended');
      setIncomingSaveRequest(null);
      setIsSaveRequestPending(false);

      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem(ACTIVE_CONV_STORAGE_KEY);
        } catch {
          // sessionStorage not accessible
        }
      }
    });

    // C. Incoming Save Request
    const unsubSaveReq = socketClient.onSaveRequestReceived((payload) => {
      setIncomingSaveRequest(payload);
    });

    // D. Save Accepted
    const unsubSaveAccept = socketClient.onSaveAccepted(() => {
      setIsMutualSaved(true);
      setIncomingSaveRequest(null);
      setIsSaveRequestPending(false);
    });

    // E. Save Declined
    const unsubSaveDecline = socketClient.onSaveDeclined(() => {
      setIncomingSaveRequest(null);
      setIsSaveRequestPending(false);
    });

    // F. Save Cancelled
    const unsubSaveCancel = socketClient.onSaveCancelled(() => {
      setIncomingSaveRequest(null);
      setIsSaveRequestPending(false);
    });

    // G. Sync Completed (Restores messages & pending save request state)
    const unsubSync = socketClient.onSyncCompleted((payload) => {
      if (payload.pendingSaveRequest) {
        setIncomingSaveRequest(payload.pendingSaveRequest);
      }
    });

    return () => {
      unsubMatch();
      unsubEnded();
      unsubSaveReq();
      unsubSaveAccept();
      unsubSaveDecline();
      unsubSaveCancel();
      unsubSync();
    };
  }, []);

  // 2. Deterministic One-Time Chat State & Auth Hydration
  useEffect(() => {
    if (initAttemptedRef.current) return;
    initAttemptedRef.current = true;

    async function initLifecycle() {
      try {
        // Read return conversation parameter if returning from OAuth
        let targetReturnConv = returnConvParam;
        if (typeof window !== 'undefined' && !targetReturnConv) {
          const urlParams = new URLSearchParams(window.location.search);
          targetReturnConv = urlParams.get('return_conv');
        }

        // 1. Hydrate authentication state from server session cookie
        let user = await apiClient.getMe();
        if (!user) {
          const guest = await apiClient.createGuest(nicknameParam || undefined);
          user = guest.user;
        }
        setCurrentUser(user);

        // 2. Connect & Authenticate WebSocket
        await socketClient.connect();

        // 3. Determine if restoring conversation or starting matchmaking
        if (targetReturnConv) {
          // Clean up URL query parameters without triggering router teardown
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', '/chat');
          }

          const convId = toConversationId(targetReturnConv);
          const restoredPayload: IWsMatchFoundPayload = {
            conversationId: convId,
            partnerDisplayName: 'Stranger',
            matchedAt: new Date().toISOString(),
          };

          setActiveConversation(restoredPayload);
          setMatchState('matched');

          if (typeof window !== 'undefined') {
            try {
              sessionStorage.setItem(ACTIVE_CONV_STORAGE_KEY, JSON.stringify(restoredPayload));
            } catch {
              // sessionStorage not accessible
            }
          }

          // Sync conversation history from server
          socketClient.sync(convId);

          // Auto-dispatch save request if returning authenticated from Google OAuth
          if (user.accountType === 'authenticated') {
            socketClient.sendSaveRequest(convId);
            setIsSaveRequestPending(true);
          }
        } else {
          // Check for active conversation in sessionStorage on page reload (F5)
          let storedConv: IWsMatchFoundPayload | null = null;
          if (typeof window !== 'undefined') {
            try {
              const raw = sessionStorage.getItem(ACTIVE_CONV_STORAGE_KEY);
              if (raw) storedConv = JSON.parse(raw);
            } catch {
              // sessionStorage error
            }
          }

          if (storedConv?.conversationId) {
            setActiveConversation(storedConv);
            setMatchState('matched');
            socketClient.sync(storedConv.conversationId);
          } else {
            // Fresh matchmaking
            await socketClient.joinMatchmaking();
            setMatchState('searching');
          }
        }
      } catch (err) {
        console.error('Error during chat lifecycle initialization:', err);
      }
    }

    initLifecycle();
  }, [nicknameParam, returnConvParam]);

  const handleNextStranger = () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(ACTIVE_CONV_STORAGE_KEY);
      } catch {
        // sessionStorage not accessible
      }
    }

    if (activeConversation) {
      socketClient.nextStranger(activeConversation.conversationId);
    } else {
      socketClient.joinMatchmaking();
    }

    setActiveConversation(null);
    setMatchState('searching');
    setEndedReason(null);
    setIncomingSaveRequest(null);
    setIsMutualSaved(false);
    setIsSaveRequestPending(false);
  };

  const handleCancelMatch = () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(ACTIVE_CONV_STORAGE_KEY);
      } catch {
        // sessionStorage not accessible
      }
    }
    socketClient.leaveMatchmaking();
    router.push('/');
  };

  const handleConfirmBlock = () => {
    if (activeConversation) {
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem(ACTIVE_CONV_STORAGE_KEY);
        } catch {
          // sessionStorage not accessible
        }
      }
      socketClient.blockStranger(activeConversation.conversationId);
      setMatchState('ended');
      setEndedReason('partner_blocked');
    }
  };

  const handleConfirmReport = (reason: ReportReason, details?: string) => {
    if (activeConversation) {
      socketClient.reportStranger(
        activeConversation.conversationId,
        reason,
        details,
      );
    }
  };

  const handleSendSaveRequest = () => {
    if (activeConversation) {
      socketClient.sendSaveRequest(activeConversation.conversationId);
      setIsSaveRequestPending(true);
    }
  };

  const handleAcceptSaveRequest = () => {
    if (activeConversation) {
      socketClient.respondToSaveRequest(activeConversation.conversationId, 'accepted');
    }
  };

  const handleDeclineSaveRequest = () => {
    if (activeConversation) {
      socketClient.respondToSaveRequest(activeConversation.conversationId, 'declined');
      setIncomingSaveRequest(null);
    }
  };

  const handleLogout = async () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(ACTIVE_CONV_STORAGE_KEY);
      } catch {
        // sessionStorage not accessible
      }
    }
    await apiClient.logout();
    socketClient.disconnect();
    setCurrentUser(null);
    router.push('/');
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] max-h-[100dvh] flex flex-col overflow-hidden bg-background text-foreground transition-colors selection:bg-coral-light selection:text-coral-dark">
      <Navbar
        user={currentUser}
        onOpenAuthModal={() => setSaveModalOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
        {matchState === 'searching' && (
          <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
            <MatchmakingView onCancel={handleCancelMatch} />
          </div>
        )}

        {matchState === 'matched' && activeConversation && currentUser && (
          <ChatRoom
            currentUser={currentUser}
            conversationId={activeConversation.conversationId}
            partnerDisplayName={activeConversation.partnerDisplayName}
            incomingSaveRequest={incomingSaveRequest}
            isMutualSaved={isMutualSaved}
            isSaveRequestPending={isSaveRequestPending}
            onAcceptSaveRequest={handleAcceptSaveRequest}
            onDeclineSaveRequest={handleDeclineSaveRequest}
            onNextStranger={handleNextStranger}
            onOpenSaveModal={() => setSaveModalOpen(true)}
            onOpenBlockModal={() => setBlockModalOpen(true)}
            onOpenReportModal={() => setReportModalOpen(true)}
          />
        )}

        {matchState === 'ended' && (
          <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
            <div className="p-6 sm:p-8 text-center max-w-md mx-auto space-y-6 bg-white dark:bg-neutral-900 border border-[#e5e3de] dark:border-neutral-800 rounded-3xl shadow-xl animate-in fade-in">
              <h3 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
                {endedReason === 'partner_blocked'
                  ? 'Stranger Blocked'
                  : 'Stranger Disconnected'}
              </h3>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {endedReason === 'partner_blocked'
                  ? 'You have blocked this stranger. You will not be paired with them again.'
                  : 'The other student has skipped or left the chat room.'}
              </p>

              <button
                onClick={handleNextStranger}
                className="w-full py-3.5 px-6 rounded-full bg-coral hover:bg-coral-hover active:scale-95 text-white font-semibold text-sm transition-all shadow-md shadow-coral/25"
              >
                Find Next Stranger
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <SaveStrangerModal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        conversationId={activeConversation?.conversationId}
        currentUser={currentUser}
        partnerDisplayName={activeConversation?.partnerDisplayName}
        onSendSaveRequest={handleSendSaveRequest}
        isSaveRequestPending={isSaveRequestPending}
        onSuccess={(u) => setCurrentUser(u)}
      />

      <BlockReportModal
        isOpen={blockModalOpen}
        mode="block"
        partnerDisplayName={activeConversation?.partnerDisplayName || 'Stranger'}
        onClose={() => setBlockModalOpen(false)}
        onConfirmBlock={handleConfirmBlock}
        onConfirmReport={() => {}}
      />

      <BlockReportModal
        isOpen={reportModalOpen}
        mode="report"
        partnerDisplayName={activeConversation?.partnerDisplayName || 'Stranger'}
        onClose={() => setReportModalOpen(false)}
        onConfirmBlock={() => {}}
        onConfirmReport={handleConfirmReport}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[100dvh] flex items-center justify-center bg-background text-foreground text-xs text-neutral-400">
          Loading Campus Chat...
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
