/**
 * Branded nominal type helper to prevent accidental ID mixing at compile time.
 */
declare const brand: unique symbol;

export type Branded<T, B> = T & { readonly [brand]: B };

export type UserId = Branded<string, 'UserId'>;
export type ConversationId = Branded<string, 'ConversationId'>;
export type MessageId = Branded<string, 'MessageId'>;
export type GuestSessionId = Branded<string, 'GuestSessionId'>;
export type AuthAccountId = Branded<string, 'AuthAccountId'>;
export type DeviceId = Branded<string, 'DeviceId'>;

export function toUserId(id: string): UserId {
  return id as UserId;
}

export function toConversationId(id: string): ConversationId {
  return id as ConversationId;
}

export function toMessageId(id: string): MessageId {
  return id as MessageId;
}

export function toGuestSessionId(id: string): GuestSessionId {
  return id as GuestSessionId;
}

export function toAuthAccountId(id: string): AuthAccountId {
  return id as AuthAccountId;
}

export function toDeviceId(id: string): DeviceId {
  return id as DeviceId;
}
