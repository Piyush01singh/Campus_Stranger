import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../persistence/database.service';
import {
  ConversationId,
  IEncryptedMessageEnvelope,
  ISaveRequest,
  toConversationId,
  UserId,
} from '@campus-stranger/shared-types';

export interface SavedStrangerView {
  conversationId: ConversationId;
  partnerDisplayName: string;
  savedAt: string;
  lastMessageAt?: string;
  isMutualSaved?: boolean;
}

@Injectable()
export class ConversationsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Retrieves all saved strangers for an authenticated user.
   */
  async getSavedStrangers(userId: UserId): Promise<SavedStrangerView[]> {
    const saved = await this.db.getSavedConnections(userId);
    const result: SavedStrangerView[] = [];

    for (const item of saved) {
      const conv = await this.db.findConversationById(item.conversationId);
      // Skip deleted conversations
      if (conv?.status === 'deleted') continue;

      const members = await this.db.getConversationMembers(item.conversationId);
      const partnerMember = members.find((m) => m.userId !== userId);

      if (partnerMember) {
        const partner = await this.db.findUserById(partnerMember.userId);
        const partnerDisplayName = partner?.displayName ?? 'Anonymous Stranger';
        const isMutualSaved = Boolean(partnerMember.savedAt);

        result.push({
          conversationId: item.conversationId,
          partnerDisplayName,
          savedAt: item.savedAt,
          lastMessageAt: conv?.lastMessageAt,
          isMutualSaved,
        });
      }
    }

    return result;
  }

  /**
   * Retrieves encrypted message history for an authorized conversation member.
   */
  async getConversationMessages(
    userId: UserId,
    conversationId: string,
  ): Promise<IEncryptedMessageEnvelope[]> {
    const convId = toConversationId(conversationId);
    const conv = await this.db.findConversationById(convId);

    if (!conv) {
      throw new NotFoundException('Conversation not found.');
    }

    if (conv.status === 'deleted') {
      throw new ForbiddenException('This conversation has been deleted.');
    }

    const isMember = await this.db.isUserInConversation(convId, userId);
    if (!isMember) {
      throw new ForbiddenException('Unauthorized access to private conversation.');
    }

    return this.db.getMessages(convId);
  }

  /**
   * Mutually deletes a saved conversation for both participants.
   * Only a confirmed member may initiate deletion.
   * Returns the other user's ID for realtime notification.
   */
  async deleteMutualSavedConnection(
    userId: UserId,
    conversationId: string,
  ): Promise<{ deleted: boolean; otherUserId: UserId | null }> {
    const convId = toConversationId(conversationId);
    return this.db.deleteMutualSavedConnection(convId, userId);
  }

  /**
   * Returns a pending save request where the authenticated user is the target.
   * Used for reconnect synchronization.
   */
  async getPendingSaveRequest(
    userId: UserId,
    conversationId: string,
  ): Promise<ISaveRequest | null> {
    const convId = toConversationId(conversationId);
    return this.db.getPendingSaveRequestForConversation(convId, userId);
  }
}
