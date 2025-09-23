import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { parse } from 'url';
import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { MessageRepository, startCleanupJob } from './database';
import { ClientToServerEvents, ServerToClientEvents, User } from '@/types';
import { z } from 'zod';

interface ExtendedWebSocket extends WebSocket {
  userId?: string;
  displayName?: string;
  roomId?: string;
  lastMessageTime?: number;
  messageCount?: number;
}

interface RateLimiter {
  lastMessageTime: number;
  messageCount: number;
  isRateLimited(): boolean;
  recordMessage(): void;
}

class TokenBucketRateLimiter implements RateLimiter {
  lastMessageTime = 0;
  messageCount = 0;
  private readonly maxMessages = 10; // バースト制限
  private readonly refillRate = 3; // 秒あたり3メッセージ
  private tokens = this.maxMessages;
  private lastRefill = Date.now();

  isRateLimited(): boolean {
    this.refillTokens();
    return this.tokens < 1;
  }

  recordMessage(): void {
    this.tokens = Math.max(0, this.tokens - 1);
    this.lastMessageTime = Date.now();
    this.messageCount++;
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxMessages,
      this.tokens + timePassed * this.refillRate
    );
    this.lastRefill = now;
  }
}

// インメモリストレージ
class MemoryStore {
  private users = new Map<string, User>(); // userId -> User
  private connections = new Map<string, ExtendedWebSocket>(); // userId -> WebSocket
  private rooms = new Map<string, Set<string>>(); // roomId -> Set<userId>
  private rateLimiters = new Map<string, RateLimiter>(); // userId -> RateLimiter
  private typingUsers = new Map<string, Map<string, NodeJS.Timeout>>(); // roomId -> Map<userId, timeout>

  // ユーザー管理
  addUser(userId: string, displayName: string, ws: ExtendedWebSocket) {
    this.users.set(userId, { id: userId, displayName });
    this.connections.set(userId, ws);

    if (!this.rateLimiters.has(userId)) {
      this.rateLimiters.set(userId, new TokenBucketRateLimiter());
    }

    // defaultルームに参加
    this.joinRoom(userId, 'default');
  }

  removeUser(userId: string) {
    this.users.delete(userId);
    this.connections.delete(userId);

    // 全てのルームから退出
    this.rooms.forEach((members, roomId) => {
      members.delete(userId);
      if (members.size === 0) {
        this.rooms.delete(roomId);
      }
    });
  }

  updateDisplayName(userId: string, displayName: string) {
    const user = this.users.get(userId);
    if (user) {
      user.displayName = displayName;
    }
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getConnection(userId: string): ExtendedWebSocket | undefined {
    return this.connections.get(userId);
  }

  getRateLimiter(userId: string): RateLimiter | undefined {
    return this.rateLimiters.get(userId);
  }

  // ルーム管理
  joinRoom(userId: string, roomId: string) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId)!.add(userId);

    const ws = this.connections.get(userId);
    if (ws) {
      ws.roomId = roomId;
    }
  }

  leaveRoom(userId: string, roomId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(userId);
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }
  }

  getRoomMembers(roomId: string): User[] {
    const memberIds = this.rooms.get(roomId);
    if (!memberIds) return [];

    return Array.from(memberIds)
      .map(id => this.users.get(id))
      .filter((user): user is User => user !== undefined);
  }

  // ブロードキャスト
  broadcastToRoom(roomId: string, message: ServerToClientEvents, excludeUserId?: string) {
    const members = this.rooms.get(roomId);
    if (!members) return;

    const messageStr = JSON.stringify(message);

    members.forEach(userId => {
      if (userId === excludeUserId) return;

      const ws = this.connections.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  broadcastPresence(roomId: string) {
    const users = this.getRoomMembers(roomId);
    const presenceMessage: ServerToClientEvents = {
      type: 'presence',
      users: users.map(u => ({ id: u.id, displayName: u.displayName }))
    };

    this.broadcastToRoom(roomId, presenceMessage);
  }

  // タイピング管理
  startTyping(userId: string, roomId: string) {
    if (!this.typingUsers.has(roomId)) {
      this.typingUsers.set(roomId, new Map());
    }

    const roomTyping = this.typingUsers.get(roomId)!;
    const user = this.users.get(userId);

    // 既存のタイマーをクリア
    const existingTimeout = roomTyping.get(userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // 3秒後に自動停止
    const timeout = setTimeout(() => {
      this.stopTyping(userId, roomId);
    }, 3000);

    roomTyping.set(userId, timeout);

    if (user) {
      // タイピング開始をブロードキャスト
      this.broadcastToRoom(roomId, {
        type: 'user_typing',
        roomId,
        userId,
        displayName: user.displayName
      }, userId);
    }
  }

  stopTyping(userId: string, roomId: string) {
    const roomTyping = this.typingUsers.get(roomId);
    if (!roomTyping) return;

    const timeout = roomTyping.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      roomTyping.delete(userId);

      // タイピング停止をブロードキャスト
      this.broadcastToRoom(roomId, {
        type: 'user_typing_stop',
        roomId,
        userId
      }, userId);
    }

    if (roomTyping.size === 0) {
      this.typingUsers.delete(roomId);
    }
  }
}

// バリデーションスキーマ
const JoinSchema = z.object({
  type: z.literal('join'),
  roomId: z.string(),
  sinceTs: z.number().optional(),
  beforeId: z.string().optional()
});

const MessageSchema = z.object({
  type: z.literal('message'),
  roomId: z.string(),
  text: z.string().max(2000) // 文字数制限
});

const SetNameSchema = z.object({
  type: z.literal('set_name'),
  displayName: z.string().min(1).max(50)
});

const TypingStartSchema = z.object({
  type: z.literal('typing_start'),
  roomId: z.string()
});

const TypingStopSchema = z.object({
  type: z.literal('typing_stop'),
  roomId: z.string()
});

class WebSocketChatServer {
  private wss: WebSocketServer;
  private store = new MemoryStore();
  private messageRepo = new MessageRepository();

  constructor(server: Server) {
    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false
    });

    // WebSocketアップグレードハンドリング
    server.on('upgrade', async (request, socket, head) => {
      const { pathname } = parse(request.url || '');
      console.log('WebSocket upgrade request:', { pathname, origin: request.headers.origin });

      if (pathname !== '/ws') {
        console.log('WebSocket upgrade failed: invalid pathname:', pathname);
        socket.destroy();
        return;
      }

      try {
        // JWT認証（Cookieから）
        console.log('Attempting JWT authentication for WebSocket...');
        console.log('Cookies:', request.headers.cookie);
        console.log('NEXTAUTH_SECRET exists:', !!process.env.NEXTAUTH_SECRET);
        console.log('Request headers:', JSON.stringify({
          origin: request.headers.origin,
          'user-agent': request.headers['user-agent'],
          cookie: request.headers.cookie ? 'present' : 'missing'
        }, null, 2));

        let token: any = null;

        // Phase 1: HTTP fetch API経由認証
        try {
          console.log('Trying HTTP fetch authentication...');

          const response = await fetch(`http://localhost:3000/api/auth/session`, {
            method: 'GET',
            headers: {
              'Cookie': request.headers.cookie || '',
              'User-Agent': 'WebSocket-Server-Internal',
            },
          });

          console.log('HTTP session response status:', response.status);

          if (response.ok) {
            const sessionData = await response.json();
            console.log('HTTP session data:', sessionData ? { userId: sessionData.user?.id, displayName: sessionData.user?.displayName } : 'null');

            if (sessionData?.user?.id) {
              token = {
                userId: sessionData.user.id,
                displayName: sessionData.user.displayName || 'Anonymous'
              };
              console.log('HTTP session authentication successful:', token);
            }
          } else {
            console.log('HTTP session authentication failed: status', response.status);
          }
        } catch (error) {
          console.error('HTTP session authentication failed:', error);
        }

        // Phase 2: フォールバック - getToken()を試行（ログのみ）
        if (!token) {
          try {
            console.log('Fallback: Trying JWT token extraction...');
            const jwtToken = await getToken({
              req: request as any,
              secret: process.env.NEXTAUTH_SECRET,
              secureCookie: false,
              raw: false
            });

            console.log('JWT token result:', jwtToken ? { userId: jwtToken.userId, displayName: jwtToken.displayName } : 'null');

            if (jwtToken?.userId) {
              token = jwtToken;
              console.log('JWT authentication successful (fallback)');
            }
          } catch (error) {
            console.error('JWT token extraction failed:', error);
          }
        }

        // 認証失敗の場合
        if (!token || !token.userId) {
          console.log('WebSocket authentication failed: no valid token from both methods');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // Origin検証
        const origin = request.headers.origin;
        const allowedOrigins = [
          process.env.NEXTAUTH_URL,
          'http://localhost:3000',
          'https://localhost:3000'
        ];

        console.log('Origin validation:', { origin, allowedOrigins });

        if (!origin || !allowedOrigins.includes(origin)) {
          console.log('WebSocket origin validation failed:', { origin, allowedOrigins });
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }

        console.log('WebSocket authentication and origin validation successful, upgrading connection...');
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          console.log('WebSocket connection upgraded successfully');
          this.wss.emit('connection', ws, request, token);
        });

      } catch (error) {
        console.error('WebSocket upgrade error:', error);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
    });

    // 接続処理
    this.wss.on('connection', (ws: ExtendedWebSocket, request: any, token: any) => {
      this.handleConnection(ws, token);
    });

    // クリーンアップジョブ開始
    startCleanupJob();
  }

  private handleConnection(ws: ExtendedWebSocket, token: any) {
    const userId = token.userId;
    const displayName = token.displayName || 'Anonymous';

    console.log('Handling WebSocket connection for user:', { userId, displayName });

    ws.userId = userId;
    ws.displayName = displayName;

    // ユーザー追加とdefaultルーム参加
    this.store.addUser(userId, displayName, ws);

    // Hello メッセージ
    const users = this.store.getRoomMembers('default');
    const helloMessage: ServerToClientEvents = {
      type: 'hello',
      selfId: userId,
      users: users.map(u => ({ id: u.id, displayName: u.displayName }))
    };
    ws.send(JSON.stringify(helloMessage));

    // プレゼンス通知
    this.store.broadcastPresence('default');

    // メッセージハンドラー
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientToServerEvents;
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('Message parsing error:', error);
        this.sendError(ws, 'BAD_REQUEST', 'Invalid message format');
      }
    });

    // 切断処理
    ws.on('close', () => {
      this.handleDisconnection(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.handleDisconnection(ws);
    });
  }

  private handleMessage(ws: ExtendedWebSocket, message: ClientToServerEvents) {
    if (!ws.userId) return;

    try {
      switch (message.type) {
        case 'join':
          this.handleJoin(ws, JoinSchema.parse(message));
          break;
        case 'message':
          this.handleChatMessage(ws, MessageSchema.parse(message));
          break;
        case 'set_name':
          this.handleSetName(ws, SetNameSchema.parse(message));
          break;
        case 'typing_start':
          this.handleTypingStart(ws, TypingStartSchema.parse(message));
          break;
        case 'typing_stop':
          this.handleTypingStop(ws, TypingStopSchema.parse(message));
          break;
        default:
          this.sendError(ws, 'BAD_REQUEST', 'Unknown message type');
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.sendError(ws, 'BAD_REQUEST', 'Invalid message data');
      } else {
        console.error('Message handling error:', error);
        this.sendError(ws, 'SERVER_ERROR', 'Internal server error');
      }
    }
  }

  private handleJoin(ws: ExtendedWebSocket, message: { type: 'join', roomId: string, sinceTs?: number, beforeId?: string }) {
    if (!ws.userId) return;

    const { roomId, sinceTs, beforeId } = message;

    // ルーム参加
    this.store.joinRoom(ws.userId, roomId);

    // 履歴取得
    let messages;
    if (sinceTs) {
      // 差分同期
      messages = this.messageRepo.getMessagesSince(roomId, sinceTs);
    } else if (beforeId) {
      // ページング（実装は簡略化）
      messages = this.messageRepo.getRecentMessages(roomId, 100);
    } else {
      // 初回取得
      messages = this.messageRepo.getRecentMessages(roomId, 100);
    }

    const historyMessage: ServerToClientEvents = {
      type: 'history',
      roomId,
      messages,
      nextCursor: messages.length > 0 ? {
        beforeTs: messages[0]?.ts
      } : undefined
    };

    ws.send(JSON.stringify(historyMessage));

    // プレゼンス更新
    this.store.broadcastPresence(roomId);
  }

  private handleChatMessage(ws: ExtendedWebSocket, message: { type: 'message', roomId: string, text: string }) {
    if (!ws.userId || !ws.displayName) return;

    // レート制限チェック
    const rateLimiter = this.store.getRateLimiter(ws.userId);
    if (rateLimiter && rateLimiter.isRateLimited()) {
      this.sendError(ws, 'RATE_LIMIT', 'Too many messages. Slow down.');
      return;
    }

    // メッセージ作成・保存
    const createdMessage = this.messageRepo.createMessage(
      message.roomId,
      ws.userId,
      ws.displayName,
      message.text
      // TODO: メンション機能は後で実装
    );

    // レート制限カウンター更新
    if (rateLimiter) {
      rateLimiter.recordMessage();
    }

    // ブロードキャスト
    const broadcastMessage: ServerToClientEvents = {
      type: 'message',
      id: createdMessage.id,
      roomId: createdMessage.roomId,
      userId: createdMessage.userId,
      displayName: createdMessage.displayName,
      text: createdMessage.text,
      mentions: createdMessage.mentions,
      ts: createdMessage.ts
    };

    this.store.broadcastToRoom(message.roomId, broadcastMessage);
  }

  private handleSetName(ws: ExtendedWebSocket, message: { type: 'set_name', displayName: string }) {
    if (!ws.userId) return;

    ws.displayName = message.displayName;
    this.store.updateDisplayName(ws.userId, message.displayName);

    // プレゼンス更新
    if (ws.roomId) {
      this.store.broadcastPresence(ws.roomId);
    }
  }

  private handleTypingStart(ws: ExtendedWebSocket, message: { type: 'typing_start', roomId: string }) {
    if (!ws.userId) return;

    this.store.startTyping(ws.userId, message.roomId);
  }

  private handleTypingStop(ws: ExtendedWebSocket, message: { type: 'typing_stop', roomId: string }) {
    if (!ws.userId) return;

    this.store.stopTyping(ws.userId, message.roomId);
  }

  private handleDisconnection(ws: ExtendedWebSocket) {
    if (!ws.userId) return;

    const roomId = ws.roomId;
    this.store.removeUser(ws.userId);

    // プレゼンス更新
    if (roomId) {
      this.store.broadcastPresence(roomId);
    }
  }

  private sendError(ws: ExtendedWebSocket, code: 'UNAUTH' | 'RATE_LIMIT' | 'BAD_REQUEST' | 'SERVER_ERROR', msg: string) {
    const errorMessage: ServerToClientEvents = {
      type: 'error',
      code,
      msg
    };
    ws.send(JSON.stringify(errorMessage));
  }
}

export { WebSocketChatServer };