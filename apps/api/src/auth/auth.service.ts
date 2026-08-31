import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../persistence/database.service';
import { IUser, UserId, toUserId } from '@campus-stranger/shared-types';

export interface AuthSessionResponse {
  user: IUser;
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generates a new anonymous guest user with an internal secure ID and session JWT.
   */
  async createGuest(displayName?: string): Promise<AuthSessionResponse> {
    const finalDisplayName =
      (displayName && displayName.trim()) || `Stranger_${Math.floor(1000 + Math.random() * 9000)}`;
    const user = await this.db.createUser(finalDisplayName, 'guest');
    const session = await this.db.createGuestSession(user.id);

    const payload = {
      sub: user.id,
      displayName: user.displayName,
      accountType: user.accountType,
      sessionId: session.id,
    };

    const accessToken = this.jwtService.sign(payload);
    return { user, accessToken };
  }

  /**
   * Validates JWT token subject and retrieves the user.
   */
  async validateTokenUser(userId: string): Promise<IUser> {
    const user = await this.db.findUserById(toUserId(userId));
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User session is invalid or has been suspended.');
    }
    return user;
  }

  /**
   * Links a Google OAuth identity to an existing guest session, preserving the
   * user ID and all active conversations without creating duplicate accounts.
   */
  async linkGoogleAccount(
    currentUserId: UserId,
    googleProfile: { id: string; email?: string; displayName?: string },
  ): Promise<AuthSessionResponse> {
    const existingAuth = await this.db.findAuthAccount('google', googleProfile.id);

    if (existingAuth) {
      // If this Google account is already linked to a user, switch to that user
      const existingUser = await this.db.findUserById(existingAuth.userId);
      if (existingUser) {
        // If current guest has an ongoing conversation or saved connections, migrate them to existing account
        if (currentUserId !== existingUser.id) {
          await this.db.migrateUserConversations(currentUserId, existingUser.id);
        }

        const payload = {
          sub: existingUser.id,
          displayName: existingUser.displayName,
          accountType: existingUser.accountType,
        };
        const accessToken = this.jwtService.sign(payload);
        return { user: existingUser, accessToken };
      }
    }

    // Link the Google account to the current guest user
    const { user } = await this.db.linkAuthAccount(
      currentUserId,
      'google',
      googleProfile.id,
      googleProfile.email,
    );

    const payload = {
      sub: user.id,
      displayName: user.displayName,
      accountType: user.accountType,
    };

    const accessToken = this.jwtService.sign(payload);
    return { user, accessToken };
  }

  /**
   * Finds existing user linked to Google account, or creates a new authenticated user.
   */
  async findOrCreateGoogleUser(
    googleProfile: { id: string; email?: string; displayName?: string },
    currentGuestUserId?: UserId,
  ): Promise<AuthSessionResponse> {
    if (currentGuestUserId) {
      return this.linkGoogleAccount(currentGuestUserId, googleProfile);
    }

    const existingAuth = await this.db.findAuthAccount('google', googleProfile.id);
    if (existingAuth) {
      const existingUser = await this.db.findUserById(existingAuth.userId);
      if (existingUser) {
        const payload = {
          sub: existingUser.id,
          displayName: existingUser.displayName,
          accountType: existingUser.accountType,
        };
        const accessToken = this.jwtService.sign(payload);
        return { user: existingUser, accessToken };
      }
    }

    // Create new authenticated user directly
    const displayName =
      (googleProfile.displayName && googleProfile.displayName.trim()) ||
      `Student_${Math.floor(1000 + Math.random() * 9000)}`;
    const user = await this.db.createUser(displayName, 'authenticated');
    await this.db.linkAuthAccount(user.id, 'google', googleProfile.id, googleProfile.email);

    const payload = {
      sub: user.id,
      displayName: user.displayName,
      accountType: user.accountType,
    };
    const accessToken = this.jwtService.sign(payload);
    return { user, accessToken };
  }

  /**
   * Decodes and validates optional state parameter from OAuth redirect.
   * Supports raw JWT or base64/base64url JSON { token, conversationId, returnUrl }.
   */
  extractStateData(state?: string): { userId?: UserId; conversationId?: string; returnUrl?: string } {
    if (!state) return {};

    // 1. Direct JWT verification first
    try {
      const decoded = this.jwtService.verify(state);
      if (decoded?.sub) {
        return { userId: toUserId(decoded.sub) };
      }
    } catch {
      // Not a valid standalone JWT, proceed to JSON parsing
    }

    // 2. Direct JSON string check
    if (state.startsWith('{')) {
      try {
        const parsed = JSON.parse(state);
        const token = parsed.token || parsed.t;
        const conversationId = parsed.conversationId || parsed.c;
        const returnUrl = typeof parsed.returnUrl === 'string' ? parsed.returnUrl : undefined;
        let userId: UserId | undefined;
        if (token) {
          try {
            const decoded = this.jwtService.verify(token);
            if (decoded?.sub) userId = toUserId(decoded.sub);
          } catch {
            // Token inside JSON state is not valid
          }
        }
        return { userId, conversationId, returnUrl };
      } catch {
        // Not valid JSON string
      }
    }

    // 3. Base64 / base64url encoded JSON check
    try {
      const buf = Buffer.from(state, 'base64');
      const decodedStr = buf.toString('utf-8');
      if (decodedStr.startsWith('{')) {
        const parsed = JSON.parse(decodedStr);
        const token = parsed.token || parsed.t;
        const conversationId = parsed.conversationId || parsed.c;
        const returnUrl = typeof parsed.returnUrl === 'string' ? parsed.returnUrl : undefined;
        let userId: UserId | undefined;
        if (token) {
          try {
            const decoded = this.jwtService.verify(token);
            if (decoded?.sub) userId = toUserId(decoded.sub);
          } catch {
            // Token inside decoded JSON state is not valid
          }
        }
        return { userId, conversationId, returnUrl };
      }
    } catch {
      // Base64 decoding failed
    }

    return {};
  }

  /**
   * Decodes and validates optional state parameter from OAuth redirect.
   */
  extractUserIdFromState(state?: string): UserId | null {
    return this.extractStateData(state).userId || null;
  }
}

