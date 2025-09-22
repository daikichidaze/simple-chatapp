'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { WebSocketClient } from '@/lib/websocket-client';
import { ErrorDisplay, useErrorHandler, createErrorInfo } from '@/components/ErrorDisplay';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { error, showError, clearError, handleError } = useErrorHandler();

  const [displayName, setDisplayName] = useState('');
  const [tempDisplayName, setTempDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [wsClient, setWsClient] = useState<WebSocketClient | null>(null);

  // 認証チェック
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (session?.user?.displayName) {
      setDisplayName(session.user.displayName);
      setTempDisplayName(session.user.displayName);
    }
  }, [session, status, router]);

  // WebSocket クライアント初期化（設定変更用）
  useEffect(() => {
    if (status !== 'authenticated' || !session) return;

    const client = new WebSocketClient({
      onConnected: () => {
        clearError();
      },
      onError: (code, message) => {
        let errorInfo;
        switch (code) {
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
      },
      onDisconnected: () => {
        showError(createErrorInfo.connectionError('Connection lost'));
      }
    });

    client.connect();
    setWsClient(client);

    return () => {
      client.disconnect();
    };
  }, [session, status, showError, clearError]);

  const handleDisplayNameChange = useCallback((value: string) => {
    setTempDisplayName(value);
    setHasChanges(value.trim() !== displayName);
  }, [displayName]);

  const handleSave = useCallback(async () => {
    const trimmedName = tempDisplayName.trim();

    if (!trimmedName) {
      showError(createErrorInfo.badRequest('Display name cannot be empty'));
      return;
    }

    if (trimmedName.length > 50) {
      showError(createErrorInfo.badRequest('Display name must be 50 characters or less'));
      return;
    }

    if (trimmedName === displayName) {
      setHasChanges(false);
      return;
    }

    if (!wsClient || !wsClient.isConnected()) {
      showError(createErrorInfo.connectionError('Not connected to server. Please refresh and try again.'));
      return;
    }

    setIsLoading(true);
    try {
      wsClient.setDisplayName(trimmedName);
      setDisplayName(trimmedName);
      setHasChanges(false);
      clearError();

      // 成功メッセージを表示
      showError(createErrorInfo.success('Display name updated successfully!'));
    } catch (error) {
      handleError(error, 'updating display name');
    } finally {
      setIsLoading(false);
    }
  }, [tempDisplayName, displayName, wsClient, showError, clearError, handleError]);

  const handleReset = useCallback(() => {
    setTempDisplayName(displayName);
    setHasChanges(false);
    clearError();
  }, [displayName, clearError]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleReset();
    }
  }, [handleSave, handleReset]);

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

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              User Settings
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manage your chat preferences
            </p>
          </div>
          <button
            onClick={() => router.push('/chat')}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300
              hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700
              rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            ← Back to Chat
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Error Display */}
        <ErrorDisplay error={error} onDismiss={clearError} />

        <div className="space-y-8">
          {/* Profile Section */}
          <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Profile Information
            </h2>

            <div className="space-y-4">
              {/* User ID (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  User ID
                </label>
                <input
                  type="text"
                  value={session?.user?.id || ''}
                  readOnly
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600
                    rounded-md text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Your unique identifier (cannot be changed)
                </p>
              </div>

              {/* Display Name */}
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={tempDisplayName}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter your display name"
                  maxLength={50}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md
                    bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    placeholder-slate-400 dark:placeholder-slate-500"
                  disabled={isLoading}
                />
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    This is how others will see your name in the chat
                  </p>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {tempDisplayName.length}/50
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || isLoading || !tempDisplayName.trim()}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition-colors duration-150
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${hasChanges && tempDisplayName.trim() && !isLoading
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400'
                    }
                  `}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                      <span>Saving...</span>
                    </div>
                  ) : (
                    'Save Changes'
                  )}
                </button>

                <button
                  onClick={handleReset}
                  disabled={!hasChanges || isLoading}
                  className="px-4 py-2 rounded-md font-medium text-sm text-slate-600 dark:text-slate-300
                    bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600
                    focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  Reset
                </button>
              </div>
            </div>
          </section>

          {/* Chat Preferences Section */}
          <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Chat Preferences
            </h2>

            <div className="text-sm text-slate-500 dark:text-slate-400">
              <p>Additional preferences will be available in future updates:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Theme selection (light/dark/system)</li>
                <li>Notification settings</li>
                <li>Message display options</li>
                <li>Privacy settings</li>
              </ul>
            </div>
          </section>
        </div>

        {/* Help Section */}
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Need help? Contact support or check our documentation.
          </p>
        </div>
      </main>
    </div>
  );
}