'use client';

import { ClientToServerEvents, ServerToClientEvents, Message, User } from '@/types';
import { logger } from './logger';
import { monitoring } from './monitoring';

export interface WebSocketClientCallbacks {
  onConnected?: (selfId: string, users: User[]) => void;
  onMessage?: (message: Message) => void;
  onPresence?: (users: User[]) => void;
  onHistory?: (roomId: string, messages: Message[]) => void;
  onError?: (code: string, message: string) => void;
  onDisconnected?: () => void;
  onReconnecting?: () => void;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private callbacks: WebSocketClientCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isReconnecting = false;
  private shouldReconnect = true;
  private lastSyncTs = 0;
  private currentRoomId = 'default';
  private connectionStartTime = 0;
  private messageTimestamps = new Map<string, number>();

  constructor(callbacks: WebSocketClientCallbacks) {
    this.callbacks = callbacks;
    logger.info('WebSocket client initialized', { maxReconnectAttempts: this.maxReconnectAttempts }, 'WebSocketClient');
  }

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logger.debug('WebSocket already connected, ignoring connect call', {}, 'WebSocketClient');
      return;
    }

    this.shouldReconnect = true;
    this.connectionStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    logger.info('Initiating WebSocket connection', { reconnectAttempts: this.reconnectAttempts }, 'WebSocketClient');
    this.createConnection();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    logger.info('Disconnecting WebSocket', { reconnectAttempts: this.reconnectAttempts }, 'WebSocketClient');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    monitoring.recordWebSocketConnection(false);
  }

  private createConnection(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        const connectionTime = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - this.connectionStartTime;
        logger.info('WebSocket connected', { connectionTime: `${connectionTime.toFixed(2)}ms`, attempt: this.reconnectAttempts + 1 }, 'WebSocketClient');
        monitoring.recordWebSocketConnection(true);
        monitoring.recordWebSocketLatency(connectionTime);

        this.reconnectAttempts = 0;
        this.isReconnecting = false;

        // 自動的にデフォルトルームに参加
        this.joinRoom(this.currentRoomId, this.lastSyncTs > 0 ? this.lastSyncTs : undefined);
      };

      this.ws.onmessage = (event) => {
        try {
          const message: ServerToClientEvents = JSON.parse(event.data);
          logger.debug('WebSocket message received', { type: message.type }, 'WebSocketClient');
          this.handleMessage(message);
        } catch (error) {
          logger.error('Failed to parse WebSocket message', { rawMessage: event.data }, error as Error, 'WebSocketClient');
          monitoring.recordError('websocket_parse_error', error);
        }
      };

      this.ws.onclose = (event) => {
        logger.warn('WebSocket closed', { code: event.code, reason: event.reason, wasClean: event.wasClean }, 'WebSocketClient');
        monitoring.recordWebSocketConnection(false);
        this.ws = null;

        if (this.callbacks.onDisconnected) {
          this.callbacks.onDisconnected();
        }

        if (this.shouldReconnect && !this.isReconnecting) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket error occurred', { error }, undefined, 'WebSocketClient');
        monitoring.recordError('websocket_error', error);
      };

    } catch (error) {
      logger.error('Failed to create WebSocket connection', { wsUrl }, error as Error, 'WebSocketClient');
      monitoring.recordError('websocket_connection_error', error);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', { attempts: this.reconnectAttempts }, undefined, 'WebSocketClient');
      monitoring.recordError('websocket_max_reconnect_attempts', new Error('Max reconnection attempts reached'));
      if (this.callbacks.onError) {
        this.callbacks.onError('CONNECTION_FAILED', 'Failed to reconnect to chat server');
      }
      return;
    }

    this.isReconnecting = true;
    if (this.callbacks.onReconnecting) {
      this.callbacks.onReconnecting();
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    logger.info(`Scheduling reconnection`, { delay: `${delay}ms`, attempt: this.reconnectAttempts + 1, maxAttempts: this.maxReconnectAttempts }, 'WebSocketClient');

    setTimeout(() => {
      this.reconnectAttempts++;
      this.connectionStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.createConnection();
    }, delay);
  }

  private handleMessage(message: ServerToClientEvents): void {
    switch (message.type) {
      case 'hello':
        logger.info('Received hello message', { selfId: message.selfId, userCount: message.users.length }, 'WebSocketClient');
        if (this.callbacks.onConnected) {
          this.callbacks.onConnected(message.selfId, message.users);
        }
        break;

      case 'message':
        // メッセージ遅延を計算
        const messageDelay = this.messageTimestamps.has(message.id)
          ? Date.now() - this.messageTimestamps.get(message.id)!
          : undefined;

        logger.debug('Received message', {
          messageId: message.id,
          userId: message.userId,
          delay: messageDelay ? `${messageDelay}ms` : 'unknown',
          hasMentions: !!message.mentions?.length
        }, 'WebSocketClient');

        monitoring.recordMessageReceived(messageDelay);

        // タイムスタンプ更新（差分同期用）
        this.lastSyncTs = Math.max(this.lastSyncTs, message.ts);

        if (this.callbacks.onMessage) {
          this.callbacks.onMessage({
            id: message.id,
            roomId: message.roomId,
            userId: message.userId,
            displayName: message.displayName,
            text: message.text,
            mentions: message.mentions,
            ts: message.ts
          });
        }
        break;

      case 'presence':
        logger.debug('Received presence update', { userCount: message.users.length }, 'WebSocketClient');
        if (this.callbacks.onPresence) {
          this.callbacks.onPresence(message.users);
        }
        break;

      case 'history':
        // 履歴のタイムスタンプ更新
        if (message.messages.length > 0) {
          const latestTs = Math.max(...message.messages.map(m => m.ts));
          this.lastSyncTs = Math.max(this.lastSyncTs, latestTs);
        }

        logger.info('Received message history', { roomId: message.roomId, messageCount: message.messages.length }, 'WebSocketClient');
        if (this.callbacks.onHistory) {
          this.callbacks.onHistory(message.roomId, message.messages);
        }
        break;

      case 'error':
        logger.error('Server error received', { code: message.code, message: message.msg }, undefined, 'WebSocketClient');
        monitoring.recordError('server_error', new Error(message.msg), { code: message.code });

        // 特定のエラーコードに対する追加処理
        if (message.code === 'RATE_LIMIT') {
          monitoring.recordRateLimited();
        }

        if (this.callbacks.onError) {
          this.callbacks.onError(message.code, message.msg);
        }
        break;

      default:
        logger.warn('Unknown message type received', { messageType: (message as any).type }, 'WebSocketClient');
    }
  }

  private send(message: ClientToServerEvents): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        logger.debug('Message sent', { type: message.type }, 'WebSocketClient');
      } catch (error) {
        logger.error('Failed to send message', { message, error }, error as Error, 'WebSocketClient');
        monitoring.recordError('websocket_send_error', error);
        throw error;
      }
    } else {
      const state = this.getConnectionState();
      logger.warn('WebSocket not connected, message not sent', { messageType: message.type, connectionState: state }, 'WebSocketClient');
      monitoring.recordMessageFailed('websocket_not_connected');
      throw new Error(`WebSocket not connected (state: ${state})`);
    }
  }

  joinRoom(roomId: string, sinceTs?: number): void {
    this.currentRoomId = roomId;
    this.send({
      type: 'join',
      roomId,
      sinceTs
    });
  }

  sendMessage(roomId: string, text: string): void {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.messageTimestamps.set(messageId, Date.now());

    try {
      this.send({
        type: 'message',
        roomId,
        text
      });

      monitoring.recordMessageSent();
      logger.info('Message sent successfully', { roomId, textLength: text.length }, 'WebSocketClient');

      // メッセージタイムスタンプをクリーンアップ（10秒後）
      setTimeout(() => {
        this.messageTimestamps.delete(messageId);
      }, 10000);
    } catch (error) {
      monitoring.recordMessageFailed('send_error');
      throw error;
    }
  }

  setDisplayName(displayName: string): void {
    logger.info('Setting display name', { displayName }, 'WebSocketClient');
    this.send({
      type: 'set_name',
      displayName
    });
  }

  getConnectionState(): string {
    if (!this.ws) return 'disconnected';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'disconnecting';
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'unknown';
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}