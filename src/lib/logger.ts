// 包括的なログシステム
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
  error?: Error;
  userId?: string;
  sessionId?: string;
  component?: string;
}

export interface LoggerOptions {
  level?: LogLevel;
  enableConsole?: boolean;
  enableStorage?: boolean;
  maxStorageEntries?: number;
  sessionId?: string;
}

class Logger {
  private level: LogLevel;
  private enableConsole: boolean;
  private enableStorage: boolean;
  private maxStorageEntries: number;
  private sessionId: string;
  private storageKey = 'chat-app-logs';

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? (process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG);
    this.enableConsole = options.enableConsole ?? true;
    this.enableStorage = options.enableStorage ?? (typeof window !== 'undefined');
    this.maxStorageEntries = options.maxStorageEntries ?? 1000;
    this.sessionId = options.sessionId ?? this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString();
    const levelName = LogLevel[entry.level];
    const component = entry.component ? `[${entry.component}]` : '';
    const context = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    return `${timestamp} ${levelName}${component}: ${entry.message}${context}`;
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error, component?: string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context,
      error,
      sessionId: this.sessionId,
      component,
    };

    // Console logging
    if (this.enableConsole) {
      const formattedMessage = this.formatMessage(entry);

      switch (level) {
        case LogLevel.ERROR:
          console.error(formattedMessage, error);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage);
          break;
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
      }
    }

    // Storage logging (client-side only)
    if (this.enableStorage && typeof window !== 'undefined') {
      this.storeLogEntry(entry);
    }

    // Send critical errors to monitoring service (production only)
    if (level === LogLevel.ERROR && process.env.NODE_ENV === 'production') {
      this.sendToMonitoring(entry);
    }
  }

  private storeLogEntry(entry: LogEntry): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      const logs: LogEntry[] = stored ? JSON.parse(stored) : [];

      logs.push(entry);

      // Maintain max entries limit
      if (logs.length > this.maxStorageEntries) {
        logs.splice(0, logs.length - this.maxStorageEntries);
      }

      localStorage.setItem(this.storageKey, JSON.stringify(logs));
    } catch (error) {
      console.warn('Failed to store log entry:', error);
    }
  }

  private async sendToMonitoring(entry: LogEntry): Promise<void> {
    // In a real app, this would send to a monitoring service like Sentry, LogRocket, etc.
    // For now, we'll just log it as a placeholder
    console.warn('Critical error would be sent to monitoring:', entry);
  }

  // Public logging methods
  error(message: string, context?: Record<string, any>, error?: Error, component?: string): void {
    this.log(LogLevel.ERROR, message, context, error, component);
  }

  warn(message: string, context?: Record<string, any>, component?: string): void {
    this.log(LogLevel.WARN, message, context, undefined, component);
  }

  info(message: string, context?: Record<string, any>, component?: string): void {
    this.log(LogLevel.INFO, message, context, undefined, component);
  }

  debug(message: string, context?: Record<string, any>, component?: string): void {
    this.log(LogLevel.DEBUG, message, context, undefined, component);
  }

  // Utility methods
  setUserId(userId: string): void {
    // This would be called when user logs in
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  getStoredLogs(): LogEntry[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to retrieve stored logs:', error);
      return [];
    }
  }

  clearStoredLogs(): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(this.storageKey);
      } catch (error) {
        console.warn('Failed to clear stored logs:', error);
      }
    }
  }

  exportLogs(): string {
    const logs = this.getStoredLogs();
    return logs.map(entry => this.formatMessage(entry)).join('\n');
  }

  // Performance monitoring
  startTimer(label: string): () => void {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return () => {
      const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
      this.info(`Timer: ${label}`, { duration: `${duration.toFixed(2)}ms` }, 'Performance');
    };
  }

  // WebSocket connection monitoring
  logWebSocketEvent(event: string, context?: Record<string, any>): void {
    this.info(`WebSocket: ${event}`, context, 'WebSocket');
  }

  // Authentication monitoring
  logAuthEvent(event: string, context?: Record<string, any>): void {
    this.info(`Auth: ${event}`, context, 'Authentication');
  }

  // Message monitoring
  logMessageEvent(event: string, context?: Record<string, any>): void {
    this.info(`Message: ${event}`, context, 'Messaging');
  }
}

// Create global logger instance
export const logger = new Logger({
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: true,
  enableStorage: true,
});

// React Hook for component logging
import { useCallback } from 'react';

export function useLogger(componentName: string) {
  return {
    error: useCallback((message: string, context?: Record<string, any>, error?: Error) =>
      logger.error(message, context, error, componentName), [componentName]),
    warn: useCallback((message: string, context?: Record<string, any>) =>
      logger.warn(message, context, componentName), [componentName]),
    info: useCallback((message: string, context?: Record<string, any>) =>
      logger.info(message, context, componentName), [componentName]),
    debug: useCallback((message: string, context?: Record<string, any>) =>
      logger.debug(message, context, componentName), [componentName]),
    timer: useCallback((label: string) => logger.startTimer(`${componentName}: ${label}`), [componentName]),
  };
}

// Performance monitoring utilities
export const performanceUtils = {
  measureAsync: async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const timer = logger.startTimer(label);
    try {
      const result = await fn();
      timer();
      return result;
    } catch (error) {
      timer();
      logger.error(`Performance measure failed: ${label}`, { label }, error as Error, 'Performance');
      throw error;
    }
  },

  measure: <T>(label: string, fn: () => T): T => {
    const timer = logger.startTimer(label);
    try {
      const result = fn();
      timer();
      return result;
    } catch (error) {
      timer();
      logger.error(`Performance measure failed: ${label}`, { label }, error as Error, 'Performance');
      throw error;
    }
  },
};

export default logger;