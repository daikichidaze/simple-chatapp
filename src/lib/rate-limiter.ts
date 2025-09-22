/**
 * Rate limiter implementation using token bucket algorithm
 * Based on spec: 1ユーザー毎秒3通（バースト10）
 */

export interface RateLimiter {
  lastMessageTime: number;
  messageCount: number;
  isRateLimited(): boolean;
  recordMessage(): void;
}

export class TokenBucketRateLimiter implements RateLimiter {
  lastMessageTime = 0;
  messageCount = 0;
  private readonly maxMessages = 10; // バースト制限
  private readonly refillRate = 3; // 秒あたり3メッセージ
  private tokens = this.maxMessages;
  private lastRefill = Date.now();

  isRateLimited(): boolean {
    this.refillTokens();
    return this.tokens < 1;
  }

  recordMessage(): void {
    this.tokens = Math.max(0, this.tokens - 1);
    this.lastMessageTime = Date.now();
    this.messageCount++;
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxMessages,
      this.tokens + timePassed * this.refillRate
    );
    this.lastRefill = now;
  }
}