'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Navbar } from '../../../components/Navbar';
import { ChatRoom, ChatMessage } from '../../../components/ChatRoom';
import { SaveStrangerModal } from '../../../components/SaveStrangerModal';
import { BlockReportModal } from '../../../components/BlockReportModal';
import { apiClient } from '../../../lib/api-client';
import { socketClient } from '../../../lib/socket-client';
import { cryptoManager } from '../../../lib/crypto-manager';
import {
  IUser,
  IWsSaveRequestReceivedPayload,
  ReportReason,
} from '@campus-stranger/shared-types';

export default function ResumedChatPage() {
  const router = useRouter();
  const params = useParams();
  const conversationId = params?.conversationId as string;

  const [currentUser, setCurrentUser] = useState<IUser | null>(null);
  const [partnerDisplayName] = useState('Saved Stranger');
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Mutual save state
  const [incomingSaveRequest, setIncomingSaveRequest] = useState<IWsSaveRequestReceivedPayload | null>(null);
  const [isMutualSaved, setIsMutualSaved] = useState(true);
  const [isSaveRequestPending, setIsSaveRequestPending] = useState(false);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  useEffect(() => {
    async function loadResumedConversation() {
      if (!conversationId) return;
      setLoading(true);
      try {
        const user = await apiClient.getMe();
        if (!user) {
          router.push('/saved');
          return;
        }
        setCurrentUser(user);

        // 1. Load locally cached decrypted messages
        const cached = await cryptoManager.getCachedMessages(conversationId);
        const cachedMap = new Map(cached.map((c) => [c.id, c]));

        // 2. Fetch server envelopes for message reconciliation
        const rawEnvelopes = await apiClient.getConversationMessages(conversationId);
        const decryptedMessages: ChatMessage[] = [];

        for (const env of rawEnvelopes) {
          const cachedMsg = cachedMap.get(env.id);
          if (cachedMsg) {
            decryptedMessages.push({
              id: cachedMsg.id,
              senderId: cachedMsg.senderId,
              isMine: cachedMsg.senderId === user.id,
              plaintext: cachedMsg.plaintext,
              status: env.status,
              createdAt: env.createdAt,
            });
          } else {
            let plaintext = '[Encrypted message]';
            try {
              plaintext = await cryptoManager.decryptMessage(conversationId, env.encryptedPayload);
            } catch {
              plaintext = '[Encrypted message payload]';
            }

            const newMsg: ChatMessage = {
              id: env.id,
              senderId: env.senderId,
              isMine: env.senderId === user.id,
              plaintext,
              status: env.status,
              createdAt: env.createdAt,
            };
            decryptedMessages.push(newMsg);
            await cryptoManager.saveCachedMessage(conversationId, newMsg);
          }
        }

        setInitialMessages(
          decryptedMessages.length > 0
            ? decryptedMessages
            : cached.map((c) => ({
                id: c.id,
                senderId: c.senderId,
                isMine: c.isMine,
                plaintext: c.plaintext,
                status: c.status as ChatMessage['status'],
                createdAt: c.createdAt,
              })),
        );

        // Connect socket & sync
        await socketClient.connect();
        socketClient.sync(conversationId);
      } catch (err) {
        console.error('Failed to load resumed chat:', err);
      } finally {
        setLoading(false);
      }
    }

    loadResumedConversation();

    const unsubSaveReq = socketClient.onSaveRequestReceived((payload) => {
      setIncomingSaveRequest(payload);
    });

    const unsubSaveAccept = socketClient.onSaveAccepted(() => {
      setIsMutualSaved(true);
      setIncomingSaveRequest(null);
      setIsSaveRequestPending(false);
    });

    const unsubSaveDecline = socketClient.onSaveDeclined(() => {
      setIncomingSaveRequest(null);
      setIsSaveRequestPending(false);
    });

    const unsubSync = socketClient.onSyncCompleted((payload) => {
      if (payload.pendingSaveRequest) {
        setIncomingSaveRequest(payload.pendingSaveRequest);
      }
    });

    return () => {
      unsubSaveReq();
      unsubSaveAccept();
      unsubSaveDecline();
      unsubSync();
    };
  }, [conversationId, router]);

  const handleNextStranger = () => {
    router.push('/chat');
  };

  const handleConfirmBlock = () => {
    if (conversationId) {
      socketClient.blockStranger(conversationId);
      router.push('/saved');
    }
  };

  const handleConfirmReport = (reason: ReportReason, details?: string) => {
    if (conversationId) {
      socketClient.reportStranger(conversationId, reason, details);
    }
  };

  const handleSendSaveRequest = () => {
    if (conversationId) {
      socketClient.sendSaveRequest(conversationId);
      setIsSaveRequestPending(true);
    }
  };

  const handleAcceptSaveRequest = () => {
    if (conversationId) {
      socketClient.respondToSaveRequest(conversationId, 'accepted');
    }
  };

  const handleDeclineSaveRequest = () => {
    if (conversationId) {
      socketClient.respondToSaveRequest(conversationId, 'declined');
      setIncomingSaveRequest(null);
    }
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] max-h-[100dvh] flex flex-col overflow-hidden bg-background text-foreground transition-colors selection:bg-coral-light selection:text-coral-dark">
      <Navbar
        user={currentUser}
        onOpenAuthModal={() => setSaveModalOpen(true)}
        onLogout={() => {
          setCurrentUser(null);
          router.push('/');
        }}
      />

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
        {loading ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-xs sm:text-sm text-neutral-400 animate-pulse">
              Restoring encrypted conversation session...
            </div>
          </div>
        ) : currentUser && conversationId ? (
          <ChatRoom
            currentUser={currentUser}
            conversationId={conversationId}
            partnerDisplayName={partnerDisplayName}
            initialMessages={initialMessages}
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
        ) : null}
      </main>

      <SaveStrangerModal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        conversationId={conversationId}
        currentUser={currentUser}
        partnerDisplayName={partnerDisplayName}
        onSendSaveRequest={handleSendSaveRequest}
        isSaveRequestPending={isSaveRequestPending}
        onSuccess={(u) => setCurrentUser(u)}
      />

      <BlockReportModal
        isOpen={blockModalOpen}
        mode="block"
        partnerDisplayName={partnerDisplayName}
        onClose={() => setBlockModalOpen(false)}
        onConfirmBlock={handleConfirmBlock}
        onConfirmReport={() => {}}
      />

      <BlockReportModal
        isOpen={reportModalOpen}
        mode="report"
        partnerDisplayName={partnerDisplayName}
        onClose={() => setReportModalOpen(false)}
        onConfirmBlock={() => {}}
        onConfirmReport={handleConfirmReport}
      />
    </div>
  );
}
