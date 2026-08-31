import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../persistence/database.service';
import { RedisService } from '../persistence/redis.service';
import { IConversation, UserId } from '@campus-stranger/shared-types';

export interface MatchCandidate {
  userId: UserId;
  socketId: string;
  displayName: string;
  accountType?: 'guest' | 'authenticated';
  preKeyBundle?: {
    identityKey: string;
    signedPreKey: string;
    signedPreKeySignature?: string;
  };
  joinedAt: number;
}

export interface MatchResult {
  conversation: IConversation;
  userA: MatchCandidate;
  userB: MatchCandidate;
}

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Enqueues a user and immediately attempts pairing with an eligible waiting peer.
   * State is synchronized across distributed nodes using Redis.
   */
  async joinQueue(candidate: MatchCandidate): Promise<MatchResult | null> {
    // 1. Remove if already in queue
    await this.removeFromQueue(candidate.userId);

    // 2. Fetch current waiting queue candidates
    const queue = await this.redis.getMatchQueue();

    // 3. Find eligible partner in queue
    for (const peer of queue) {
      // Avoid self-match
      if (peer.userId === candidate.userId) {
        continue;
      }

      // Check block list in both directions via PostgreSQL
      const isBlocked = await this.db.isBlocked(candidate.userId, peer.userId);
      if (isBlocked) {
        continue;
      }

      // Match found! Atomically remove peer from distributed queue
      const removed = await this.redis.removeMatchCandidate(peer.userId);
      if (!removed) {
        // Peer was claimed by another concurrent worker; keep searching
        continue;
      }

      // Create conversation in durable PostgreSQL database
      const conversation = await this.db.createConversation([candidate.userId, peer.userId]);

      this.logger.log(
        `Match created: ${conversation.id} between ${candidate.displayName} (${candidate.userId}) and ${peer.displayName} (${peer.userId})`,
      );

      return {
        conversation,
        userA: candidate,
        userB: peer,
      };
    }

    // 4. No match found yet, enqueue candidate in Redis queue
    await this.redis.enqueueMatchCandidate(candidate);
    const currentSize = await this.redis.getMatchQueueSize();
    this.logger.log(
      `Enqueued user: ${candidate.displayName} (${candidate.userId}). Current queue size: ${currentSize}`,
    );
    return null;
  }

  /**
   * Removes user from matchmaking queue.
   */
  async removeFromQueue(userId: UserId): Promise<boolean> {
    const removed = await this.redis.removeMatchCandidate(userId);
    if (removed) {
      const currentSize = await this.redis.getMatchQueueSize();
      this.logger.log(`Removed user ${userId} from queue. Current size: ${currentSize}`);
    }
    return removed;
  }

  async getQueueSize(): Promise<number> {
    return this.redis.getMatchQueueSize();
  }
}
