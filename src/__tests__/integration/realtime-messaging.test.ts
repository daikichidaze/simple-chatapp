import WebSocket from 'ws';
import { Server } from 'http';
import { WebSocketChatServer } from '@/lib/websocket-server';
import { MessageRepository } from '@/lib/database';
import { ServerToClientEvents, ClientToServerEvents } from '@/types';

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

describe('Real-time Message Delivery Integration Tests', () => {
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

  const createMockUser = (userId: string, displayName: string) => ({
    userId,
    displayName
  });

  const connectUser = async (userId: string, displayName: string): Promise<WebSocket> => {
    mockGetToken.mockResolvedValue(createMockUser(userId, displayName));

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: {
          origin: 'http://localhost:3000',
          cookie: `next-auth.session-token=token_${userId}`
        }
      });

      ws.on('open', () => {
        // Join default room
        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default'
        };
        ws.send(JSON.stringify(joinMessage));
        resolve(ws);
      });

      ws.on('error', reject);

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  };

  describe('Multi-user Message Broadcasting', () => {
    it('should deliver messages to all connected users in same room', (done) => {
      const mockMessage = {
        id: '01J8R6X7ABC123',
        roomId: 'default',
        userId: 'user_1',
        displayName: 'Alice',
        text: 'Hello everyone!',
        mentions: [],
        ts: Date.now()
      };

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.createMessage.mockReturnValue(mockMessage);

      Promise.all([
        connectUser('user_1', 'Alice'),
        connectUser('user_2', 'Bob'),
        connectUser('user_3', 'Charlie')
      ]).then(([alice, bob, charlie]) => {
        let bobReceived = false;
        let charlieReceived = false;

        // Bob listens for message
        bob.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;
          if (message.type === 'message' && message.text === 'Hello everyone!') {
            expect(message.userId).toBe('user_1');
            expect(message.displayName).toBe('Alice');
            bobReceived = true;
            checkCompletion();
          }
        });

        // Charlie listens for message
        charlie.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;
          if (message.type === 'message' && message.text === 'Hello everyone!') {
            expect(message.userId).toBe('user_1');
            expect(message.displayName).toBe('Alice');
            charlieReceived = true;
            checkCompletion();
          }
        });

        // Wait for initial setup, then Alice sends message
        setTimeout(() => {
          const chatMessage: ClientToServerEvents = {
            type: 'message',
            roomId: 'default',
            text: 'Hello everyone!'
          };
          alice.send(JSON.stringify(chatMessage));
        }, 100);

        const checkCompletion = () => {
          if (bobReceived && charlieReceived) {
            alice.close();
            bob.close();
            charlie.close();
            done();
          }
        };

        setTimeout(() => {
          if (!bobReceived || !charlieReceived) {
            alice.close();
            bob.close();
            charlie.close();
            done(new Error(`Message not received by all users. Bob: ${bobReceived}, Charlie: ${charlieReceived}`));
          }
        }, 3000);
      }).catch(done);
    });

    it('should not send message back to sender', (done) => {
      const mockMessage = {
        id: '01J8R6X7ABC124',
        roomId: 'default',
        userId: 'user_1',
        displayName: 'Alice',
        text: 'Hello from Alice',
        mentions: [],
        ts: Date.now()
      };

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.createMessage.mockReturnValue(mockMessage);

      Promise.all([
        connectUser('user_1', 'Alice'),
        connectUser('user_2', 'Bob')
      ]).then(([alice, bob]) => {
        let aliceReceivedOwnMessage = false;
        let bobReceivedMessage = false;

        // Alice should not receive her own message back
        alice.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;
          if (message.type === 'message' && message.text === 'Hello from Alice') {
            aliceReceivedOwnMessage = true;
          }
        });

        // Bob should receive Alice's message
        bob.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;
          if (message.type === 'message' && message.text === 'Hello from Alice') {
            bobReceivedMessage = true;
          }
        });

        setTimeout(() => {
          const chatMessage: ClientToServerEvents = {
            type: 'message',
            roomId: 'default',
            text: 'Hello from Alice'
          };
          alice.send(JSON.stringify(chatMessage));
        }, 100);

        setTimeout(() => {
          expect(aliceReceivedOwnMessage).toBe(false);
          expect(bobReceivedMessage).toBe(true);
          alice.close();
          bob.close();
          done();
        }, 1000);
      }).catch(done);
    });
  });

  describe('Message Delivery Timing', () => {
    it('should deliver messages within 300ms as per spec', (done) => {
      const mockMessage = {
        id: '01J8R6X7ABC125',
        roomId: 'default',
        userId: 'user_1',
        displayName: 'Alice',
        text: 'Timing test message',
        mentions: [],
        ts: Date.now()
      };

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.createMessage.mockReturnValue(mockMessage);

      Promise.all([
        connectUser('user_1', 'Alice'),
        connectUser('user_2', 'Bob')
      ]).then(([alice, bob]) => {
        let sendTime: number;
        let receiveTime: number;

        bob.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;
          if (message.type === 'message' && message.text === 'Timing test message') {
            receiveTime = Date.now();
            const latency = receiveTime - sendTime;

            expect(latency).toBeLessThan(300); // Spec requirement: 100-300ms
            alice.close();
            bob.close();
            done();
          }
        });

        setTimeout(() => {
          sendTime = Date.now();
          const chatMessage: ClientToServerEvents = {
            type: 'message',
            roomId: 'default',
            text: 'Timing test message'
          };
          alice.send(JSON.stringify(chatMessage));
        }, 100);
      }).catch(done);
    });

    it('should handle rapid message succession without loss', (done) => {
      const messageCount = 10;
      const receivedMessages = new Set<string>();

      // Mock multiple messages
      let messageId = 0;
      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.createMessage.mockImplementation((roomId, userId, displayName, text) => ({
          id: `01J8R6X7ABC${String(++messageId).padStart(3, '0')}`,
          roomId,
          userId,
          displayName,
          text,
          mentions: [],
          ts: Date.now()
        }));

      Promise.all([
        connectUser('user_1', 'Alice'),
        connectUser('user_2', 'Bob')
      ]).then(([alice, bob]) => {
        bob.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;
          if (message.type === 'message' && message.text.startsWith('Rapid message ')) {
            receivedMessages.add(message.text);

            if (receivedMessages.size === messageCount) {
              // Verify all messages were received
              for (let i = 1; i <= messageCount; i++) {
                expect(receivedMessages.has(`Rapid message ${i}`)).toBe(true);
              }
              alice.close();
              bob.close();
              done();
            }
          }
        });

        setTimeout(() => {
          // Send messages rapidly
          for (let i = 1; i <= messageCount; i++) {
            const chatMessage: ClientToServerEvents = {
              type: 'message',
              roomId: 'default',
              text: `Rapid message ${i}`
            };
            alice.send(JSON.stringify(chatMessage));
          }
        }, 100);

        // Timeout if not all messages received
        setTimeout(() => {
          if (receivedMessages.size < messageCount) {
            alice.close();
            bob.close();
            done(new Error(`Only received ${receivedMessages.size}/${messageCount} messages`));
          }
        }, 3000);
      }).catch(done);
    });
  });

  describe('Presence Updates', () => {
    it('should broadcast presence updates when users join', (done) => {
      Promise.all([
        connectUser('user_1', 'Alice'),
        connectUser('user_2', 'Bob')
      ]).then(([alice, bob]) => {
        let presenceUpdateReceived = false;

        alice.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;
          if (message.type === 'presence') {
            const users = message.users;
            expect(users).toHaveLength(2);
            expect(users.some(u => u.displayName === 'Alice')).toBe(true);
            expect(users.some(u => u.displayName === 'Bob')).toBe(true);
            presenceUpdateReceived = true;
          }
        });

        setTimeout(() => {
          if (presenceUpdateReceived) {
            alice.close();
            bob.close();
            done();
          } else {
            alice.close();
            bob.close();
            done(new Error('Presence update not received'));
          }
        }, 1000);
      }).catch(done);
    });

    it('should broadcast presence updates when users leave', (done) => {
      Promise.all([
        connectUser('user_1', 'Alice'),
        connectUser('user_2', 'Bob')
      ]).then(([alice, bob]) => {
        let userLeftPresenceReceived = false;

        alice.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;
          if (message.type === 'presence') {
            const users = message.users;
            // After Bob leaves, only Alice should remain
            if (users.length === 1 && users[0].displayName === 'Alice') {
              userLeftPresenceReceived = true;
            }
          }
        });

        // Wait for initial connection, then Bob leaves
        setTimeout(() => {
          bob.close();
        }, 100);

        setTimeout(() => {
          if (userLeftPresenceReceived) {
            alice.close();
            done();
          } else {
            alice.close();
            done(new Error('Presence update for user leaving not received'));
          }
        }, 1000);
      }).catch(done);
    });
  });

  describe('Message Ordering and Consistency', () => {
    it('should maintain message order for single sender', (done) => {
      const messageCount = 5;
      const receivedMessages: string[] = [];

      let messageId = 0;
      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.createMessage.mockImplementation((roomId, userId, displayName, text) => ({
          id: `01J8R6X7ABC${String(++messageId).padStart(3, '0')}`,
          roomId,
          userId,
          displayName,
          text,
          mentions: [],
          ts: Date.now()
        }));

      Promise.all([
        connectUser('user_1', 'Alice'),
        connectUser('user_2', 'Bob')
      ]).then(([alice, bob]) => {
        bob.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;
          if (message.type === 'message' && message.text.startsWith('Ordered message ')) {
            receivedMessages.push(message.text);

            if (receivedMessages.length === messageCount) {
              // Verify order is maintained
              for (let i = 0; i < messageCount; i++) {
                expect(receivedMessages[i]).toBe(`Ordered message ${i + 1}`);
              }
              alice.close();
              bob.close();
              done();
            }
          }
        });

        setTimeout(() => {
          // Send messages in sequence with small delays
          let i = 1;
          const sendNext = () => {
            if (i <= messageCount) {
              const chatMessage: ClientToServerEvents = {
                type: 'message',
                roomId: 'default',
                text: `Ordered message ${i++}`
              };
              alice.send(JSON.stringify(chatMessage));
              setTimeout(sendNext, 50);
            }
          };
          sendNext();
        }, 100);
      }).catch(done);
    });

    it('should prevent duplicate message delivery', (done) => {
      const mockMessage = {
        id: '01J8R6X7DUPLICATE',
        roomId: 'default',
        userId: 'user_1',
        displayName: 'Alice',
        text: 'Duplicate test message',
        mentions: [],
        ts: Date.now()
      };

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.createMessage.mockReturnValue(mockMessage);

      Promise.all([
        connectUser('user_1', 'Alice'),
        connectUser('user_2', 'Bob')
      ]).then(([alice, bob]) => {
        let messageCount = 0;

        bob.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerToClientEvents;
          if (message.type === 'message' && message.text === 'Duplicate test message') {
            messageCount++;
          }
        });

        setTimeout(() => {
          // Send same message multiple times (simulating network retries)
          const chatMessage: ClientToServerEvents = {
            type: 'message',
            roomId: 'default',
            text: 'Duplicate test message'
          };

          alice.send(JSON.stringify(chatMessage));
          alice.send(JSON.stringify(chatMessage));
          alice.send(JSON.stringify(chatMessage));
        }, 100);

        setTimeout(() => {
          // Should only receive the message once per send (3 times total)
          expect(messageCount).toBe(3);
          alice.close();
          bob.close();
          done();
        }, 1000);
      }).catch(done);
    });
  });

  describe('Error Recovery', () => {
    it('should handle connection drops gracefully', (done) => {
      const mockMessage = {
        id: '01J8R6X7ABC126',
        roomId: 'default',
        userId: 'user_2',
        displayName: 'Bob',
        text: 'Recovery test message',
        mentions: [],
        ts: Date.now()
      };

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.createMessage.mockReturnValue(mockMessage);

      Promise.all([
        connectUser('user_1', 'Alice'),
        connectUser('user_2', 'Bob')
      ]).then(([alice, bob]) => {
        // Simulate Alice's connection dropping
        setTimeout(() => {
          alice.close();
        }, 100);

        // Bob sends message after Alice disconnects
        setTimeout(() => {
          const chatMessage: ClientToServerEvents = {
            type: 'message',
            roomId: 'default',
            text: 'Recovery test message'
          };
          bob.send(JSON.stringify(chatMessage));
        }, 200);

        // Verify server doesn't crash and Bob can still send messages
        setTimeout(() => {
          bob.close();
          done(); // If we reach here, server handled disconnection gracefully
        }, 500);
      }).catch(done);
    });
  });

  describe('Spec Compliance', () => {
    it('should meet acceptance criteria: 5ユーザー間で送信から300ms程度以内に相互表示', (done) => {
      const userCount = 5;
      const users = Array.from({ length: userCount }, (_, i) => ({
        userId: `user_${i + 1}`,
        displayName: `User${i + 1}`
      }));

      const mockMessage = {
        id: '01J8R6X7SPEC001',
        roomId: 'default',
        userId: 'user_1',
        displayName: 'User1',
        text: 'Spec compliance test',
        mentions: [],
        ts: Date.now()
      };

      (MessageRepository as jest.MockedClass<typeof MessageRepository>)
        .prototype.createMessage.mockReturnValue(mockMessage);

      // Connect all users
      Promise.all(
        users.map(user => connectUser(user.userId, user.displayName))
      ).then(([sender, ...receivers]) => {
        const receiveTimestamps: number[] = [];
        let sendTime: number;

        // Set up receivers
        receivers.forEach((ws, index) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data.toString()) as ServerToClientEvents;
            if (message.type === 'message' && message.text === 'Spec compliance test') {
              receiveTimestamps[index] = Date.now();

              // Check if all receivers have received the message
              if (receiveTimestamps.filter(t => t).length === receivers.length) {
                // Verify all received within 300ms
                receiveTimestamps.forEach(receiveTime => {
                  const latency = receiveTime - sendTime;
                  expect(latency).toBeLessThan(300);
                });

                // Close all connections
                [sender, ...receivers].forEach(ws => ws.close());
                done();
              }
            }
          });
        });

        // Send message after setup
        setTimeout(() => {
          sendTime = Date.now();
          const chatMessage: ClientToServerEvents = {
            type: 'message',
            roomId: 'default',
            text: 'Spec compliance test'
          };
          sender.send(JSON.stringify(chatMessage));
        }, 200);

        // Timeout safety
        setTimeout(() => {
          [sender, ...receivers].forEach(ws => ws.close());
          done(new Error('Test timed out'));
        }, 5000);
      }).catch(done);
    }, 10000); // Extended timeout for 5-user test
  });
});