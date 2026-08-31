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

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nicknameParam = searchParams.get('nickname');
  const authTokenParam = searchParams.get('auth_token');
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

  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    let isMounted = true;

    async function initUserAndMatch() {
      try {
        let currentAuthToken = authTokenParam;
        let currentReturnConv = returnConvParam;

        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          if (!currentAuthToken && urlParams.get('auth_token')) {
            currentAuthToken = urlParams.get('auth_token');
          }
          if (!currentReturnConv && urlParams.get('return_conv')) {
            currentReturnConv = urlParams.get('return_conv');
          }
        }

        // Handle OAuth callback redirect token if present
        if (currentAuthToken) {
          apiClient.setToken(currentAuthToken);
        }

        if (typeof window !== 'undefined' && (currentAuthToken || currentReturnConv)) {
          window.history.replaceState({}, '', '/chat');
        }

        let user = await apiClient.getMe();
        if (!user) {
          const guest = await apiClient.createGuest(nicknameParam || undefined);
          user = guest.user;
        }

        if (!isMounted) return;
        setCurrentUser(user);

        // Connect socket
        await socketClient.connect();

        // If returned from OAuth for saving a specific active conversation
        if (currentReturnConv) {
          const convId = toConversationId(currentReturnConv);
          setActiveConversation({
            conversationId: convId,
            partnerDisplayName: 'Stranger',
            matchedAt: new Date().toISOString(),
          });
          setMatchState('matched');
          socketClient.sync(convId);

          if (user.accountType === 'authenticated') {
            socketClient.sendSaveRequest(convId);
            setIsSaveRequestPending(true);
          }
        } else {
          await socketClient.joinMatchmaking();
          setMatchState('searching');
        }
      } catch (err) {
        console.error('Error in chat initialization:', err);
      }
    }

    initUserAndMatch();

    // 1. Listen for match found event
    const unsubMatch = socketClient.onMatchFound((payload) => {
      setActiveConversation(payload);
      setMatchState('matched');
      setEndedReason(null);
      setIncomingSaveRequest(null);
      setIsMutualSaved(false);
      setIsSaveRequestPending(false);
    });

    // 2. Listen for chat ended event
    const unsubEnded = socketClient.onChatEnded((reason) => {
      setEndedReason(reason);
      setMatchState('ended');
      setIncomingSaveRequest(null);
      setIsSaveRequestPending(false);
    });

    // 3. Listen for incoming save request (User B)
    const unsubSaveReq = socketClient.onSaveRequestReceived((payload) => {
      setIncomingSaveRequest(payload);
    });

    // 4. Listen for save accepted (both users)
    const unsubSaveAccept = socketClient.onSaveAccepted(() => {
      setIsMutualSaved(true);
      setIncomingSaveRequest(null);
      setIsSaveRequestPending(false);
    });

    // 5. Listen for save declined
    const unsubSaveDecline = socketClient.onSaveDeclined(() => {
      setIncomingSaveRequest(null);
      setIsSaveRequestPending(false);
    });

    // 6. Listen for save cancelled
    const unsubSaveCancel = socketClient.onSaveCancelled(() => {
      setIncomingSaveRequest(null);
      setIsSaveRequestPending(false);
    });

    // 7. Listen for sync completed to restore pending save requests
    const unsubSync = socketClient.onSyncCompleted((payload) => {
      if (payload.pendingSaveRequest) {
        setIncomingSaveRequest(payload.pendingSaveRequest);
      }
    });

    return () => {
      isMounted = false;
      unsubMatch();
      unsubEnded();
      unsubSaveReq();
      unsubSaveAccept();
      unsubSaveDecline();
      unsubSaveCancel();
      unsubSync();
      socketClient.leaveMatchmaking();
    };
  }, [nicknameParam, authTokenParam, returnConvParam]);

  const handleNextStranger = () => {
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
    socketClient.leaveMatchmaking();
    router.push('/');
  };

  const handleConfirmBlock = () => {
    if (activeConversation) {
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

  return (
    <div className="min-h-[100dvh] h-[100dvh] max-h-[100dvh] flex flex-col overflow-hidden bg-background text-foreground transition-colors selection:bg-coral-light selection:text-coral-dark">
      <Navbar
        user={currentUser}
        onOpenAuthModal={() => setSaveModalOpen(true)}
        onLogout={async () => {
          await apiClient.logout();
          socketClient.disconnect();
          setCurrentUser(null);
          router.push('/');
        }}
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
