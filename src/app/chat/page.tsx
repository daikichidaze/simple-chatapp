'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { WebSocketClient } from '@/lib/websocket-client';
import { Message, User } from '@/types';
import { MessageList } from '@/components/MessageList';
import { MessageComposer } from '@/components/MessageComposer';
import { UserList } from '@/components/UserList';
import { ChatHeader } from '@/components/ChatHeader';
import { ErrorDisplay, useErrorHandler, createErrorInfo } from '@/components/ErrorDisplay';
import { useLogger } from '@/lib/logger';
import { monitoring, useComponentMonitoring } from '@/lib/monitoring';

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [currentDisplayName, setCurrentDisplayName] = useState<string>('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const { error, showError, clearError, handleError } = useErrorHandler();
  const logger = useLogger('ChatPage');
  const { trackEvent, recordMetric } = useComponentMonitoring('ChatPage');

  const wsClient = useRef<WebSocketClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // 認証チェック
  useEffect(() => {
    if (status === 'loading') {
      logger.debug('Authentication status loading');
      return;
    }

    if (status === 'unauthenticated') {
      logger.info('User not authenticated, redirecting to login');
      monitoring.recordAuthEvent('session_expired');
      router.push('/login');
      return;
    }

    if (session?.user?.displayName) {
      logger.info('User authenticated successfully', {
        userId: session.user.id,
        displayName: session.user.displayName
      });
      monitoring.recordAuthEvent('login', session.user.id);
      setCurrentDisplayName(session.user.displayName);
      trackEvent('authenticated');
    }
  }, [session, status, router, logger, trackEvent]);

  // WebSocket接続とイベントハンドラー
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) {
      logger.debug('WebSocket connection skipped', { status, hasSession: !!session, hasUserId: !!session?.user?.id });
      return;
    }

    logger.info('Initializing WebSocket connection', { userId: session.user?.id });
    setConnectionState('connecting');
    trackEvent('websocket_connecting');

    wsClient.current = new WebSocketClient({
      onConnected: (selfId, initialUsers) => {
        logger.info('WebSocket connected successfully', { selfId, userCount: initialUsers.length });
        setConnectionState('connected');
        setUsers(initialUsers);
        clearError();
        trackEvent('websocket_connected', { userCount: initialUsers.length });
        recordMetric('users_online', initialUsers.length);
      },

      onMessage: (message) => {
        logger.debug('Message received', {
          messageId: message.id,
          fromUser: message.userId,
          hasCurrentUser: message.mentions?.includes(session.user?.id || '')
        });

        setMessages(prev => {
          // 重複チェック
          if (prev.some(m => m.id === message.id)) {
            logger.debug('Duplicate message ignored', { messageId: message.id });
            return prev;
          }

          const newMessages = [...prev, message].sort((a, b) => a.ts - b.ts);
          recordMetric('messages_displayed', newMessages.length);
          return newMessages;
        });

        // メンション通知
        if (message.mentions?.includes(session.user?.id || '')) {
          trackEvent('mentioned_in_message', { fromUser: message.userId });
        }

        trackEvent('message_received');
        // 新着メッセージでスクロール
        setTimeout(scrollToBottom, 100);
      },

      onHistory: (roomId, historyMessages) => {
        logger.info('Message history received', { roomId, messageCount: historyMessages.length });
        setMessages(historyMessages.sort((a, b) => a.ts - b.ts));
        recordMetric('messages_loaded', historyMessages.length);
        trackEvent('history_loaded', { messageCount: historyMessages.length });
        setTimeout(scrollToBottom, 100);
      },

      onPresence: (updatedUsers) => {
        logger.debug('Presence update received', { userCount: updatedUsers.length });
        setUsers(updatedUsers);
        recordMetric('users_online', updatedUsers.length);
        trackEvent('presence_updated', { userCount: updatedUsers.length });
      },

      onError: (code, message) => {
        logger.error('WebSocket error received', { code, message });
        trackEvent('websocket_error', { code, message });

        let errorInfo;
        switch (code) {
          case 'RATE_LIMIT':
            errorInfo = createErrorInfo.rateLimit(message);
            break;
          case 'UNAUTH':
            errorInfo = createErrorInfo.authentication(message);
            break;
          case 'BAD_REQUEST':
            errorInfo = createErrorInfo.badRequest(message);
            break;
          case 'SERVER_ERROR':
            errorInfo = createErrorInfo.serverError(message);
            break;
          default:
            errorInfo = createErrorInfo.serverError(`${code}: ${message}`);
        }
        showError(errorInfo);
        setConnectionState('error');
      },

      onDisconnected: () => {
        logger.warn('WebSocket disconnected');
        setConnectionState('disconnected');
        trackEvent('websocket_disconnected');
        showError(createErrorInfo.connectionError('Connection lost. Attempting to reconnect...', () => {
          logger.info('Manual reconnection requested');
          wsClient.current?.connect();
          clearError();
        }));
      },

      onReconnecting: () => {
        logger.info('WebSocket reconnecting');
        setConnectionState('reconnecting');
        trackEvent('websocket_reconnecting');
        clearError();
      },

      onUserTyping: (userId: string, displayName: string) => {
        logger.debug('User started typing', { userId, displayName });
        setTypingUsers(prev => {
          if (!prev.includes(userId)) {
            return [...prev, userId];
          }
          return prev;
        });
      },

      onUserTypingStop: (userId: string) => {
        logger.debug('User stopped typing', { userId });
        setTypingUsers(prev => prev.filter(id => id !== userId));
      },
    });

    wsClient.current.connect();

    return () => {
      wsClient.current?.disconnect();
      wsClient.current = null;
    };
  }, [session, status, scrollToBottom]);

  const handleSendMessage = useCallback(async (text: string, mentions?: string[]) => {
    try {
      if (!wsClient.current || !wsClient.current.isConnected()) {
        logger.error('Cannot send message: not connected to server');
        throw new Error('Not connected to chat server');
      }

      logger.info('Sending message', {
        textLength: text.length,
        hasMentions: !!mentions?.length,
        mentionsCount: mentions?.length || 0
      });

      wsClient.current.sendMessage('default', text);
      trackEvent('message_sent', {
        textLength: text.length,
        hasMentions: !!mentions?.length,
        mentionsCount: mentions?.length || 0
      });

      clearError(); // 成功時はエラーをクリア
    } catch (error) {
      logger.error('Failed to send message', { text: text.substring(0, 100) }, error as Error);
      trackEvent('message_send_failed', { error: (error as Error).message });
      handleError(error, 'sending message');
      throw error; // MessageComposerにエラーを再スロー
    }
  }, [handleError, clearError, logger, trackEvent]);

  const handleDisplayNameChange = useCallback((newName: string) => {
    try {
      if (!wsClient.current || !wsClient.current.isConnected()) {
        logger.error('Cannot change display name: not connected to server');
        showError(createErrorInfo.connectionError('Not connected to chat server'));
        return;
      }

      logger.info('Changing display name', { newName, currentName: currentDisplayName });
      wsClient.current.setDisplayName(newName);
      setCurrentDisplayName(newName);
      trackEvent('display_name_changed', { newName });
      clearError();
    } catch (error) {
      logger.error('Failed to change display name', { newName }, error as Error);
      trackEvent('display_name_change_failed', { error: (error as Error).message });
      handleError(error, 'changing display name');
    }
  }, [showError, clearError, handleError, logger, trackEvent, currentDisplayName]);

  // ローディング状態
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // シンプルな接続状態表示
  const renderConnectionStatus = () => {
    let statusColor = 'bg-gray-500';
    let statusText = 'Unknown';

    switch (connectionState) {
      case 'connecting':
        statusColor = 'bg-yellow-500';
        statusText = 'Connecting...';
        break;
      case 'connected':
        statusColor = 'bg-green-500';
        statusText = 'Connected';
        break;
      case 'disconnected':
        statusColor = 'bg-red-500';
        statusText = 'Disconnected';
        break;
      case 'reconnecting':
        statusColor = 'bg-orange-500 animate-pulse';
        statusText = 'Reconnecting...';
        break;
      case 'error':
        statusColor = 'bg-red-500';
        statusText = 'Error';
        break;
    }

    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className={`w-2 h-2 rounded-full ${statusColor}`}></div>
        <span className="text-xs text-slate-600 dark:text-slate-400">{statusText}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col">
      <ChatHeader
        roomName="default"
        currentDisplayName={currentDisplayName}
        onDisplayNameChange={handleDisplayNameChange}
      />

      {renderConnectionStatus()}

      {/* エラー表示 */}
      <ErrorDisplay error={error} onDismiss={clearError} />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop: Show sidebar, Mobile: Hide by default */}
        <div className="hidden lg:block flex-shrink-0">
          <UserList users={users} currentUserId={session?.user?.id} />
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <MessageList
            messages={messages}
            currentUserId={session?.user?.id}
            onlineUsers={users}
            typingUsers={typingUsers}
          />

          {/* スクロールアンカー */}
          <div ref={messagesEndRef} />

          <MessageComposer
            onSendMessage={handleSendMessage}
            disabled={connectionState !== 'connected'}
            onlineUsers={users}
            ws={wsClient.current?.getWebSocket() || undefined}
            roomId="default"
          />
        </div>
      </div>

      {/* Mobile bottom navigation for users */}
      <div className="lg:hidden border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {users.length} online
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            {users.slice(0, 3).map((user, index) => (
              <span key={user.id} className={index > 0 ? 'opacity-60' : ''}>
                {user.displayName}
                {index < Math.min(users.length - 1, 2) && ','}
              </span>
            ))}
            {users.length > 3 && <span className="opacity-60">+{users.length - 3}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}