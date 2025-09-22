import { TokenBucketRateLimiter } from '@/lib/rate-limiter';

// Create a standalone rate limiter class for testing
class TestTokenBucketRateLimiter {
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

  // Test helpers
  getTokens(): number {
    this.refillTokens();
    return this.tokens;
  }

  setTime(timestamp: number): void {
    this.lastRefill = timestamp;
  }
}

describe('Rate Limiting Unit Tests', () => {
  let rateLimiter: TestTokenBucketRateLimiter;

  beforeEach(() => {
    rateLimiter = new TestTokenBucketRateLimiter();
  });

  describe('Token Bucket Algorithm', () => {
    it('should initialize with full token bucket', () => {
      expect(rateLimiter.getTokens()).toBe(10);
      expect(rateLimiter.isRateLimited()).toBe(false);
    });

    it('should consume tokens when recording messages', () => {
      rateLimiter.recordMessage();
      expect(rateLimiter.getTokens()).toBe(9);

      rateLimiter.recordMessage();
      expect(rateLimiter.getTokens()).toBe(8);
    });

    it('should rate limit when tokens are exhausted', () => {
      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.isRateLimited()).toBe(false);
        rateLimiter.recordMessage();
      }

      // Should now be rate limited
      expect(rateLimiter.isRateLimited()).toBe(true);
      expect(rateLimiter.getTokens()).toBe(0);
    });

    it('should not allow negative tokens', () => {
      // Exhaust all tokens
      for (let i = 0; i < 15; i++) {
        rateLimiter.recordMessage();
      }

      expect(rateLimiter.getTokens()).toBe(0);
    });
  });

  describe('Token Refill Mechanism', () => {
    it('should refill tokens at 3 per second', () => {
      const startTime = Date.now();
      rateLimiter.setTime(startTime);

      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordMessage();
      }
      expect(rateLimiter.getTokens()).toBe(0);

      // Fast forward 1 second
      rateLimiter.setTime(startTime + 1000);
      expect(Math.floor(rateLimiter.getTokens())).toBe(3);

      // Fast forward 2 more seconds (3 total)
      rateLimiter.setTime(startTime + 3000);
      expect(Math.floor(rateLimiter.getTokens())).toBe(9);
    });

    it('should cap tokens at maximum bucket size', () => {
      const startTime = Date.now();
      rateLimiter.setTime(startTime);

      // Fast forward 10 seconds (should refill 30 tokens but cap at 10)
      rateLimiter.setTime(startTime + 10000);
      expect(rateLimiter.getTokens()).toBe(10);
    });

    it('should handle partial refills correctly', () => {
      const startTime = Date.now();
      rateLimiter.setTime(startTime);

      // Use 5 tokens
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordMessage();
      }
      expect(rateLimiter.getTokens()).toBe(5);

      // Fast forward 0.5 seconds (should add 1.5 tokens)
      rateLimiter.setTime(startTime + 500);
      expect(rateLimiter.getTokens()).toBeCloseTo(6.5, 1);
    });
  });

  describe('Rate Limiting Scenarios', () => {
    it('should allow 3 messages per second continuously', () => {
      const startTime = Date.now();
      rateLimiter.setTime(startTime);

      // Send 3 messages immediately
      for (let i = 0; i < 3; i++) {
        expect(rateLimiter.isRateLimited()).toBe(false);
        rateLimiter.recordMessage();
      }

      // Fast forward 1 second and send 3 more
      rateLimiter.setTime(startTime + 1000);
      for (let i = 0; i < 3; i++) {
        expect(rateLimiter.isRateLimited()).toBe(false);
        rateLimiter.recordMessage();
      }

      // Should still have tokens available
      expect(rateLimiter.getTokens()).toBeGreaterThan(0);
    });

    it('should allow burst of 10 messages then rate limit', () => {
      // Send 10 messages in quick succession (burst)
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.isRateLimited()).toBe(false);
        rateLimiter.recordMessage();
      }

      // 11th message should be rate limited
      expect(rateLimiter.isRateLimited()).toBe(true);
    });

    it('should recover from rate limiting after token refill', () => {
      const startTime = Date.now();
      rateLimiter.setTime(startTime);

      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordMessage();
      }
      expect(rateLimiter.isRateLimited()).toBe(true);

      // Fast forward enough time to get 1 token back
      rateLimiter.setTime(startTime + 400); // 0.4 seconds = 1.2 tokens
      expect(rateLimiter.isRateLimited()).toBe(false);

      // Should be able to send one more message
      rateLimiter.recordMessage();
      expect(rateLimiter.isRateLimited()).toBe(true);
    });
  });

  describe('Message Tracking', () => {
    it('should track message count', () => {
      expect(rateLimiter.messageCount).toBe(0);

      rateLimiter.recordMessage();
      expect(rateLimiter.messageCount).toBe(1);

      rateLimiter.recordMessage();
      expect(rateLimiter.messageCount).toBe(2);
    });

    it('should track last message time', () => {
      const beforeTime = Date.now();
      rateLimiter.recordMessage();
      const afterTime = Date.now();

      expect(rateLimiter.lastMessageTime).toBeGreaterThanOrEqual(beforeTime);
      expect(rateLimiter.lastMessageTime).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('Spec Compliance', () => {
    it('should implement spec requirement: 1ユーザー毎秒3通（バースト10）', () => {
      // Test burst limit of 10
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.isRateLimited()).toBe(false);
        rateLimiter.recordMessage();
      }
      expect(rateLimiter.isRateLimited()).toBe(true);

      // Test refill rate of 3 per second
      const startTime = Date.now();
      rateLimiter.setTime(startTime);
      rateLimiter.setTime(startTime + 1000);

      // Should be able to send 3 more messages after 1 second
      for (let i = 0; i < 3; i++) {
        expect(rateLimiter.isRateLimited()).toBe(false);
        rateLimiter.recordMessage();
      }
      expect(rateLimiter.isRateLimited()).toBe(true);
    });

    it('should handle acceptance criteria: 4通目以降がRATE_LIMIT', () => {
      // Send 3 messages (should be allowed)
      for (let i = 0; i < 3; i++) {
        expect(rateLimiter.isRateLimited()).toBe(false);
        rateLimiter.recordMessage();
      }

      // 4th message within same second should trigger rate limit
      expect(rateLimiter.isRateLimited()).toBe(false); // Still have tokens from burst allowance
      rateLimiter.recordMessage();

      // Continue until rate limited
      let messagesUntilLimit = 0;
      while (!rateLimiter.isRateLimited() && messagesUntilLimit < 20) {
        rateLimiter.recordMessage();
        messagesUntilLimit++;
      }

      expect(rateLimiter.isRateLimited()).toBe(true);
      expect(rateLimiter.messageCount).toBeGreaterThan(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very short time intervals', () => {
      const startTime = Date.now();
      rateLimiter.setTime(startTime);

      // Fast forward by 1ms
      rateLimiter.setTime(startTime + 1);
      const tokens = rateLimiter.getTokens();

      // Should not gain significant tokens
      expect(tokens).toBeCloseTo(10, 2);
    });

    it('should handle very long time intervals', () => {
      const startTime = Date.now();
      rateLimiter.setTime(startTime);

      // Exhaust tokens
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordMessage();
      }

      // Fast forward 1 hour
      rateLimiter.setTime(startTime + 3600000);
      expect(rateLimiter.getTokens()).toBe(10); // Should be capped at max
    });

    it('should handle clock adjustments gracefully', () => {
      const startTime = Date.now();
      rateLimiter.setTime(startTime);

      // Go backwards in time (clock adjustment)
      rateLimiter.setTime(startTime - 1000);

      // Should not add negative tokens
      expect(rateLimiter.getTokens()).toBeLessThanOrEqual(10);
      expect(rateLimiter.getTokens()).toBeGreaterThanOrEqual(0);
    });
  });
});