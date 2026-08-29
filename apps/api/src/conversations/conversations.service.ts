import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../persistence/database.service';
import {
  ConversationId,
  IEncryptedMessageEnvelope,
  ISavedConnection,
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
   * Saves a stranger conversation connection.
   */
  async saveConversation(
    userId: UserId,
    conversationId: string,
    alias?: string,
  ): Promise<ISavedConnection> {
    const convId = toConversationId(conversationId);
    const isMember = await this.db.isUserInConversation(convId, userId);

    if (!isMember) {
      throw new ForbiddenException('Cannot save a conversation you are not a member of.');
    }

    return this.db.saveStrangerConnection(userId, convId, alias);
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

    const isMember = await this.db.isUserInConversation(convId, userId);
    if (!isMember) {
      throw new ForbiddenException('Unauthorized access to private conversation.');
    }

    return this.db.getMessages(convId);
  }

  /**
   * Removes a saved stranger connection.
   */
  async removeSavedConnection(userId: UserId, conversationId: string): Promise<boolean> {
    const convId = toConversationId(conversationId);
    return this.db.removeSavedConnection(userId, convId);
  }
}
