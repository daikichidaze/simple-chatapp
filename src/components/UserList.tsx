'use client';

import { User } from '@/types';

interface UserListProps {
  users: User[];
  currentUserId?: string;
}

export function UserList({ users, currentUserId }: UserListProps) {
  return (
    <div className="w-64 bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 p-4">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
        Online ({users.length})
      </h2>

      <div className="space-y-2">
        {users.map((user) => (
          <div
            key={user.id}
            className={`flex items-center gap-3 p-2 rounded-md ${
              user.id === currentUserId
                ? 'bg-blue-100 dark:bg-blue-900/50'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
            <div className="flex-1 min-w-0">
              <span
                className={`text-sm font-medium truncate ${
                  user.id === currentUserId
                    ? 'text-blue-900 dark:text-blue-100'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
                title={user.displayName}
              >
                {user.displayName}
                {user.id === currentUserId && (
                  <span className="text-xs opacity-75 ml-1">(you)</span>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
          No users online
        </p>
      )}
    </div>
  );
}