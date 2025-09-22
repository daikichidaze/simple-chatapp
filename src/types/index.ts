// User types
export interface User {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

// Room types
export interface Room {
  id: string;
  members: Set<string>;
}

// Message types
export interface Message {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  text: string;
  mentions?: string[];
  ts: number;
}

// WebSocket Event Types
export type ClientToServerEvents =
  | { type: 'join'; roomId: string; sinceTs?: number; beforeId?: string }
  | { type: 'message'; roomId: string; text: string }
  | { type: 'set_name'; displayName: string };

export type ServerToClientEvents =
  | { type: 'hello'; selfId: string; users: { id: string; displayName: string }[] }
  | { type: 'presence'; users: { id: string; displayName: string }[] }
  | { type: 'message'; id: string; roomId: string; userId: string; displayName: string; text: string; mentions?: string[]; ts: number }
  | { type: 'history'; roomId: string; messages: Message[]; nextCursor?: { beforeId?: string; beforeTs?: number } }
  | { type: 'error'; code: 'UNAUTH' | 'RATE_LIMIT' | 'BAD_REQUEST' | 'SERVER_ERROR'; msg: string };

// Database types
export interface DbMessage {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  text: string;
  ts: number;
}