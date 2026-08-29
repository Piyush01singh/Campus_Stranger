import { AuthAccountId, GuestSessionId, UserId } from './ids.js';

export type AccountType = 'guest' | 'authenticated';

export type UserStatus = 'active' | 'suspended' | 'deleted';

export type AuthProvider = 'google';

export interface IUser {
  id: UserId;
  displayName: string;
  accountType: AccountType;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IGuestSession {
  id: GuestSessionId;
  userId: UserId;
  expiresAt: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface IAuthAccount {
  id: AuthAccountId;
  userId: UserId;
  provider: AuthProvider;
  providerUserId: string;
  email?: string;
  createdAt: string;
}
