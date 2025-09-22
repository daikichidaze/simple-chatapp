'use client';

import { Message, User } from '@/types';
import { formatTime } from '@/utils/time';
import { sanitizeText } from '@/utils/sanitize';
import { highlightMentions } from '@/utils/mentions';

interface MessageListProps {
  messages: Message[];
  currentUserId?: string;
  onlineUsers?: User[];
}

interface MessageItemProps {
  message: Message;
  isOwnMessage: boolean;
  onlineUsers: User[];
  currentUserId?: string;
}

function MessageItem({ message, isOwnMessage, onlineUsers, currentUserId }: MessageItemProps) {
  // メンションハイライト処理
  const processMessageText = (text: string): string => {
    // まず基本的なサニタイゼーション
    let sanitizedText = sanitizeText(text);

    // メンションハイライトを追加
    if (onlineUsers.length > 0) {
      const mentionClass = currentUserId && message.mentions?.includes(currentUserId)
        ? 'mention mention-self'
        : 'mention';
      sanitizedText = highlightMentions(text, onlineUsers, mentionClass);
      // サニタイゼーションを再適用（リンク以外）
      sanitizedText = sanitizedText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\n/g, '<br>');
    }

    return sanitizedText;
  };

  const isCurrentUserMentioned = currentUserId && message.mentions?.includes(currentUserId);

  return (
    <div className={`mb-4 px-2 sm:px-0 ${isOwnMessage ? 'text-right' : ''}`}>
      <div className={`message-bubble ${
        isOwnMessage
          ? 'own'
          : isCurrentUserMentioned
            ? 'mentioned'
            : 'other'
      } max-w-[280px] sm:max-w-xs lg:max-w-md transition-all duration-200`}>
        {!isOwnMessage && (
          <div className="text-xs font-medium mb-1.5 opacity-75">
            {message.displayName}
          </div>
        )}
        <div
          className="break-words leading-relaxed"
          dangerouslySetInnerHTML={{ __html: processMessageText(message.text) }}
        />
        <div className={`text-xs mt-2 opacity-75 flex items-center justify-between flex-wrap gap-1 ${
          isOwnMessage ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
        }`}>
          <span>{formatTime(message.ts)}</span>
          {isCurrentUserMentioned && (
            <span className="text-yellow-600 dark:text-yellow-400 font-medium text-xs">
              📢 Mentioned
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessageList({ messages, currentUserId, onlineUsers = [] }: MessageListProps) {
  return (
    <div
      className="flex-1 overflow-y-auto scrollbar-thin bg-white dark:bg-slate-900 px-2 sm:px-4 py-4"
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
    >
      {messages.length === 0 ? (
        <div className="text-center text-slate-500 dark:text-slate-400 mt-8 px-4">
          <div className="text-4xl mb-4">💬</div>
          <p className="text-lg font-medium mb-2">No messages yet</p>
          <p className="text-sm opacity-75">Start the conversation!</p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4 max-w-4xl mx-auto">
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              isOwnMessage={message.userId === currentUserId}
              onlineUsers={onlineUsers}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}