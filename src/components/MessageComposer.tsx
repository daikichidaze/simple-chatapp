'use client';

import { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { validateMessageText } from '@/utils/sanitize';
import { extractMentions, OnlineUser } from '@/utils/mentions';
import { MentionPicker } from './MentionPicker';

interface MessageComposerProps {
  onSendMessage: (text: string, mentions?: string[]) => void;
  disabled?: boolean;
  maxLength?: number;
  onlineUsers?: OnlineUser[];
}

export function MessageComposer({
  onSendMessage,
  disabled = false,
  maxLength = 2000,
  onlineUsers = []
}: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [mentionPickerPosition, setMentionPickerPosition] = useState({ top: 0, left: 0 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // メンション検出
  const handleMessageChange = (value: string) => {
    setMessage(value);

    if (!textareaRef.current) return;

    const cursorPosition = textareaRef.current.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPosition);

    // @記号の検出
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1];
      const startIndex = cursorPosition - mentionMatch[0].length;

      setMentionQuery(query);
      setMentionStartIndex(startIndex);
      setShowMentionPicker(true);

      // ピッカーの位置を計算
      const textarea = textareaRef.current;
      const rect = textarea.getBoundingClientRect();
      setMentionPickerPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX
      });
    } else {
      setShowMentionPicker(false);
      setMentionQuery('');
      setMentionStartIndex(-1);
    }
  };

  // メンション選択処理
  const handleMentionSelect = (user: OnlineUser) => {
    if (mentionStartIndex === -1 || !textareaRef.current) return;

    const beforeMention = message.substring(0, mentionStartIndex);
    const afterMention = message.substring(textareaRef.current.selectionStart);
    const newMessage = `${beforeMention}@${user.displayName} ${afterMention}`;

    setMessage(newMessage);
    setShowMentionPicker(false);
    setMentionQuery('');
    setMentionStartIndex(-1);

    // フォーカスを戻す
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = beforeMention.length + user.displayName.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
  };

  const handleMentionPickerClose = () => {
    setShowMentionPicker(false);
    setMentionQuery('');
    setMentionStartIndex(-1);
  };

  const handleSubmit = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || disabled || isSending) return;

    // メッセージ検証
    const validation = validateMessageText(trimmedMessage);
    if (!validation.isValid) {
      alert(validation.error);
      return;
    }

    // メンション抽出
    const mentions = extractMentions(trimmedMessage, onlineUsers);

    setIsSending(true);
    try {
      await onSendMessage(trimmedMessage, mentions);
      setMessage('');

      // フォーカスを戻す
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // メンションピッカーが表示されている場合は、MentionPickerにキーボード操作を任せる
    if (showMentionPicker && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'Escape')) {
      return; // MentionPickerがハンドリングする
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isOverLimit = message.length > maxLength;
  const remainingChars = maxLength - message.length;

  return (
    <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-3 sm:p-4">
      <div className="flex flex-col gap-2 max-w-4xl mx-auto">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => handleMessageChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            disabled={disabled || isSending}
            rows={Math.min(Math.max(1, message.split('\n').length), 4)}
            className={`input flex-1 resize-none text-sm sm:text-base min-h-[44px] py-3
              ${isOverLimit
                ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20'
                : ''
              }
            `}
            aria-label="Message input"
            maxLength={maxLength + 100} // ソフトリミット
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || isSending || !message.trim() || isOverLimit}
            className="btn btn-primary btn-sm min-w-[80px] sm:min-w-[100px] h-11 sm:h-auto flex-shrink-0"
            aria-label="Send message"
          >
            {isSending ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                <span className="hidden sm:inline">Sending...</span>
                <span className="sm:hidden">...</span>
              </div>
            ) : (
              <>
                <span className="hidden sm:inline">Send</span>
                <span className="sm:hidden">↑</span>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="hidden sm:inline">Enter to send, Shift+Enter for new line</span>
          <span className="sm:hidden">Tap ↑ to send</span>
          {(remainingChars < 100 || isOverLimit) && (
            <span className={isOverLimit ? 'text-red-500 font-medium' : ''}>
              {remainingChars < 0 ? 'Too long' : `${remainingChars} chars left`}
            </span>
          )}
        </div>

        {isOverLimit && (
          <div className="text-sm text-red-500 font-medium">
            Message too long. Please shorten your message.
          </div>
        )}
      </div>

      {/* メンションピッカー */}
      {showMentionPicker && (
        <MentionPicker
          onlineUsers={onlineUsers}
          onSelect={handleMentionSelect}
          onClose={handleMentionPickerClose}
          position={mentionPickerPosition}
          query={mentionQuery}
        />
      )}
    </div>
  );
}