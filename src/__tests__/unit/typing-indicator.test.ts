import { z } from 'zod';

/**
 * @jest-environment node
 * @group unit
 * @description タイピングインジケーター機能のユニットテスト
 */

// Zod schema tests for typing events
const TypingStartSchema = z.object({
  type: z.literal('typing_start'),
  roomId: z.string()
});

const TypingStopSchema = z.object({
  type: z.literal('typing_stop'),
  roomId: z.string()
});

const UserTypingSchema = z.object({
  type: z.literal('user_typing'),
  roomId: z.string(),
  userId: z.string(),
  displayName: z.string()
});

const UserTypingStopSchema = z.object({
  type: z.literal('user_typing_stop'),
  roomId: z.string(),
  userId: z.string()
});

describe('Typing Indicator Schemas', () => {
  describe('TypingStartSchema', () => {
    it('should validate correct typing_start message', () => {
      const validMessage = {
        type: 'typing_start',
        roomId: 'default'
      };

      expect(() => TypingStartSchema.parse(validMessage)).not.toThrow();
      expect(TypingStartSchema.parse(validMessage)).toEqual(validMessage);
    });

    it('should reject invalid typing_start message', () => {
      const invalidMessage = {
        type: 'typing_start'
        // missing roomId
      };

      expect(() => TypingStartSchema.parse(invalidMessage)).toThrow();
    });

    it('should reject message with wrong type', () => {
      const wrongTypeMessage = {
        type: 'wrong_type',
        roomId: 'default'
      };

      expect(() => TypingStartSchema.parse(wrongTypeMessage)).toThrow();
    });
  });

  describe('TypingStopSchema', () => {
    it('should validate correct typing_stop message', () => {
      const validMessage = {
        type: 'typing_stop',
        roomId: 'default'
      };

      expect(() => TypingStopSchema.parse(validMessage)).not.toThrow();
      expect(TypingStopSchema.parse(validMessage)).toEqual(validMessage);
    });

    it('should reject invalid typing_stop message', () => {
      const invalidMessage = {
        type: 'typing_stop'
        // missing roomId
      };

      expect(() => TypingStopSchema.parse(invalidMessage)).toThrow();
    });
  });

  describe('UserTypingSchema', () => {
    it('should validate correct user_typing message', () => {
      const validMessage = {
        type: 'user_typing',
        roomId: 'default',
        userId: 'user123',
        displayName: 'John Doe'
      };

      expect(() => UserTypingSchema.parse(validMessage)).not.toThrow();
      expect(UserTypingSchema.parse(validMessage)).toEqual(validMessage);
    });

    it('should reject message missing required fields', () => {
      const invalidMessage = {
        type: 'user_typing',
        roomId: 'default'
        // missing userId and displayName
      };

      expect(() => UserTypingSchema.parse(invalidMessage)).toThrow();
    });
  });

  describe('UserTypingStopSchema', () => {
    it('should validate correct user_typing_stop message', () => {
      const validMessage = {
        type: 'user_typing_stop',
        roomId: 'default',
        userId: 'user123'
      };

      expect(() => UserTypingStopSchema.parse(validMessage)).not.toThrow();
      expect(UserTypingStopSchema.parse(validMessage)).toEqual(validMessage);
    });

    it('should reject message missing userId', () => {
      const invalidMessage = {
        type: 'user_typing_stop',
        roomId: 'default'
        // missing userId
      };

      expect(() => UserTypingStopSchema.parse(invalidMessage)).toThrow();
    });
  });
});

// Mock typing state management tests
class MockTypingManager {
  private typingUsers = new Map<string, Map<string, NodeJS.Timeout>>();

  startTyping(userId: string, roomId: string, displayName: string): boolean {
    if (!this.typingUsers.has(roomId)) {
      this.typingUsers.set(roomId, new Map());
    }

    const roomTyping = this.typingUsers.get(roomId)!;

    // Clear existing timeout
    const existingTimeout = roomTyping.get(userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.stopTyping(userId, roomId);
    }, 3000);

    roomTyping.set(userId, timeout);
    return !existingTimeout; // Return true if this is a new typing session
  }

  stopTyping(userId: string, roomId: string): boolean {
    const roomTyping = this.typingUsers.get(roomId);
    if (!roomTyping) return false;

    const timeout = roomTyping.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      roomTyping.delete(userId);

      if (roomTyping.size === 0) {
        this.typingUsers.delete(roomId);
      }
      return true;
    }
    return false;
  }

  getTypingUsers(roomId: string): string[] {
    const roomTyping = this.typingUsers.get(roomId);
    return roomTyping ? Array.from(roomTyping.keys()) : [];
  }

  cleanup(): void {
    this.typingUsers.forEach(roomTyping => {
      roomTyping.forEach(timeout => clearTimeout(timeout));
    });
    this.typingUsers.clear();
  }
}

describe('Typing State Management', () => {
  let typingManager: MockTypingManager;

  beforeEach(() => {
    typingManager = new MockTypingManager();
  });

  afterEach(() => {
    typingManager.cleanup();
  });

  it('should start typing for a user', () => {
    const isNew = typingManager.startTyping('user1', 'room1', 'User One');
    expect(isNew).toBe(true);
    expect(typingManager.getTypingUsers('room1')).toContain('user1');
  });

  it('should not duplicate typing state', () => {
    typingManager.startTyping('user1', 'room1', 'User One');
    const isNew = typingManager.startTyping('user1', 'room1', 'User One');
    expect(isNew).toBe(false);
    expect(typingManager.getTypingUsers('room1')).toEqual(['user1']);
  });

  it('should stop typing for a user', () => {
    typingManager.startTyping('user1', 'room1', 'User One');
    const wasStopped = typingManager.stopTyping('user1', 'room1');
    expect(wasStopped).toBe(true);
    expect(typingManager.getTypingUsers('room1')).not.toContain('user1');
  });

  it('should handle multiple users typing', () => {
    typingManager.startTyping('user1', 'room1', 'User One');
    typingManager.startTyping('user2', 'room1', 'User Two');

    const typingUsers = typingManager.getTypingUsers('room1');
    expect(typingUsers).toHaveLength(2);
    expect(typingUsers).toContain('user1');
    expect(typingUsers).toContain('user2');
  });

  it('should auto-stop typing after timeout', (done) => {
    typingManager.startTyping('user1', 'room1', 'User One');
    expect(typingManager.getTypingUsers('room1')).toContain('user1');

    // Check that typing stops after timeout
    setTimeout(() => {
      expect(typingManager.getTypingUsers('room1')).not.toContain('user1');
      done();
    }, 3100); // Slightly longer than 3000ms timeout
  });

  it('should handle typing in different rooms', () => {
    typingManager.startTyping('user1', 'room1', 'User One');
    typingManager.startTyping('user1', 'room2', 'User One');

    expect(typingManager.getTypingUsers('room1')).toContain('user1');
    expect(typingManager.getTypingUsers('room2')).toContain('user1');
  });
});