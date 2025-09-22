// システムモニタリングとアナリティクス
import { logger } from './logger';

export interface MetricData {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  unit?: string;
}

export interface UserEvent {
  event: string;
  userId?: string;
  sessionId: string;
  timestamp: number;
  properties?: Record<string, any>;
}

export interface SystemHealth {
  websocket: {
    connected: boolean;
    connectionCount: number;
    lastConnected?: number;
    lastDisconnected?: number;
    reconnectCount: number;
  };
  messages: {
    sent: number;
    received: number;
    failed: number;
    rateLimited: number;
  };
  errors: {
    count: number;
    lastError?: string;
    lastErrorTime?: number;
  };
  performance: {
    averageMessageDelay: number;
    connectionLatency: number;
  };
}

class MonitoringService {
  private metrics: MetricData[] = [];
  private events: UserEvent[] = [];
  private health: SystemHealth = {
    websocket: {
      connected: false,
      connectionCount: 0,
      reconnectCount: 0,
    },
    messages: {
      sent: 0,
      received: 0,
      failed: 0,
      rateLimited: 0,
    },
    errors: {
      count: 0,
    },
    performance: {
      averageMessageDelay: 0,
      connectionLatency: 0,
    },
  };

  private sessionId: string;
  private startTime: number;

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = Date.now();

    // Initialize monitoring
    this.initializeMonitoring();
  }

  private initializeMonitoring(): void {
    // Monitor page visibility changes
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.trackEvent('page_visibility_change', {
          visible: !document.hidden,
        });
      });
    }

    // Monitor connection changes
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      window.addEventListener('online', () => {
        this.trackEvent('network_status_change', { online: true });
        logger.info('Network connection restored', {}, 'Monitoring');
      });

      window.addEventListener('offline', () => {
        this.trackEvent('network_status_change', { online: false });
        logger.warn('Network connection lost', {}, 'Monitoring');
      });
    }

    // Monitor errors
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.recordError('javascript_error', event.error, {
          filename: event.filename,
          line: event.lineno,
          column: event.colno,
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.recordError('unhandled_promise_rejection', event.reason);
      });
    }

    // Send periodic health reports
    setInterval(() => {
      this.sendHealthReport();
    }, 60000); // Every minute
  }

  // Metrics tracking
  recordMetric(name: string, value: number, tags?: Record<string, string>, unit?: string): void {
    const metric: MetricData = {
      name,
      value,
      timestamp: Date.now(),
      tags,
      unit,
    };

    this.metrics.push(metric);
    logger.debug(`Metric recorded: ${name}=${value}${unit ? unit : ''}`, { metric }, 'Monitoring');

    // Keep only recent metrics
    if (this.metrics.length > 1000) {
      this.metrics.splice(0, this.metrics.length - 1000);
    }
  }

  // Event tracking
  trackEvent(event: string, properties?: Record<string, any>, userId?: string): void {
    const userEvent: UserEvent = {
      event,
      userId,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      properties,
    };

    this.events.push(userEvent);
    logger.info(`Event tracked: ${event}`, { event: userEvent }, 'Analytics');

    // Keep only recent events
    if (this.events.length > 500) {
      this.events.splice(0, this.events.length - 500);
    }
  }

  // Error tracking
  recordError(type: string, error: any, context?: Record<string, any>): void {
    this.health.errors.count++;
    this.health.errors.lastError = error?.message || String(error);
    this.health.errors.lastErrorTime = Date.now();

    logger.error(`Error recorded: ${type}`, {
      type,
      error: error?.message || String(error),
      stack: error?.stack,
      ...context,
    }, error instanceof Error ? error : undefined, 'Monitoring');

    this.recordMetric('errors.count', 1, { type });
  }

  // WebSocket monitoring
  recordWebSocketConnection(connected: boolean): void {
    const wasConnected = this.health.websocket.connected;

    this.health.websocket.connected = connected;

    if (connected) {
      this.health.websocket.connectionCount++;
      this.health.websocket.lastConnected = Date.now();

      if (wasConnected === false) {
        this.health.websocket.reconnectCount++;
        this.trackEvent('websocket_reconnected');
        logger.info('WebSocket reconnected', { reconnectCount: this.health.websocket.reconnectCount }, 'WebSocket');
      } else {
        this.trackEvent('websocket_connected');
        logger.info('WebSocket connected', {}, 'WebSocket');
      }
    } else {
      this.health.websocket.lastDisconnected = Date.now();
      this.trackEvent('websocket_disconnected');
      logger.warn('WebSocket disconnected', {}, 'WebSocket');
    }

    this.recordMetric('websocket.connected', connected ? 1 : 0);
  }

  recordWebSocketLatency(latency: number): void {
    this.health.performance.connectionLatency = latency;
    this.recordMetric('websocket.latency', latency, undefined, 'ms');
    logger.debug(`WebSocket latency: ${latency}ms`, { latency }, 'Performance');
  }

  // Message monitoring
  recordMessageSent(): void {
    this.health.messages.sent++;
    this.recordMetric('messages.sent', 1);
    this.trackEvent('message_sent');
  }

  recordMessageReceived(delay?: number): void {
    this.health.messages.received++;
    this.recordMetric('messages.received', 1);

    if (delay !== undefined) {
      // Update average delay (simple moving average)
      const currentAvg = this.health.performance.averageMessageDelay;
      const count = this.health.messages.received;
      this.health.performance.averageMessageDelay = (currentAvg * (count - 1) + delay) / count;

      this.recordMetric('messages.delay', delay, undefined, 'ms');
    }

    this.trackEvent('message_received', delay !== undefined ? { delay } : undefined);
  }

  recordMessageFailed(reason?: string): void {
    this.health.messages.failed++;
    this.recordMetric('messages.failed', 1, reason ? { reason } : undefined);
    this.trackEvent('message_failed', { reason });
    logger.warn('Message failed', { reason }, 'Messaging');
  }

  recordRateLimited(): void {
    this.health.messages.rateLimited++;
    this.recordMetric('messages.rate_limited', 1);
    this.trackEvent('rate_limited');
    logger.warn('Rate limited', {}, 'Messaging');
  }

  // Authentication monitoring
  recordAuthEvent(event: 'login' | 'logout' | 'login_failed' | 'session_expired', userId?: string): void {
    this.trackEvent(`auth_${event}`, { userId });
    this.recordMetric(`auth.${event}`, 1);
    logger.info(`Authentication event: ${event}`, { userId, event }, 'Authentication');
  }

  // Performance monitoring
  recordPageLoad(loadTime: number): void {
    this.recordMetric('performance.page_load', loadTime, undefined, 'ms');
    this.trackEvent('page_loaded', { loadTime });
    logger.info(`Page loaded in ${loadTime}ms`, { loadTime }, 'Performance');
  }

  recordComponentRender(component: string, renderTime: number): void {
    this.recordMetric('performance.component_render', renderTime, { component }, 'ms');

    if (renderTime > 100) {
      logger.warn(`Slow component render: ${component}`, { renderTime }, 'Performance');
    }
  }

  // Health reporting
  getHealth(): SystemHealth {
    return { ...this.health };
  }

  private sendHealthReport(): void {
    const uptime = Date.now() - this.startTime;
    const healthReport = {
      ...this.health,
      uptime,
      timestamp: Date.now(),
    };

    logger.info('System health report', healthReport, 'Monitoring');

    // In production, this would send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Send to monitoring service (placeholder)
      console.log('Would send health report to monitoring service:', healthReport);
    }
  }

  // Data export
  exportMetrics(): MetricData[] {
    return [...this.metrics];
  }

  exportEvents(): UserEvent[] {
    return [...this.events];
  }

  // Cleanup
  clearData(): void {
    this.metrics.length = 0;
    this.events.length = 0;
    logger.info('Monitoring data cleared', {}, 'Monitoring');
  }
}

// Create global monitoring instance
export const monitoring = new MonitoringService();

// React hooks for monitoring
import { useEffect, useCallback } from 'react';

export function useComponentMonitoring(componentName: string) {
  const trackEvent = useCallback((event: string, properties?: Record<string, any>) => {
    monitoring.trackEvent(`${componentName}_${event}`, properties);
  }, [componentName]);

  const recordMetric = useCallback((metric: string, value: number, unit?: string) => {
    monitoring.recordMetric(`${componentName}.${metric}`, value, { component: componentName }, unit);
  }, [componentName]);

  useEffect(() => {
    const startTime = performance.now();
    trackEvent('mounted');

    return () => {
      const renderTime = performance.now() - startTime;
      monitoring.recordComponentRender(componentName, renderTime);
      trackEvent('unmounted', { renderTime });
    };
  }, [componentName, trackEvent]);

  return {
    trackEvent,
    recordMetric,
  };
}

export function usePerformanceMonitoring() {
  const measureRender = useCallback((componentName: string, fn: () => any) => {
    const start = performance.now();
    const result = fn();
    const renderTime = performance.now() - start;
    monitoring.recordComponentRender(componentName, renderTime);
    return result;
  }, []);

  return { measureRender };
}

export default monitoring;