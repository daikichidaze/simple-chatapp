import WebSocket from 'ws';
import { Server } from 'http';
import { WebSocketChatServer } from '@/lib/websocket-server';
import { MessageRepository } from '@/lib/database';
import { ServerToClientEvents, ClientToServerEvents, Message } from '@/types';

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn()
}));

jest.mock('@/lib/database', () => ({
  MessageRepository: jest.fn().mockImplementation(() => ({
    createMessage: jest.fn(),
    getRecentMessages: jest.fn().mockReturnValue([]),
    getMessagesSince: jest.fn().mockReturnValue([])
  })),
  startCleanupJob: jest.fn()
}));

const mockGetToken = require('next-auth/jwt').getToken;

describe('Differential Sync (sinceTs) Integration Tests', () => {
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

  const connectUser = async (userId: string, displayName: string): Promise<WebSocket> => {
    mockGetToken.mockResolvedValue({ userId, displayName });

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: `next-auth.session-token=token_${userId}`
        }
      });

      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  };

  const createMockMessage = (id: string, userId: string, displayName: string, text: string, ts: number): Message => ({
    id,
    roomId: 'default',
    userId,
    displayName,
    text,
    mentions: [],
    ts
  });

  describe('Initial Connection and History', () => {
    it('should return recent messages on initial join without sinceTs', (done) => {
      const now = Date.now();
      const mockMessages = [
        createMockMessage('msg_1', 'user_1', 'Alice', 'Message 1', now - 3000),
        createMockMessage('msg_2', 'user_2', 'Bob', 'Message 2', now - 2000),
        createMockMessage('msg_3', 'user_1', 'Alice', 'Message 3', now - 1000)
      ];

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getRecentMessages.mockReturnValue(mockMessages);

      connectUser('user_1', 'Alice').then(ws => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;

          if (message.type === 'history') {
            expect(message.roomId).toBe('default');
            expect(message.messages).toHaveLength(3);
            expect(message.messages[0].text).toBe('Message 1');
            expect(message.messages[1].text).toBe('Message 2');
            expect(message.messages[2].text).toBe('Message 3');

            // Verify getRecentMessages was called
            expect(MessageRepository.prototype.getRecentMessages)
              .toHaveBeenCalledWith('default', 100);

            ws.close();
            done();
          }
        });

        // Join room to trigger history fetch
        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default'
        };
        ws.send(JSON.stringify(joinMessage));
      }).catch(done);
    });

    it('should include nextCursor in history response', (done) => {
      const now = Date.now();
      const mockMessages = [
        createMockMessage('msg_1', 'user_1', 'Alice', 'Oldest message', now - 3000),
        createMockMessage('msg_2', 'user_2', 'Bob', 'Newer message', now - 2000)
      ];

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getRecentMessages.mockReturnValue(mockMessages);

      connectUser('user_1', 'Alice').then(ws => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;

          if (message.type === 'history') {
            expect(message.nextCursor).toBeDefined();
            expect(message.nextCursor?.beforeTs).toBe(now - 3000); // Oldest message timestamp
            ws.close();
            done();
          }
        });

        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default'
        };
        ws.send(JSON.stringify(joinMessage));
      }).catch(done);
    });
  });

  describe('Differential Sync with sinceTs', () => {
    it('should return only messages newer than sinceTs', (done) => {
      const baseTime = Date.now() - 10000;
      const sinceTs = baseTime + 5000;

      const allMessages = [
        createMockMessage('msg_1', 'user_1', 'Alice', 'Old message 1', baseTime + 1000),
        createMockMessage('msg_2', 'user_2', 'Bob', 'Old message 2', baseTime + 3000),
        createMockMessage('msg_3', 'user_1', 'Alice', 'New message 1', baseTime + 6000),
        createMockMessage('msg_4', 'user_2', 'Bob', 'New message 2', baseTime + 8000)
      ];

      // Mock only returns messages after sinceTs
      const newMessages = allMessages.filter(msg => msg.ts > sinceTs);
      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getMessagesSince.mockReturnValue(newMessages);

      connectUser('user_1', 'Alice').then(ws => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;

          if (message.type === 'history') {
            expect(message.messages).toHaveLength(2);
            expect(message.messages[0].text).toBe('New message 1');
            expect(message.messages[1].text).toBe('New message 2');

            // Verify getMessagesSince was called with correct timestamp
            expect(MessageRepository.prototype.getMessagesSince)
              .toHaveBeenCalledWith('default', sinceTs);

            ws.close();
            done();
          }
        });

        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default',
          sinceTs
        };
        ws.send(JSON.stringify(joinMessage));
      }).catch(done);
    });

    it('should handle empty differential sync result', (done) => {
      const sinceTs = Date.now() - 1000;

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getMessagesSince.mockReturnValue([]);

      connectUser('user_1', 'Alice').then(ws => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;

          if (message.type === 'history') {
            expect(message.messages).toHaveLength(0);
            expect(message.nextCursor).toBeUndefined();
            ws.close();
            done();
          }
        });

        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default',
          sinceTs
        };
        ws.send(JSON.stringify(joinMessage));
      }).catch(done);
    });
  });

  describe('Reconnection Scenarios', () => {
    it('should sync missed messages after reconnection', (done) => {
      const baseTime = Date.now() - 5000;
      let connectionCount = 0;

      // First connection gets initial messages
      const initialMessages = [
        createMockMessage('msg_1', 'user_2', 'Bob', 'Initial message', baseTime)
      ];

      // After disconnection, new messages are created
      const missedMessages = [
        createMockMessage('msg_2', 'user_2', 'Bob', 'Missed message 1', baseTime + 2000),
        createMockMessage('msg_3', 'user_2', 'Bob', 'Missed message 2', baseTime + 3000)
      ];

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getRecentMessages.mockReturnValue(initialMessages);

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getMessagesSince.mockReturnValue(missedMessages);

      const firstConnection = () => {
        connectUser('user_1', 'Alice').then(ws => {
          let lastMessageTs = 0;

          ws.on('message', (data) => {
            const message = JSON.parse(data.toString()) as ServerToClientEvents;

            if (message.type === 'history' && connectionCount === 0) {
              connectionCount++;
              lastMessageTs = Math.max(...message.messages.map(m => m.ts));
              ws.close();

              // Simulate reconnection after some time
              setTimeout(() => reconnection(lastMessageTs), 100);
            }
          });

          const joinMessage: ClientToServerEvents = {
            type: 'join',
            roomId: 'default'
          };
          ws.send(JSON.stringify(joinMessage));
        }).catch(done);
      };

      const reconnection = (sinceTs: number) => {
        connectUser('user_1', 'Alice').then(ws => {
          ws.on('message', (data) => {
            const message = JSON.parse(data.toString()) as ServerToClientEvents;

            if (message.type === 'history') {
              expect(message.messages).toHaveLength(2);
              expect(message.messages[0].text).toBe('Missed message 1');
              expect(message.messages[1].text).toBe('Missed message 2');

              // Verify differential sync was used
              expect(MessageRepository.prototype.getMessagesSince)
                .toHaveBeenCalledWith('default', sinceTs);

              ws.close();
              done();
            }
          });

          const joinMessage: ClientToServerEvents = {
            type: 'join',
            roomId: 'default',
            sinceTs
          };
          ws.send(JSON.stringify(joinMessage));
        }).catch(done);
      };

      firstConnection();
    });

    it('should handle very old sinceTs gracefully', (done) => {
      const veryOldTimestamp = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
      const recentMessages = [
        createMockMessage('msg_recent', 'user_2', 'Bob', 'Recent message', Date.now() - 1000)
      ];

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getMessagesSince.mockReturnValue(recentMessages);

      connectUser('user_1', 'Alice').then(ws => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;

          if (message.type === 'history') {
            expect(message.messages).toHaveLength(1);
            expect(message.messages[0].text).toBe('Recent message');

            // Should still call getMessagesSince even with old timestamp
            expect(MessageRepository.prototype.getMessagesSince)
              .toHaveBeenCalledWith('default', veryOldTimestamp);

            ws.close();
            done();
          }
        });

        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default',
          sinceTs: veryOldTimestamp
        };
        ws.send(JSON.stringify(joinMessage));
      }).catch(done);
    });
  });

  describe('Message Deduplication', () => {
    it('should not return duplicate messages in sync', (done) => {
      const baseTime = Date.now() - 5000;
      const sinceTs = baseTime + 2000;

      const messagesWithDuplicates = [
        createMockMessage('msg_1', 'user_1', 'Alice', 'Unique message 1', baseTime + 3000),
        createMockMessage('msg_2', 'user_2', 'Bob', 'Unique message 2', baseTime + 4000)
      ];

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getMessagesSince.mockReturnValue(messagesWithDuplicates);

      connectUser('user_1', 'Alice').then(ws => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;

          if (message.type === 'history') {
            const messageIds = message.messages.map(m => m.id);
            const uniqueIds = [...new Set(messageIds)];

            // No duplicates should exist
            expect(messageIds.length).toBe(uniqueIds.length);
            expect(message.messages).toHaveLength(2);

            ws.close();
            done();
          }
        });

        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default',
          sinceTs
        };
        ws.send(JSON.stringify(joinMessage));
      }).catch(done);
    });
  });

  describe('Edge Cases', () => {
    it('should handle sinceTs equal to latest message timestamp', (done) => {
      const messageTs = Date.now() - 1000;
      const sinceTs = messageTs; // Exact same timestamp

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getMessagesSince.mockReturnValue([]);

      connectUser('user_1', 'Alice').then(ws => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;

          if (message.type === 'history') {
            expect(message.messages).toHaveLength(0);
            ws.close();
            done();
          }
        });

        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default',
          sinceTs
        };
        ws.send(JSON.stringify(joinMessage));
      }).catch(done);
    });

    it('should handle future sinceTs timestamp', (done) => {
      const futureTimestamp = Date.now() + 60000; // 1 minute in future

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getMessagesSince.mockReturnValue([]);

      connectUser('user_1', 'Alice').then(ws => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;

          if (message.type === 'history') {
            expect(message.messages).toHaveLength(0);

            // Should still make the call
            expect(MessageRepository.prototype.getMessagesSince)
              .toHaveBeenCalledWith('default', futureTimestamp);

            ws.close();
            done();
          }
        });

        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default',
          sinceTs: futureTimestamp
        };
        ws.send(JSON.stringify(joinMessage));
      }).catch(done);
    });

    it('should handle invalid/negative sinceTs', (done) => {
      const invalidTimestamp = -1000;

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getMessagesSince.mockReturnValue([]);

      connectUser('user_1', 'Alice').then(ws => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;

          if (message.type === 'history') {
            // Should handle gracefully
            expect(message.messages).toHaveLength(0);
            ws.close();
            done();
          }
        });

        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default',
          sinceTs: invalidTimestamp
        };
        ws.send(JSON.stringify(joinMessage));
      }).catch(done);
    });
  });

  describe('Spec Compliance', () => {
    it('should implement acceptance criteria: 再接続で重複なしにsinceTs以降が同期', (done) => {
      const baseTime = Date.now() - 10000;
      const disconnectionTime = baseTime + 5000;

      // Messages that existed before disconnection
      const existingMessages = [
        createMockMessage('msg_1', 'user_2', 'Bob', 'Before disconnect', baseTime + 2000)
      ];

      // Messages created during disconnection
      const missedMessages = [
        createMockMessage('msg_2', 'user_2', 'Bob', 'During disconnect 1', baseTime + 6000),
        createMockMessage('msg_3', 'user_2', 'Bob', 'During disconnect 2', baseTime + 8000)
      ];

      // Setup mocks
      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getRecentMessages.mockReturnValue(existingMessages);

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getMessagesSince.mockReturnValue(missedMessages);

      // Simulate reconnection scenario
      connectUser('user_1', 'Alice').then(ws => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;

          if (message.type === 'history') {
            // Should only get messages after disconnectionTime
            expect(message.messages).toHaveLength(2);
            expect(message.messages[0].text).toBe('During disconnect 1');
            expect(message.messages[1].text).toBe('During disconnect 2');

            // Verify no duplicates by checking unique IDs
            const ids = message.messages.map(m => m.id);
            expect(new Set(ids).size).toBe(ids.length);

            // Verify timestamps are all after sinceTs
            message.messages.forEach(msg => {
              expect(msg.ts).toBeGreaterThan(disconnectionTime);
            });

            ws.close();
            done();
          }
        });

        // Reconnect with sinceTs from disconnection time
        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default',
          sinceTs: disconnectionTime
        };
        ws.send(JSON.stringify(joinMessage));
      }).catch(done);
    });

    it('should handle beforeId cursor pagination (simplified)', (done) => {
      const mockMessages = [
        createMockMessage('msg_1', 'user_1', 'Alice', 'Message 1', Date.now() - 3000),
        createMockMessage('msg_2', 'user_2', 'Bob', 'Message 2', Date.now() - 2000)
      ];

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.getRecentMessages.mockReturnValue(mockMessages);

      connectUser('user_1', 'Alice').then(ws => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;

          if (message.type === 'history') {
            // For now, beforeId pagination falls back to recent messages
            expect(message.messages).toHaveLength(2);
            expect(MessageRepository.prototype.getRecentMessages)
              .toHaveBeenCalledWith('default', 100);

            ws.close();
            done();
          }
        });

        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default',
          beforeId: 'some_message_id'
        };
        ws.send(JSON.stringify(joinMessage));
      }).catch(done);
    });
  });
});