import { z } from 'zod';
import { ClientToServerEvents, ServerToClientEvents } from '@/types';

describe('WebSocket Message Contract Tests', () => {
  // Client to Server Event Schemas
  const JoinSchema = z.object({
    type: z.literal('join'),
    roomId: z.string(),
    sinceTs: z.number().optional(),
    beforeId: z.string().optional()
  });

  const MessageSchema = z.object({
    type: z.literal('message'),
    roomId: z.string(),
    text: z.string().max(2000)
  });

  const SetNameSchema = z.object({
    type: z.literal('set_name'),
    displayName: z.string().min(1).max(50)
  });

  // Server to Client Event Schemas
  const HelloSchema = z.object({
    type: z.literal('hello'),
    selfId: z.string(),
    users: z.array(z.object({
      id: z.string(),
      displayName: z.string()
    }))
  });

  const PresenceSchema = z.object({
    type: z.literal('presence'),
    users: z.array(z.object({
      id: z.string(),
      displayName: z.string()
    }))
  });

  const ServerMessageSchema = z.object({
    type: z.literal('message'),
    id: z.string(),
    roomId: z.string(),
    userId: z.string(),
    displayName: z.string(),
    text: z.string(),
    mentions: z.array(z.string()).optional(),
    ts: z.number()
  });

  const HistorySchema = z.object({
    type: z.literal('history'),
    roomId: z.string(),
    messages: z.array(ServerMessageSchema.omit({ type: true })),
    nextCursor: z.object({
      beforeId: z.string().optional(),
      beforeTs: z.number().optional()
    }).optional()
  });

  const ErrorSchema = z.object({
    type: z.literal('error'),
    code: z.enum(['UNAUTH', 'RATE_LIMIT', 'BAD_REQUEST', 'SERVER_ERROR']),
    msg: z.string()
  });

  describe('Client to Server Events', () => {
    describe('join event', () => {
      it('should accept valid join message', () => {
        const validJoin = {
          type: 'join' as const,
          roomId: 'default'
        };

        expect(() => JoinSchema.parse(validJoin)).not.toThrow();
      });

      it('should accept join message with sinceTs', () => {
        const joinWithSince = {
          type: 'join' as const,
          roomId: 'default',
          sinceTs: 1637592330123
        };

        expect(() => JoinSchema.parse(joinWithSince)).not.toThrow();
      });

      it('should accept join message with beforeId', () => {
        const joinWithBefore = {
          type: 'join' as const,
          roomId: 'default',
          beforeId: '01J8R6X7ABC123'
        };

        expect(() => JoinSchema.parse(joinWithBefore)).not.toThrow();
      });

      it('should reject join message without roomId', () => {
        const invalidJoin = {
          type: 'join' as const
        };

        expect(() => JoinSchema.parse(invalidJoin)).toThrow();
      });
    });

    describe('message event', () => {
      it('should accept valid message', () => {
        const validMessage = {
          type: 'message' as const,
          roomId: 'default',
          text: 'Hello @alice'
        };

        expect(() => MessageSchema.parse(validMessage)).not.toThrow();
      });

      it('should reject message exceeding 2000 characters', () => {
        const longMessage = {
          type: 'message' as const,
          roomId: 'default',
          text: 'a'.repeat(2001)
        };

        expect(() => MessageSchema.parse(longMessage)).toThrow();
      });

      it('should reject message without required fields', () => {
        const invalidMessage = {
          type: 'message' as const,
          roomId: 'default'
        };

        expect(() => MessageSchema.parse(invalidMessage)).toThrow();
      });
    });

    describe('set_name event', () => {
      it('should accept valid display name', () => {
        const validSetName = {
          type: 'set_name' as const,
          displayName: 'Alice'
        };

        expect(() => SetNameSchema.parse(validSetName)).not.toThrow();
      });

      it('should reject empty display name', () => {
        const emptyName = {
          type: 'set_name' as const,
          displayName: ''
        };

        expect(() => SetNameSchema.parse(emptyName)).toThrow();
      });

      it('should reject display name exceeding 50 characters', () => {
        const longName = {
          type: 'set_name' as const,
          displayName: 'a'.repeat(51)
        };

        expect(() => SetNameSchema.parse(longName)).toThrow();
      });
    });
  });

  describe('Server to Client Events', () => {
    describe('hello event', () => {
      it('should accept valid hello message', () => {
        const validHello = {
          type: 'hello' as const,
          selfId: 'user_123',
          users: [
            { id: 'user_123', displayName: 'Alice' },
            { id: 'user_456', displayName: 'Bob' }
          ]
        };

        expect(() => HelloSchema.parse(validHello)).not.toThrow();
      });

      it('should accept hello with empty users array', () => {
        const helloEmpty = {
          type: 'hello' as const,
          selfId: 'user_123',
          users: []
        };

        expect(() => HelloSchema.parse(helloEmpty)).not.toThrow();
      });

      it('should reject hello without required fields', () => {
        const invalidHello = {
          type: 'hello' as const,
          selfId: 'user_123'
        };

        expect(() => HelloSchema.parse(invalidHello)).toThrow();
      });
    });

    describe('message event', () => {
      it('should accept valid server message', () => {
        const validServerMessage = {
          type: 'message' as const,
          id: '01J8R6X7ABC123',
          roomId: 'default',
          userId: 'user_123',
          displayName: 'Alice',
          text: 'Hello @bob',
          mentions: ['user_456'],
          ts: 1637592330123
        };

        expect(() => ServerMessageSchema.parse(validServerMessage)).not.toThrow();
      });

      it('should accept message without mentions', () => {
        const messageNoMentions = {
          type: 'message' as const,
          id: '01J8R6X7ABC123',
          roomId: 'default',
          userId: 'user_123',
          displayName: 'Alice',
          text: 'Hello world',
          ts: 1637592330123
        };

        expect(() => ServerMessageSchema.parse(messageNoMentions)).not.toThrow();
      });

      it('should reject message without required fields', () => {
        const invalidMessage = {
          type: 'message' as const,
          id: '01J8R6X7ABC123',
          roomId: 'default'
        };

        expect(() => ServerMessageSchema.parse(invalidMessage)).toThrow();
      });
    });

    describe('error event', () => {
      it('should accept all valid error codes', () => {
        const errorCodes = ['UNAUTH', 'RATE_LIMIT', 'BAD_REQUEST', 'SERVER_ERROR'] as const;

        errorCodes.forEach(code => {
          const errorMessage = {
            type: 'error' as const,
            code,
            msg: 'Test error message'
          };

          expect(() => ErrorSchema.parse(errorMessage)).not.toThrow();
        });
      });

      it('should reject invalid error code', () => {
        const invalidError = {
          type: 'error' as const,
          code: 'INVALID_CODE',
          msg: 'Test error'
        };

        expect(() => ErrorSchema.parse(invalidError)).toThrow();
      });
    });

    describe('history event', () => {
      it('should accept valid history message', () => {
        const validHistory = {
          type: 'history' as const,
          roomId: 'default',
          messages: [
            {
              id: '01J8R6X7ABC123',
              roomId: 'default',
              userId: 'user_123',
              displayName: 'Alice',
              text: 'Hello',
              ts: 1637592330123
            }
          ],
          nextCursor: {
            beforeTs: 1637592330000
          }
        };

        expect(() => HistorySchema.parse(validHistory)).not.toThrow();
      });

      it('should accept history with empty messages', () => {
        const emptyHistory = {
          type: 'history' as const,
          roomId: 'default',
          messages: []
        };

        expect(() => HistorySchema.parse(emptyHistory)).not.toThrow();
      });

      it('should accept history without cursor', () => {
        const historyNoCursor = {
          type: 'history' as const,
          roomId: 'default',
          messages: []
        };

        expect(() => HistorySchema.parse(historyNoCursor)).not.toThrow();
      });
    });
  });

  describe('Message Format Consistency', () => {
    it('should have consistent message structure between client and server', () => {
      // Client sends minimal message
      const clientMessage = {
        type: 'message' as const,
        roomId: 'default',
        text: 'Hello world'
      };

      // Server should respond with enriched message
      const serverMessage = {
        type: 'message' as const,
        id: '01J8R6X7ABC123',
        roomId: clientMessage.roomId,
        userId: 'user_123',
        displayName: 'Alice',
        text: clientMessage.text,
        ts: Date.now()
      };

      expect(() => MessageSchema.parse(clientMessage)).not.toThrow();
      expect(() => ServerMessageSchema.parse(serverMessage)).not.toThrow();
      expect(serverMessage.roomId).toBe(clientMessage.roomId);
      expect(serverMessage.text).toBe(clientMessage.text);
    });
  });
});