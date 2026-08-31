'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Bookmark,
  BookmarkCheck,
  FastForward,
  Ban,
  Flag,
  Check,
  CheckCheck,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { socketClient } from '../lib/socket-client';
import { cryptoManager } from '../lib/crypto-manager';
import { useActiveUsersCount } from '../lib/use-active-users';
import { IUser, MessageStatus, IWsSaveRequestReceivedPayload } from '@campus-stranger/shared-types';
import { SaveRequestNotification } from './SaveRequestNotification';

export interface ChatMessage {
  id: string;
  senderId: string;
  isMine: boolean;
  plaintext: string;
  status: 'sending' | MessageStatus;
  createdAt: string;
}

interface ChatRoomProps {
  currentUser: IUser;
  conversationId: string;
  partnerDisplayName: string;
  partnerUserId?: string;
  initialMessages?: ChatMessage[];
  incomingSaveRequest?: IWsSaveRequestReceivedPayload | null;
  isMutualSaved?: boolean;
  isSaveRequestPending?: boolean;
  onAcceptSaveRequest?: () => void;
  onDeclineSaveRequest?: () => void;
  onNextStranger: () => void;
  onOpenSaveModal: () => void;
  onOpenBlockModal: () => void;
  onOpenReportModal: () => void;
}

export function ChatRoom({
  currentUser,
  conversationId,
  partnerDisplayName,
  initialMessages = [],
  incomingSaveRequest,
  isMutualSaved = false,
  isSaveRequestPending = false,
  onAcceptSaveRequest,
  onDeclineSaveRequest,
  onNextStranger,
  onOpenSaveModal,
  onOpenBlockModal,
  onOpenReportModal,
}: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [inputText, setInputText] = useState('');
  const [partnerIsTyping, setPartnerIsTyping] = useState(false);
  const [partnerIsOnline] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeUsersCount = useActiveUsersCount(1);
  const displayActiveCount = activeUsersCount > 0 ? activeUsersCount : 1;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, partnerIsTyping, incomingSaveRequest]);

  useEffect(() => {
    // 1. Listen for inbound decrypted messages
    const unsubMsg = socketClient.onMessageReceived((msg) => {
      if (msg.envelope.conversationId === conversationId) {
        const isMine = msg.envelope.senderId === currentUser.id;
        const newMsg: ChatMessage = {
          id: msg.envelope.id,
          senderId: msg.envelope.senderId,
          isMine,
          plaintext: msg.plaintext || '[Decrypted message]',
          status: 'read',
          createdAt: msg.envelope.createdAt,
        };
        setMessages((prev) => [...prev, newMsg]);
        cryptoManager.saveCachedMessage(conversationId, newMsg);

        // Send read ack back
        if (!isMine) {
          socketClient.markMessageRead(conversationId, msg.envelope.id);
        }
      }
    });

    // 2. Listen for partner typing indicator
    const unsubTyping = socketClient.onTyping((isTyping) => {
      setPartnerIsTyping(isTyping);
    });

    // 3. Listen for message sent ACKs
    const unsubAck = socketClient.onMessageAck((ack) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === ack.clientMessageId) {
            const updated = { ...m, id: ack.messageId, status: 'sent' as const };
            cryptoManager.saveCachedMessage(conversationId, updated);
            return updated;
          }
          return m;
        }),
      );
    });

    // 4. Listen for message read status updates
    const unsubRead = socketClient.onMessageStatus((statusUpdate) => {
      if (statusUpdate.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === statusUpdate.messageId ? { ...m, status: 'read' } : m)),
        );
      }
    });

    return () => {
      unsubMsg();
      unsubTyping();
      unsubAck();
      unsubRead();
    };
  }, [conversationId, currentUser.id]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    const clientMsgId = `client_${Date.now()}`;
    const newMsg: ChatMessage = {
      id: clientMsgId,
      senderId: currentUser.id,
      isMine: true,
      plaintext: text,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMsg]);
    cryptoManager.saveCachedMessage(conversationId, newMsg);
    setInputText('');
    socketClient.sendTypingStop(conversationId);

    try {
      await socketClient.sendEncryptedMessage(conversationId, text, clientMsgId);
    } catch (err) {
      console.error('Failed to send encrypted message:', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);

    // Typing throttle
    socketClient.sendTypingStart(conversationId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketClient.sendTypingStop(conversationId);
    }, 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 w-full max-w-4xl mx-auto overflow-hidden bg-background text-foreground">
      {/* 1. Stationary Chat Header (Never scrolls away) */}
      <div className="shrink-0 w-full flex items-center justify-between px-2.5 xs:px-3.5 sm:px-6 py-2 sm:py-3 border-b border-[#e5e3de] dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md z-20">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-8 h-8 xs:w-9 xs:h-9 sm:w-10 sm:h-10 rounded-full bg-coral-light dark:bg-coral-dark/40 text-coral dark:text-[#fca5a5] flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs">
              {partnerDisplayName.substring(0, 2).toUpperCase()}
            </div>
            <span
              className={`absolute bottom-0 right-0 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ring-2 ring-white dark:ring-neutral-900 ${
                partnerIsOnline ? 'bg-emerald-500' : 'bg-neutral-400'
              }`}
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h3 className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 truncate max-w-[90px] xs:max-w-[120px] sm:max-w-[180px]">
                {partnerDisplayName}
              </h3>

              {/* Active Users Indicator in Header */}
              <div
                aria-label={`${displayActiveCount} active users online`}
                className="inline-flex items-center gap-1 px-1.5 xs:px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-[#2d5e3f] dark:text-[#86efac] text-[9px] xs:text-[10px] sm:text-[11px] font-semibold select-none border border-emerald-200/50 dark:border-emerald-800/30 shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="hidden sm:inline">{displayActiveCount} active users</span>
                <span className="sm:hidden">{displayActiveCount} active</span>
              </div>

              {isMutualSaved && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-coral font-bold bg-coral/10 px-2 py-0.5 rounded-full shrink-0">
                  <BookmarkCheck className="w-3 h-3" />
                  <span>Saved</span>
                </span>
              )}
            </div>
            <p className="text-[9px] xs:text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 font-medium truncate">
              {partnerIsTyping ? (
                <span className="text-coral font-semibold animate-pulse">typing...</span>
              ) : partnerIsOnline ? (
                'Connected'
              ) : (
                'Offline'
              )}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 xs:gap-1.5 sm:gap-2 shrink-0">
          {isMutualSaved ? (
            <div className="inline-flex items-center gap-1 px-2 xs:px-2.5 sm:px-3.5 py-1.5 rounded-full text-[10px] xs:text-[11px] sm:text-xs font-semibold bg-[#e8f7ee] dark:bg-[#162e22] text-[#2d5e3f] dark:text-[#86efac] select-none shrink-0">
              <BookmarkCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Saved</span>
            </div>
          ) : (
            <button
              onClick={onOpenSaveModal}
              disabled={isSaveRequestPending}
              title={isSaveRequestPending ? 'Save Request Sent' : 'Save Stranger'}
              className="inline-flex items-center gap-1 px-2 xs:px-2.5 sm:px-3.5 py-1.5 rounded-full text-[10px] xs:text-[11px] sm:text-xs font-semibold bg-coral-light dark:bg-coral-dark/30 text-coral dark:text-[#fca5a5] hover:bg-coral hover:text-white transition-all shadow-xs active:scale-95 shrink-0 disabled:opacity-60"
            >
              {isSaveRequestPending ? (
                <>
                  <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                  <span className="hidden sm:inline">Sent</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Save</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onNextStranger}
            title="Next Stranger"
            className="inline-flex items-center gap-1 px-2 xs:px-2.5 sm:px-3.5 py-1.5 rounded-full text-[10px] xs:text-[11px] sm:text-xs font-semibold bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-90 transition-all shadow-xs active:scale-95 shrink-0"
          >
            <FastForward className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Next</span>
          </button>

          <button
            onClick={onOpenBlockModal}
            title="Block"
            aria-label="Block partner"
            className="p-1 xs:p-1.5 sm:p-2 rounded-full text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
          >
            <Ban className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <button
            onClick={onOpenReportModal}
            title="Report"
            aria-label="Report partner"
            className="p-1 xs:p-1.5 sm:p-2 rounded-full text-neutral-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors shrink-0"
          >
            <Flag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Message Container (Only this region scrolls) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6 space-y-3">
        {/* In-chat Save Request Notification banner */}
        {incomingSaveRequest && onAcceptSaveRequest && onDeclineSaveRequest && (
          <SaveRequestNotification
            requesterDisplayName={incomingSaveRequest.requesterDisplayName}
            onAccept={onAcceptSaveRequest}
            onDecline={onDeclineSaveRequest}
          />
        )}

        <div className="text-center my-2 sm:my-3 space-y-1 select-none">
          <div className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1 rounded-full bg-[#e8f7ee] dark:bg-[#162e22] text-[10px] sm:text-xs font-semibold text-[#2d5e3f] dark:text-[#86efac]">
            <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />
            <span>Double Ratchet End-to-End Encrypted</span>
          </div>
          <p className="text-[9px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
            Messages are encrypted on your device. Only you and {partnerDisplayName} hold the keys.
          </p>
        </div>

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.isMine ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[70%] px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-xs break-words ${
                msg.isMine
                  ? 'bg-coral text-white rounded-br-xs'
                  : 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border border-[#e5e3de] dark:border-neutral-800 rounded-bl-xs'
              }`}
            >
              {msg.plaintext}
            </div>

            <div className="flex items-center gap-1 mt-1 px-1 text-[10px] text-neutral-400">
              <span>
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {msg.isMine && (
                <span>
                  {msg.status === 'read' ? (
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                  ) : msg.status === 'delivered' ? (
                    <CheckCheck className="w-3.5 h-3.5 text-neutral-400" />
                  ) : msg.status === 'sent' || msg.status === 'stored' ? (
                    <Check className="w-3.5 h-3.5 text-neutral-400" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-coral animate-ping" />
                  )}
                </span>
              )}
            </div>
          </div>
        ))}

        {partnerIsTyping && (
          <div className="flex items-center gap-1 px-3 py-2 rounded-full bg-white dark:bg-neutral-900 border border-[#e5e3de] dark:border-neutral-800 w-16 text-neutral-400 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-coral animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-coral animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-coral animate-bounce" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. Stationary Floating Message Composer (With mobile safe area insets) */}
      <div className="shrink-0 w-full px-3 sm:px-6 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-transparent z-20">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2 max-w-4xl mx-auto w-full">
          <div className="flex-1 flex items-center min-h-[46px] sm:min-h-[54px] rounded-full bg-white dark:bg-neutral-900 border border-[#e5e3de] dark:border-neutral-800 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] dark:shadow-none px-4 focus-within:ring-2 focus-within:ring-coral/40 focus-within:border-coral transition-all">
            <textarea
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${partnerDisplayName}... (E2EE)`}
              className="w-full bg-transparent border-none outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 text-xs sm:text-sm resize-none pt-1"
            />
          </div>

          <button
            type="submit"
            disabled={!inputText.trim()}
            aria-label="Send Message"
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-coral hover:bg-coral-hover active:scale-95 text-white flex items-center justify-center shadow-md shadow-coral/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>
      </div>
    </div>
  );
}
