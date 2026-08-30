import { io, Socket } from 'socket.io-client';
import {
  IEncryptedMessageEnvelope,
  IWsChatBlockPayload,
  IWsChatMessagePayload,
  IWsChatNextPayload,
  IWsChatReadPayload,
  IWsChatReportPayload,
  IWsChatSendPayload,
  IWsMatchFoundPayload,
  IWsMessageSentAckPayload,
  IWsMessageStatusUpdatePayload,
  IWsSaveAcceptedPayload,
  IWsSaveCancelledPayload,
  IWsSaveDeclinedPayload,
  IWsSaveDeletedPayload,
  IWsSaveRequestPayload,
  IWsSaveRequestReceivedPayload,
  IWsSaveRespondPayload,
  IWsSyncCompletedPayload,
  IWsSyncPayload,
  MessageId,
  toConversationId,
  toUserId,
  WsClientEvents,
  WsServerEvents,
} from '@campus-stranger/shared-types';
import { apiClient } from './api-client';
import { cryptoManager } from './crypto-manager';

const rawWsUrl =
  process.env.NEXT_PUBLIC_WS_URL ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '').replace(/\/api$/, '') ||
  'http://localhost:3001';
const SOCKET_URL = rawWsUrl.replace(/\/+$/, '');

export type MatchFoundCallback = (match: IWsMatchFoundPayload) => void;
export type MessageReceivedCallback = (msg: {
  envelope: IEncryptedMessageEnvelope;
  plaintext?: string;
}) => void;
export type TypingCallback = (isTyping: boolean) => void;
export type MessageAckCallback = (ack: IWsMessageSentAckPayload) => void;
export type MessageStatusCallback = (status: IWsMessageStatusUpdatePayload) => void;
export type ChatEndedCallback = (reason: string) => void;
export type SaveRequestReceivedCallback = (payload: IWsSaveRequestReceivedPayload) => void;
export type SaveAcceptedCallback = (payload: IWsSaveAcceptedPayload) => void;
export type SaveDeclinedCallback = (payload: IWsSaveDeclinedPayload) => void;
export type SaveCancelledCallback = (payload: IWsSaveCancelledPayload) => void;
export type SaveDeletedCallback = (payload: IWsSaveDeletedPayload) => void;
export type SyncCompletedCallback = (payload: IWsSyncCompletedPayload) => void;

class SocketClient {
  private socket: Socket | null = null;
  private isAuthenticated = false;
  private authPromise: Promise<Socket> | null = null;

  private onMatchFoundListeners: Set<MatchFoundCallback> = new Set();
  private onMessageReceivedListeners: Set<MessageReceivedCallback> = new Set();
  private onTypingListeners: Set<TypingCallback> = new Set();
  private onMessageAckListeners: Set<MessageAckCallback> = new Set();
  private onMessageStatusListeners: Set<MessageStatusCallback> = new Set();
  private onChatEndedListeners: Set<ChatEndedCallback> = new Set();
  private onSaveRequestReceivedListeners: Set<SaveRequestReceivedCallback> = new Set();
  private onSaveAcceptedListeners: Set<SaveAcceptedCallback> = new Set();
  private onSaveDeclinedListeners: Set<SaveDeclinedCallback> = new Set();
  private onSaveCancelledListeners: Set<SaveCancelledCallback> = new Set();
  private onSaveDeletedListeners: Set<SaveDeletedCallback> = new Set();
  private onSyncCompletedListeners: Set<SyncCompletedCallback> = new Set();

  connect(): Promise<Socket> {
    if (this.socket && this.socket.connected && this.isAuthenticated) {
      return Promise.resolve(this.socket);
    }

    if (this.authPromise) {
      return this.authPromise;
    }

    const token = apiClient.getToken();

    if (!this.socket) {
      this.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      this.registerEventHandlers();

      this.socket.on('disconnect', () => {
        this.isAuthenticated = false;
      });

      this.socket.on('connect_error', (err) => {
        console.warn('Socket connect error:', err);
      });
    } else if (!this.socket.connected) {
      this.socket.connect();
    }

    this.authPromise = new Promise<Socket>((resolve) => {
      let isResolved = false;

      const finish = (sock: Socket) => {
        if (!isResolved) {
          isResolved = true;
          this.authPromise = null;
          resolve(sock);
        }
      };

      const timer = setTimeout(() => {
        finish(this.socket!);
      }, 8000);

      this.socket!.once(WsServerEvents.AUTHENTICATED, () => {
        clearTimeout(timer);
        this.isAuthenticated = true;
        finish(this.socket!);
      });

      this.socket!.once(WsServerEvents.CHAT_ERROR, (err) => {
        if (err?.code === 'UNAUTHORIZED') {
          clearTimeout(timer);
          finish(this.socket!);
        }
      });

      const sendAuth = async () => {
        const currentToken = apiClient.getToken() || token;
        if (currentToken) {
          try {
            const preKeyBundle = await cryptoManager.getPreKeyBundle();
            this.socket!.emit(WsClientEvents.AUTHENTICATE, { token: currentToken, preKeyBundle });
          } catch (err) {
            console.error('Failed to generate preKeyBundle on socket connect:', err);
            this.socket!.emit(WsClientEvents.AUTHENTICATE, { token: currentToken });
          }
        } else {
          clearTimeout(timer);
          finish(this.socket!);
        }
      };

      if (this.socket!.connected) {
        sendAuth();
      } else {
        this.socket!.once('connect', sendAuth);
      }
    });

    return this.authPromise;
  }

  private registerEventHandlers() {
    if (!this.socket) return;

    this.socket.on(WsServerEvents.MATCH_FOUND, async (payload: IWsMatchFoundPayload) => {
      try {
        if (payload.partnerKeyBundle) {
          // Initialize E2EE inbound session
          await cryptoManager.initSessionAsReceiver(
            payload.conversationId,
            payload.partnerKeyBundle.identityKey,
            payload.partnerKeyBundle.ephemeralKey || '',
          );
        }
      } catch (err) {
        console.warn('Could not initialize E2EE session on match:', err);
      }
      this.onMatchFoundListeners.forEach((cb) => cb(payload));
    });

    this.socket.on(WsServerEvents.CHAT_MESSAGE, async (payload: IWsChatMessagePayload) => {
      let plaintext: string | undefined;
      try {
        plaintext = await cryptoManager.decryptMessage(
          payload.envelope.conversationId,
          payload.envelope.encryptedPayload,
        );
      } catch (err) {
        console.error('Failed to decrypt inbound message:', err);
        plaintext = '[Decryption failed - cryptographic key mismatch]';
      }

      this.onMessageReceivedListeners.forEach((cb) =>
        cb({ envelope: payload.envelope, plaintext }),
      );
    });

    this.socket.on(WsServerEvents.CHAT_TYPING, (payload: { isTyping: boolean }) => {
      this.onTypingListeners.forEach((cb) => cb(payload.isTyping));
    });

    this.socket.on(WsServerEvents.MESSAGE_SENT, (ack: IWsMessageSentAckPayload) => {
      this.onMessageAckListeners.forEach((cb) => cb(ack));
    });

    this.socket.on(WsServerEvents.MESSAGE_READ, (status: IWsMessageStatusUpdatePayload) => {
      this.onMessageStatusListeners.forEach((cb) => cb(status));
    });

    this.socket.on(WsServerEvents.CHAT_ENDED, (payload: { reason: string }) => {
      this.onChatEndedListeners.forEach((cb) => cb(payload.reason));
    });

    this.socket.on(WsServerEvents.SAVE_REQUEST_RECEIVED, (payload: IWsSaveRequestReceivedPayload) => {
      this.onSaveRequestReceivedListeners.forEach((cb) => cb(payload));
    });

    this.socket.on(WsServerEvents.SAVE_ACCEPTED, (payload: IWsSaveAcceptedPayload) => {
      this.onSaveAcceptedListeners.forEach((cb) => cb(payload));
    });

    this.socket.on(WsServerEvents.SAVE_DECLINED, (payload: IWsSaveDeclinedPayload) => {
      this.onSaveDeclinedListeners.forEach((cb) => cb(payload));
    });

    this.socket.on(WsServerEvents.SAVE_CANCELLED, (payload: IWsSaveCancelledPayload) => {
      this.onSaveCancelledListeners.forEach((cb) => cb(payload));
    });

    this.socket.on(WsServerEvents.SAVE_DELETED, (payload: IWsSaveDeletedPayload) => {
      this.onSaveDeletedListeners.forEach((cb) => cb(payload));
    });

    this.socket.on(WsServerEvents.SYNC_COMPLETED, (payload: IWsSyncCompletedPayload) => {
      this.onSyncCompletedListeners.forEach((cb) => cb(payload));
    });
  }

  async joinMatchmaking() {
    await this.connect();
    const preKeyBundle = await cryptoManager.getPreKeyBundle();
    this.socket?.emit(WsClientEvents.MATCH_JOIN, { preKeyBundle });
  }

  leaveMatchmaking() {
    this.socket?.emit(WsClientEvents.MATCH_LEAVE);
  }

  async sendEncryptedMessage(conversationId: string, plaintext: string, clientMessageId: string) {
    const encryptedPayload = await cryptoManager.encryptMessage(conversationId, plaintext);
    const payload: IWsChatSendPayload = {
      clientMessageId,
      conversationId: toConversationId(conversationId),
      encryptedPayload,
    };
    this.socket?.emit(WsClientEvents.CHAT_SEND, payload);
    return encryptedPayload;
  }

  sendTypingStart(conversationId: string) {
    this.socket?.emit(WsClientEvents.CHAT_TYPING_START, {
      conversationId: toConversationId(conversationId),
    });
  }

  sendTypingStop(conversationId: string) {
    this.socket?.emit(WsClientEvents.CHAT_TYPING_STOP, {
      conversationId: toConversationId(conversationId),
    });
  }

  markMessageRead(conversationId: string, messageId: string) {
    const payload: IWsChatReadPayload = {
      conversationId: toConversationId(conversationId),
      messageId: messageId as MessageId,
    };
    this.socket?.emit(WsClientEvents.CHAT_READ, payload);
  }

  nextStranger(conversationId: string) {
    const payload: IWsChatNextPayload = {
      conversationId: toConversationId(conversationId),
    };
    this.socket?.emit(WsClientEvents.CHAT_NEXT, payload);
  }

  blockStranger(conversationId: string, targetUserId?: string) {
    const payload: IWsChatBlockPayload = {
      conversationId: toConversationId(conversationId),
      targetUserId: targetUserId ? toUserId(targetUserId) : toUserId('stranger_user'),
    };
    this.socket?.emit(WsClientEvents.CHAT_BLOCK, payload);
  }

  reportStranger(conversationId: string, reason: string, details?: string, targetUserId?: string) {
    const payload: IWsChatReportPayload = {
      conversationId: toConversationId(conversationId),
      targetUserId: targetUserId ? toUserId(targetUserId) : toUserId('stranger_user'),
      reason,
      details,
    };
    this.socket?.emit(WsClientEvents.CHAT_REPORT, payload);
  }

  sendSaveRequest(conversationId: string) {
    const payload: IWsSaveRequestPayload = {
      conversationId: toConversationId(conversationId),
    };
    this.socket?.emit(WsClientEvents.SAVE_REQUEST, payload);
  }

  respondToSaveRequest(conversationId: string, response: 'accepted' | 'declined') {
    const payload: IWsSaveRespondPayload = {
      conversationId: toConversationId(conversationId),
      response,
    };
    this.socket?.emit(WsClientEvents.SAVE_RESPOND, payload);
  }

  sync(conversationId: string) {
    const payload: IWsSyncPayload = {
      conversationId: toConversationId(conversationId),
    };
    this.socket?.emit(WsClientEvents.SYNC, payload);
  }

  onMatchFound(cb: MatchFoundCallback) {
    this.onMatchFoundListeners.add(cb);
    return () => this.onMatchFoundListeners.delete(cb);
  }

  onMessageReceived(cb: MessageReceivedCallback) {
    this.onMessageReceivedListeners.add(cb);
    return () => this.onMessageReceivedListeners.delete(cb);
  }

  onTyping(cb: TypingCallback) {
    this.onTypingListeners.add(cb);
    return () => this.onTypingListeners.delete(cb);
  }

  onMessageAck(cb: MessageAckCallback) {
    this.onMessageAckListeners.add(cb);
    return () => this.onMessageAckListeners.delete(cb);
  }

  onMessageStatus(cb: MessageStatusCallback) {
    this.onMessageStatusListeners.add(cb);
    return () => this.onMessageStatusListeners.delete(cb);
  }

  onChatEnded(cb: ChatEndedCallback) {
    this.onChatEndedListeners.add(cb);
    return () => this.onChatEndedListeners.delete(cb);
  }

  onSaveRequestReceived(cb: SaveRequestReceivedCallback) {
    this.onSaveRequestReceivedListeners.add(cb);
    return () => this.onSaveRequestReceivedListeners.delete(cb);
  }

  onSaveAccepted(cb: SaveAcceptedCallback) {
    this.onSaveAcceptedListeners.add(cb);
    return () => this.onSaveAcceptedListeners.delete(cb);
  }

  onSaveDeclined(cb: SaveDeclinedCallback) {
    this.onSaveDeclinedListeners.add(cb);
    return () => this.onSaveDeclinedListeners.delete(cb);
  }

  onSaveCancelled(cb: SaveCancelledCallback) {
    this.onSaveCancelledListeners.add(cb);
    return () => this.onSaveCancelledListeners.delete(cb);
  }

  onSaveDeleted(cb: SaveDeletedCallback) {
    this.onSaveDeletedListeners.add(cb);
    return () => this.onSaveDeletedListeners.delete(cb);
  }

  onSyncCompleted(cb: SyncCompletedCallback) {
    this.onSyncCompletedListeners.add(cb);
    return () => this.onSyncCompletedListeners.delete(cb);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.isAuthenticated = false;
  }
}

export const socketClient = new SocketClient();
