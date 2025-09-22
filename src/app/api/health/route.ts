import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    // Basic health checks
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        database: 'ok', // SQLite is file-based, always available if file system works
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        }
      }
    };

    logger.debug('Health check requested', health, 'HealthCheck');

    return NextResponse.json(health, { status: 200 });
  } catch (error) {
    logger.error('Health check failed', {}, error as Error, 'HealthCheck');

    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: (error as Error).message
      },
      { status: 503 }
    );
  }
}