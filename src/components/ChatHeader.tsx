'use client';

import { signOut } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ChatHeaderProps {
  roomName: string;
  currentDisplayName?: string;
  onDisplayNameChange?: (name: string) => void;
}

export function ChatHeader({
  roomName,
  currentDisplayName,
  onDisplayNameChange
}: ChatHeaderProps) {
  const router = useRouter();
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(currentDisplayName || '');

  const handleNameSubmit = () => {
    const trimmedName = tempName.trim();
    if (trimmedName && trimmedName !== currentDisplayName && onDisplayNameChange) {
      onDisplayNameChange(trimmedName);
    }
    setIsEditingName(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      setTempName(currentDisplayName || '');
      setIsEditingName(false);
    }
  };

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-3 sm:px-6 py-3 sm:py-4">
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
            #{roomName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Group chat room
          </p>
        </div>

        <div className="flex items-center gap-1 sm:gap-4 ml-4">
          {/* Display Name Editor */}
          <div className="flex items-center gap-2 hidden sm:flex">
            <span className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Display name:
            </span>
            {isEditingName ? (
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={handleKeyDown}
                className="input text-sm px-2 py-1 w-32"
                autoFocus
                maxLength={50}
              />
            ) : (
              <button
                onClick={() => {
                  setTempName(currentDisplayName || '');
                  setIsEditingName(true);
                }}
                className="btn-ghost text-sm px-2 py-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                {currentDisplayName || 'Set name'}
              </button>
            )}
          </div>

          {/* Mobile Name Display */}
          <div className="sm:hidden flex items-center">
            <button
              onClick={() => router.push('/settings')}
              className="btn-ghost text-xs px-2 py-1 text-slate-600 dark:text-slate-300"
              title="Settings and Profile"
            >
              {currentDisplayName || 'Profile'}
            </button>
          </div>

          {/* Settings Button */}
          <button
            onClick={() => router.push('/settings')}
            className="btn-ghost btn-sm hidden sm:inline-flex"
            title="User Settings"
          >
            ⚙️ Settings
          </button>

          {/* Mobile Settings Button */}
          <button
            onClick={() => router.push('/settings')}
            className="btn-ghost btn-sm sm:hidden w-8 h-8 p-0 flex items-center justify-center"
            title="Settings"
          >
            ⚙️
          </button>

          {/* Sign Out Button */}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="btn-ghost btn-sm hidden sm:inline-flex"
          >
            Sign out
          </button>

          {/* Mobile Sign Out Button */}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="btn-ghost btn-sm sm:hidden w-8 h-8 p-0 flex items-center justify-center text-red-600 dark:text-red-400"
            title="Sign out"
          >
            ↗
          </button>
        </div>
      </div>
    </header>
  );
}