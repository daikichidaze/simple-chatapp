'use client';

import { useState, useEffect, useRef } from 'react';
import { OnlineUser } from '@/utils/mentions';

interface MentionPickerProps {
  onlineUsers: OnlineUser[];
  onSelect: (user: OnlineUser) => void;
  onClose: () => void;
  position: { top: number; left: number };
  query: string;
}

export function MentionPicker({
  onlineUsers,
  onSelect,
  onClose,
  position,
  query
}: MentionPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // クエリに基づいてユーザーをフィルタリング
  const filteredUsers = onlineUsers.filter(user =>
    user.displayName.toLowerCase().includes(query.toLowerCase())
  );

  // 選択インデックスをリセット
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // キーボード操作
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : filteredUsers.length - 1
          );
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev =>
            prev < filteredUsers.length - 1 ? prev + 1 : 0
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredUsers[selectedIndex]) {
            onSelect(filteredUsers[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredUsers, selectedIndex, onSelect, onClose]);

  // クリックアウトサイドで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (filteredUsers.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-50 max-w-xs"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <ul
        ref={listRef}
        className="py-1 max-h-48 overflow-y-auto"
        role="listbox"
        aria-label="Mention suggestions"
      >
        {filteredUsers.map((user, index) => (
          <li
            key={user.id}
            className={`px-3 py-2 cursor-pointer flex items-center gap-2 ${
              index === selectedIndex
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-100'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            role="option"
            aria-selected={index === selectedIndex}
            onClick={() => onSelect(user)}
          >
            {/* アバタープレースホルダー */}
            <div className="w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-xs font-medium">
              {user.displayName[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-sm truncate">
                {user.displayName}
              </span>
              <span className="text-xs opacity-60">
                @{user.displayName.toLowerCase()}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* ヘルプテキスト */}
      <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center justify-between">
          <span>↑↓ to navigate</span>
          <span>Enter to select • Esc to close</span>
        </div>
      </div>
    </div>
  );
}