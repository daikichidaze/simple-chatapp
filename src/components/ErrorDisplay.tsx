'use client';

import { useState } from 'react';

export interface ErrorInfo {
  code: string;
  message: string;
  timestamp?: number;
  retry?: () => void;
}

interface ErrorDisplayProps {
  error: ErrorInfo | null;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorDisplay({ error, onDismiss, className = '' }: ErrorDisplayProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (!error || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  const getErrorIcon = (code: string) => {
    switch (code) {
      case 'SUCCESS':
        return '✅';
      case 'RATE_LIMIT':
        return '🐌';
      case 'UNAUTH':
        return '🔒';
      case 'BAD_REQUEST':
        return '❌';
      case 'SERVER_ERROR':
        return '🔧';
      case 'NETWORK_ERROR':
        return '🌐';
      case 'CONNECTION_ERROR':
        return '🔌';
      default:
        return '⚠️';
    }
  };

  const getErrorTitle = (code: string) => {
    switch (code) {
      case 'SUCCESS':
        return 'Success';
      case 'RATE_LIMIT':
        return 'Slow down';
      case 'UNAUTH':
        return 'Authentication required';
      case 'BAD_REQUEST':
        return 'Invalid request';
      case 'SERVER_ERROR':
        return 'Server error';
      case 'NETWORK_ERROR':
        return 'Network error';
      case 'CONNECTION_ERROR':
        return 'Connection error';
      default:
        return 'Error';
    }
  };

  const getErrorColor = (code: string) => {
    switch (code) {
      case 'SUCCESS':
        return 'border-green-300 bg-green-50 text-green-900 dark:border-green-600 dark:bg-green-900/20 dark:text-green-100';
      case 'RATE_LIMIT':
        return 'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-600 dark:bg-orange-900/20 dark:text-orange-100';
      case 'UNAUTH':
        return 'border-red-300 bg-red-50 text-red-900 dark:border-red-600 dark:bg-red-900/20 dark:text-red-100';
      case 'BAD_REQUEST':
        return 'border-red-300 bg-red-50 text-red-900 dark:border-red-600 dark:bg-red-900/20 dark:text-red-100';
      case 'SERVER_ERROR':
        return 'border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-600 dark:bg-purple-900/20 dark:text-purple-100';
      case 'NETWORK_ERROR':
      case 'CONNECTION_ERROR':
        return 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-600 dark:bg-blue-900/20 dark:text-blue-100';
      default:
        return 'border-gray-300 bg-gray-50 text-gray-900 dark:border-gray-600 dark:bg-gray-900/20 dark:text-gray-100';
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`border rounded-md p-4 mb-4 ${getErrorColor(error.code)} ${className}`}
    >
      <div className="flex items-start">
        <div className="flex-shrink-0 text-2xl mr-3">
          {getErrorIcon(error.code)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold mb-1">
            {getErrorTitle(error.code)}
          </h3>
          <p className="text-sm opacity-90">
            {error.message}
          </p>
          {error.timestamp && (
            <p className="text-xs opacity-60 mt-1">
              {new Date(error.timestamp).toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 ml-4">
          {error.retry && (
            <button
              onClick={error.retry}
              className="text-sm px-3 py-1 rounded bg-white/20 hover:bg-white/30 border border-current/20 hover:border-current/30 transition-colors mr-2"
              aria-label="Retry action"
            >
              Retry
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="text-sm px-3 py-1 rounded bg-white/20 hover:bg-white/30 border border-current/20 hover:border-current/30 transition-colors"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// 特定のエラータイプに対応するヘルパー関数
export const createErrorInfo = {
  success: (message: string = 'Operation completed successfully!'): ErrorInfo => ({
    code: 'SUCCESS',
    message,
    timestamp: Date.now()
  }),

  rateLimit: (message: string = 'Too many messages. Please slow down.'): ErrorInfo => ({
    code: 'RATE_LIMIT',
    message,
    timestamp: Date.now()
  }),

  authentication: (message: string = 'Please sign in to continue.'): ErrorInfo => ({
    code: 'UNAUTH',
    message,
    timestamp: Date.now()
  }),

  badRequest: (message: string = 'Invalid request. Please try again.'): ErrorInfo => ({
    code: 'BAD_REQUEST',
    message,
    timestamp: Date.now()
  }),

  serverError: (message: string = 'Server error. Please try again later.'): ErrorInfo => ({
    code: 'SERVER_ERROR',
    message,
    timestamp: Date.now()
  }),

  networkError: (message: string = 'Network error. Please check your connection.', retry?: () => void): ErrorInfo => ({
    code: 'NETWORK_ERROR',
    message,
    timestamp: Date.now(),
    retry
  }),

  connectionError: (message: string = 'Connection lost. Attempting to reconnect...', retry?: () => void): ErrorInfo => ({
    code: 'CONNECTION_ERROR',
    message,
    timestamp: Date.now(),
    retry
  })
};

// エラー管理用のカスタムフック
import { useCallback } from 'react';

export function useErrorHandler() {
  const [error, setError] = useState<ErrorInfo | null>(null);

  const showError = useCallback((errorInfo: ErrorInfo) => {
    setError(errorInfo);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleError = useCallback((err: any, context: string = '') => {
    let errorInfo: ErrorInfo;

    if (typeof err === 'string') {
      errorInfo = createErrorInfo.badRequest(err);
    } else if (err?.code && err?.message) {
      errorInfo = err as ErrorInfo;
    } else if (err?.message) {
      errorInfo = createErrorInfo.serverError(err.message);
    } else {
      errorInfo = createErrorInfo.serverError(`An error occurred${context ? ` in ${context}` : ''}`);
    }

    showError(errorInfo);
  }, [showError]);

  return {
    error,
    showError,
    clearError,
    handleError
  };
}