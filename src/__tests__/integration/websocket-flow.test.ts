import WebSocket from 'ws';
import { Server } from 'http';
import { WebSocketChatServer } from '@/lib/websocket-server';
import { MessageRepository } from '@/lib/database';
import { ServerToClientEvents, ClientToServerEvents } from '@/types';

// Mock next-auth/jwt for testing
jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn()
}));

// Mock database
jest.mock('@/lib/database', () => ({
  MessageRepository: jest.fn().mockImplementation(() => ({
    createMessage: jest.fn(),
    getRecentMessages: jest.fn().mockReturnValue([]),
    getMessagesSince: jest.fn().mockReturnValue([])
  })),
  startCleanupJob: jest.fn()
}));

const mockGetToken = require('next-auth/jwt').getToken;

describe('WebSocket Connection Flow Integration Tests', () => {
  let server: Server;
  let wsServer: WebSocketChatServer;
  let port: number;

  beforeAll(() => {
    port = 8080 + Math.floor(Math.random() * 1000);
    server = new Server();
    wsServer = new WebSocketChatServer(server);
    server.listen(port);
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Connection Establishment', () => {
    it('should establish WebSocket connection with valid authentication', (done) => {
      // Mock valid token
      mockGetToken.mockResolvedValue({
        userId: 'user_123',
        displayName: 'Alice'
      });

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'next-auth.session-token=valid_token'
        }
      });

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should receive hello message upon connection', (done) => {
      mockGetToken.mockResolvedValue({
        userId: 'user_123',
        displayName: 'Alice'
      });

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'next-auth.session-token=valid_token'
        }
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerToClientEvents;

        if (message.type === 'hello') {
          expect(message.selfId).toBe('user_123');
          expect(Array.isArray(message.users)).toBe(true);
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should reject connection without authentication', (done) => {
      mockGetToken.mockResolvedValue(null);

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000'
        }
      });

      ws.on('error', (error) => {
        expect(error.message).toContain('401');
        done();
      });

      ws.on('open', () => {
        done(new Error('Connection should have been rejected'));
      });
    });

    it('should reject connection with invalid origin', (done) => {
      mockGetToken.mockResolvedValue({
        userId: 'user_123',
        displayName: 'Alice'
      });

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://evil.com',
          cookie: 'next-auth.session-token=valid_token'
        }
      });

      ws.on('error', (error) => {
        expect(error.message).toContain('403');
        done();
      });

      ws.on('open', () => {
        done(new Error('Connection should have been rejected'));
      });
    });
  });

  describe('Room Join Flow', () => {
    it('should handle room join and return history', (done) => {
      mockGetToken.mockResolvedValue({
        userId: 'user_123',
        displayName: 'Alice'
      });

      const mockMessages = [
        {
          id: '01J8R6X7ABC123',
          roomId: 'default',
          userId: 'user_456',
          displayName: 'Bob',
          text: 'Hello world',
          ts: Date.now() - 1000
        }
      ];

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getRecentMessages.mockReturnValue(mockMessages);

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'next-auth.session-token=valid_token'
        }
      });

      ws.on('open', () => {
        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default'
        };
        ws.send(JSON.stringify(joinMessage));
      });

      let receivedHello = false;
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerToClientEvents;

        if (message.type === 'hello') {
          receivedHello = true;
        } else if (message.type === 'history' && receivedHello) {
          expect(message.roomId).toBe('default');
          expect(message.messages).toHaveLength(1);
          expect(message.messages[0].text).toBe('Hello world');
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should handle differential sync with sinceTs', (done) => {
      mockGetToken.mockResolvedValue({
        userId: 'user_123',
        displayName: 'Alice'
      });

      const sinceTs = Date.now() - 5000;
      const mockRecentMessages = [
        {
          id: '01J8R6X7ABC124',
          roomId: 'default',
          userId: 'user_456',
          displayName: 'Bob',
          text: 'Recent message',
          ts: Date.now() - 1000
        }
      ];

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getMessagesSince.mockReturnValue(mockRecentMessages);

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'next-auth.session-token=valid_token'
        }
      });

      ws.on('open', () => {
        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default',
          sinceTs
        };
        ws.send(JSON.stringify(joinMessage));
      });

      let receivedHello = false;
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerToClientEvents;

        if (message.type === 'hello') {
          receivedHello = true;
        } else if (message.type === 'history' && receivedHello) {
          expect(message.roomId).toBe('default');
          expect(message.messages).toHaveLength(1);
          expect(message.messages[0].text).toBe('Recent message');

          // Verify that getMessagesSince was called with correct timestamp
          expect(MessageRepository.prototype.getMessagesSince)
            .toHaveBeenCalledWith('default', sinceTs);

          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Message Flow', () => {
    it('should handle message sending and broadcasting', (done) => {
      mockGetToken.mockResolvedValue({
        userId: 'user_123',
        displayName: 'Alice'
      });

      const mockCreatedMessage = {
        id: '01J8R6X7ABC125',
        roomId: 'default',
        userId: 'user_123',
        displayName: 'Alice',
        text: 'Hello world',
        mentions: [],
        ts: Date.now()
      };

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.createMessage.mockReturnValue(mockCreatedMessage);

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'next-auth.session-token=valid_token'
        }
      });

      ws.on('open', () => {
        // First join the room
        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default'
        };
        ws.send(JSON.stringify(joinMessage));

        // Then send a message
        setTimeout(() => {
          const chatMessage: ClientToServerEvents = {
            type: 'message',
            roomId: 'default',
            text: 'Hello world'
          };
          ws.send(JSON.stringify(chatMessage));
        }, 100);
      });

      let receivedJoin = false;
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerToClientEvents;

        if (message.type === 'hello') {
          receivedJoin = true;
        } else if (message.type === 'message' && receivedJoin) {
          expect(message.id).toBe('01J8R6X7ABC125');
          expect(message.userId).toBe('user_123');
          expect(message.displayName).toBe('Alice');
          expect(message.text).toBe('Hello world');
          expect(message.ts).toBeDefined();
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should handle rate limiting', (done) => {
      mockGetToken.mockResolvedValue({
        userId: 'user_123',
        displayName: 'Alice'
      });

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'next-auth.session-token=valid_token'
        }
      });

      ws.on('open', () => {
        // Join room first
        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default'
        };
        ws.send(JSON.stringify(joinMessage));

        // Send many messages rapidly to trigger rate limiting
        setTimeout(() => {
          for (let i = 0; i < 15; i++) {
            const message: ClientToServerEvents = {
              type: 'message',
              roomId: 'default',
              text: `Message ${i}`
            };
            ws.send(JSON.stringify(message));
          }
        }, 100);
      });

      let errorReceived = false;
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerToClientEvents;

        if (message.type === 'error' && message.code === 'RATE_LIMIT') {
          expect(message.msg).toContain('Too many messages');
          errorReceived = true;
          ws.close();
          done();
        }
      });

      // Timeout if rate limiting doesn't occur
      setTimeout(() => {
        if (!errorReceived) {
          ws.close();
          done(new Error('Rate limiting should have occurred'));
        }
      }, 2000);

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Display Name Management', () => {
    it('should handle display name changes', (done) => {
      mockGetToken.mockResolvedValue({
        userId: 'user_123',
        displayName: 'Alice'
      });

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'next-auth.session-token=valid_token'
        }
      });

      ws.on('open', () => {
        // Join room first
        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default'
        };
        ws.send(JSON.stringify(joinMessage));

        // Change display name
        setTimeout(() => {
          const setNameMessage: ClientToServerEvents = {
            type: 'set_name',
            displayName: 'Alice Updated'
          };
          ws.send(JSON.stringify(setNameMessage));
        }, 100);
      });

      let nameChangeReceived = false;
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerToClientEvents;

        if (message.type === 'presence' && !nameChangeReceived) {
          const user = message.users.find(u => u.id === 'user_123');
          if (user && user.displayName === 'Alice Updated') {
            nameChangeReceived = true;
            ws.close();
            done();
          }
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Connection Cleanup', () => {
    it('should handle clean disconnection', (done) => {
      mockGetToken.mockResolvedValue({
        userId: 'user_123',
        displayName: 'Alice'
      });

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'next-auth.session-token=valid_token'
        }
      });

      ws.on('open', () => {
        // Join room
        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default'
        };
        ws.send(JSON.stringify(joinMessage));

        // Close connection after a short delay
        setTimeout(() => {
          ws.close();
        }, 100);
      });

      ws.on('close', () => {
        // Connection should close cleanly
        expect(ws.readyState).toBe(WebSocket.CLOSED);
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should handle abrupt disconnection', (done) => {
      mockGetToken.mockResolvedValue({
        userId: 'user_123',
        displayName: 'Alice'
      });

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'next-auth.session-token=valid_token'
        }
      });

      ws.on('open', () => {
        // Simulate abrupt disconnection
        (ws as any)._socket.destroy();
      });

      ws.on('close', () => {
        expect(ws.readyState).toBe(WebSocket.CLOSED);
        done();
      });

      ws.on('error', () => {
        // Error expected for abrupt disconnection
        setTimeout(() => {
          expect(ws.readyState).toBe(WebSocket.CLOSED);
          done();
        }, 100);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON messages', (done) => {
      mockGetToken.mockResolvedValue({
        userId: 'user_123',
        displayName: 'Alice'
      });

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'next-auth.session-token=valid_token'
        }
      });

      ws.on('open', () => {
        // Send malformed JSON
        ws.send('invalid json');
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerToClientEvents;

        if (message.type === 'error' && message.code === 'BAD_REQUEST') {
          expect(message.msg).toContain('Invalid message');
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should handle invalid message types', (done) => {
      mockGetToken.mockResolvedValue({
        userId: 'user_123',
        displayName: 'Alice'
      });

      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'next-auth.session-token=valid_token'
        }
      });

      ws.on('open', () => {
        // Send invalid message type
        const invalidMessage = {
          type: 'invalid_type',
          data: 'test'
        };
        ws.send(JSON.stringify(invalidMessage));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerToClientEvents;

        if (message.type === 'error' && message.code === 'BAD_REQUEST') {
          expect(message.msg).toContain('Unknown message type');
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });
});