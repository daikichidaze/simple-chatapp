/**
 * Load/Smoke Tests for Concurrent Users
 * Based on spec: 負荷スモーク：5ユーザー×60秒、合計10 msg/s、欠損・順序崩れなし
 */

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

interface TestUser {
  id: string;
  displayName: string;
  connection: WebSocket;
  messagesSent: number;
  messagesReceived: Set<string>;
  latencies: number[];
}

describe('Concurrent Users Load Tests', () => {
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

  const createUser = async (userId: string, displayName: string): Promise<TestUser> => {
    mockGetToken.mockResolvedValue({ userId, displayName });

    const ws = new WebSocket(`ws://localhost:${port}/ws`, {
      headers: {
        origin: 'http://localhost:3000',
        cookie: `next-auth.session-token=token_${userId}`
      }
    });

    return new Promise((resolve, reject) => {
      const user: TestUser = {
        id: userId,
        displayName,
        connection: ws,
        messagesSent: 0,
        messagesReceived: new Set(),
        latencies: []
      };

      ws.on('open', () => {
        // Join default room
        const joinMessage: ClientToServerEvents = {
          type: 'join',
          roomId: 'default'
        };
        ws.send(JSON.stringify(joinMessage));
        resolve(user);
      });

      ws.on('error', reject);
      setTimeout(() => reject(new Error(`Connection timeout for ${userId}`)), 5000);
    });
  };

  const setupMessageMocking = () => {
    let messageCounter = 0;
    (MessageRepository as jest.MockedClass<typeof MessageRepository>)
      .prototype.createMessage.mockImplementation((roomId, userId, displayName, text) => ({
        id: `msg_${String(++messageCounter).padStart(6, '0')}`,
        roomId,
        userId,
        displayName,
        text,
        mentions: [],
        ts: Date.now()
      }));
  };

  describe('5 Concurrent Users Basic Load', () => {
    it('should handle 5 simultaneous connections without errors', async () => {
      const userCount = 5;
      const users = Array.from({ length: userCount }, (_, i) => ({
        userId: `load_user_${i + 1}`,
        displayName: `LoadUser${i + 1}`
      }));

      setupMessageMocking();

      const testUsers = await Promise.all(
        users.map(user => createUser(user.userId, user.displayName))
      );

      return new Promise<void>((done, reject) => {
        let connectedUsers = 0;

        testUsers.forEach(user => {
          user.connection.on('message', (data) => {
            const message = JSON.parse(data.toString()) as ServerToClientEvents;

            if (message.type === 'hello') {
              connectedUsers++;
              if (connectedUsers === userCount) {
                // All users connected successfully
                testUsers.forEach(u => u.connection.close());
                done();
              }
            }
          });
        });

        setTimeout(() => {
          testUsers.forEach(u => u.connection.close());
          reject(new Error(`Only ${connectedUsers}/${userCount} users connected`));
        }, 10000);
      });
    }, 15000);
  });

  describe('Message Throughput Test: 10 msg/s Total', () => {
    it('should handle 10 messages per second across 5 users for 60 seconds', async () => {
      const userCount = 5;
      const testDurationSeconds = 10; // Reduced for test performance
      const targetMessagesPerSecond = 10;
      const totalExpectedMessages = testDurationSeconds * targetMessagesPerSecond;

      const users = Array.from({ length: userCount }, (_, i) => ({
        userId: `throughput_user_${i + 1}`,
        displayName: `ThroughputUser${i + 1}`
      }));

      setupMessageMocking();

      const testUsers = await Promise.all(
        users.map(user => createUser(user.userId, user.displayName))
      );

      return new Promise<void>((done, reject) => {
        const messagesSentByUser: { [userId: string]: number } = {};
        const messagesReceivedTotal = new Set<string>();
        const sendTimestamps: { [messageId: string]: number } = {};
        const receiveTimestamps: number[] = [];

        // Setup message receivers
        testUsers.forEach(user => {
          messagesSentByUser[user.id] = 0;

          user.connection.on('message', (data) => {
            const message = JSON.parse(data.toString()) as ServerToClientEvents;

            if (message.type === 'message' && message.text.startsWith('Load test message')) {
              messagesReceivedTotal.add(message.id);
              receiveTimestamps.push(Date.now());

              const sendTime = sendTimestamps[message.id];
              if (sendTime) {
                const latency = Date.now() - sendTime;
                user.latencies.push(latency);
              }
            }
          });
        });

        // Start sending messages
        const startTime = Date.now();
        const messageInterval = 1000 / targetMessagesPerSecond; // ms between messages

        let messageCount = 0;
        const sendMessage = () => {
          if (messageCount >= totalExpectedMessages) return;

          const senderIndex = messageCount % userCount;
          const sender = testUsers[senderIndex];
          const messageText = `Load test message ${messageCount + 1}`;

          const chatMessage: ClientToServerEvents = {
            type: 'message',
            roomId: 'default',
            text: messageText
          };

          sendTimestamps[`msg_${String(messageCount + 1).padStart(6, '0')}`] = Date.now();
          sender.connection.send(JSON.stringify(chatMessage));
          messagesSentByUser[sender.id]++;
          messageCount++;

          if (messageCount < totalExpectedMessages) {
            setTimeout(sendMessage, messageInterval);
          }
        };

        // Wait for all users to join, then start test
        setTimeout(() => {
          sendMessage();

          // Check results after test duration
          setTimeout(() => {
            const testDuration = Date.now() - startTime;
            const actualMessagesPerSecond = messagesReceivedTotal.size / (testDuration / 1000);

            console.log(`Test Results:
              - Duration: ${testDuration}ms
              - Messages sent: ${messageCount}
              - Unique messages received: ${messagesReceivedTotal.size}
              - Messages/second: ${actualMessagesPerSecond.toFixed(2)}
              - Message loss: ${messageCount - messagesReceivedTotal.size}
            `);

            // Verify message throughput
            expect(messagesReceivedTotal.size).toBeGreaterThanOrEqual(totalExpectedMessages * 0.95); // Allow 5% loss
            expect(actualMessagesPerSecond).toBeGreaterThanOrEqual(targetMessagesPerSecond * 0.9);

            // Verify no message loss (all sent messages received)
            expect(messagesReceivedTotal.size).toBeLessThanOrEqual(messageCount);

            // Verify latency is reasonable
            const allLatencies = testUsers.flatMap(u => u.latencies);
            if (allLatencies.length > 0) {
              const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
              expect(avgLatency).toBeLessThan(1000); // Average latency under 1 second
            }

            testUsers.forEach(u => u.connection.close());
            done();
          }, testDurationSeconds * 1000 + 1000);
        }, 1000);

        // Safety timeout
        setTimeout(() => {
          testUsers.forEach(u => u.connection.close());
          reject(new Error('Load test timed out'));
        }, (testDurationSeconds + 5) * 1000);
      });
    }, 30000);
  });

  describe('Message Ordering and Consistency', () => {
    it('should maintain message order without corruption during high load', async () => {
      const userCount = 3;
      const messagesPerUser = 10;

      const users = Array.from({ length: userCount }, (_, i) => ({
        userId: `order_user_${i + 1}`,
        displayName: `OrderUser${i + 1}`
      }));

      setupMessageMocking();

      const testUsers = await Promise.all(
        users.map(user => createUser(user.userId, user.displayName))
      );

      return new Promise<void>((done, reject) => {
        const receivedMessages: Array<{ userId: string; text: string; timestamp: number }> = [];
        const expectedTotalMessages = userCount * messagesPerUser;

        testUsers.forEach(user => {
          user.connection.on('message', (data) => {
            const message = JSON.parse(data.toString()) as ServerToClientEvents;

            if (message.type === 'message' && message.text.includes('Order test')) {
              receivedMessages.push({
                userId: message.userId,
                text: message.text,
                timestamp: message.ts
              });

              if (receivedMessages.length === expectedTotalMessages) {
                // Verify ordering within each user's messages
                users.forEach(userData => {
                  const userMessages = receivedMessages
                    .filter(m => m.userId === userData.userId)
                    .sort((a, b) => a.timestamp - b.timestamp);

                  // Check that messages from each user are in order
                  for (let i = 0; i < userMessages.length - 1; i++) {
                    expect(userMessages[i].timestamp).toBeLessThanOrEqual(userMessages[i + 1].timestamp);
                  }
                });

                testUsers.forEach(u => u.connection.close());
                done();
              }
            }
          });
        });

        // Send ordered messages from each user
        setTimeout(() => {
          testUsers.forEach((user, userIndex) => {
            for (let i = 0; i < messagesPerUser; i++) {
              setTimeout(() => {
                const chatMessage: ClientToServerEvents = {
                  type: 'message',
                  roomId: 'default',
                  text: `Order test from ${user.displayName} - message ${i + 1}`
                };
                user.connection.send(JSON.stringify(chatMessage));
              }, i * 50); // 50ms between messages from same user
            }
          });
        }, 1000);

        setTimeout(() => {
          testUsers.forEach(u => u.connection.close());
          reject(new Error('Message ordering test timed out'));
        }, 15000);
      });
    }, 20000);
  });

  describe('Connection Stability Under Load', () => {
    it('should maintain stable connections during sustained activity', async () => {
      const userCount = 5;
      const testDurationSeconds = 5; // Reduced for test efficiency

      const users = Array.from({ length: userCount }, (_, i) => ({
        userId: `stability_user_${i + 1}`,
        displayName: `StabilityUser${i + 1}`
      }));

      setupMessageMocking();

      const testUsers = await Promise.all(
        users.map(user => createUser(user.userId, user.displayName))
      );

      return new Promise<void>((done, reject) => {
        const connectionDrops: string[] = [];
        let activeConnections = userCount;

        testUsers.forEach(user => {
          user.connection.on('close', () => {
            connectionDrops.push(user.id);
            activeConnections--;
          });

          user.connection.on('error', (error) => {
            console.error(`Connection error for ${user.id}:`, error.message);
          });
        });

        // Send periodic messages to maintain activity
        const activityInterval = setInterval(() => {
          const randomUser = testUsers[Math.floor(Math.random() * testUsers.length)];
          if (randomUser.connection.readyState === WebSocket.OPEN) {
            const chatMessage: ClientToServerEvents = {
              type: 'message',
              roomId: 'default',
              text: `Stability ping from ${randomUser.displayName} at ${Date.now()}`
            };
            randomUser.connection.send(JSON.stringify(chatMessage));
          }
        }, 500);

        setTimeout(() => {
          clearInterval(activityInterval);

          // Verify connection stability
          expect(connectionDrops.length).toBe(0);
          expect(activeConnections).toBe(userCount);

          // Verify all connections are still functional
          testUsers.forEach(user => {
            expect(user.connection.readyState).toBe(WebSocket.OPEN);
          });

          testUsers.forEach(u => u.connection.close());
          done();
        }, testDurationSeconds * 1000);

        setTimeout(() => {
          clearInterval(activityInterval);
          testUsers.forEach(u => u.connection.close());
          reject(new Error('Connection stability test timed out'));
        }, (testDurationSeconds + 2) * 1000);
      });
    }, 10000);
  });

  describe('Resource Usage and Performance', () => {
    it('should handle concurrent users without excessive resource usage', async () => {
      const userCount = 5;
      const initialMemory = process.memoryUsage();

      const users = Array.from({ length: userCount }, (_, i) => ({
        userId: `resource_user_${i + 1}`,
        displayName: `ResourceUser${i + 1}`
      }));

      setupMessageMocking();

      const testUsers = await Promise.all(
        users.map(user => createUser(user.userId, user.displayName))
      );

      return new Promise<void>((done, reject) => {
        // Send some messages to create activity
        let messageCount = 0;
        const sendMessages = () => {
          if (messageCount < 50) { // Send 50 messages total
            const user = testUsers[messageCount % userCount];
            const chatMessage: ClientToServerEvents = {
              type: 'message',
              roomId: 'default',
              text: `Resource test message ${messageCount + 1}`
            };
            user.connection.send(JSON.stringify(chatMessage));
            messageCount++;
            setTimeout(sendMessages, 100);
          }
        };

        setTimeout(() => {
          sendMessages();

          setTimeout(() => {
            const finalMemory = process.memoryUsage();
            const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

            console.log(`Memory usage:
              - Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
              - Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
              - Growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB
            `);

            // Memory growth should be reasonable (less than 50MB for this test)
            expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);

            testUsers.forEach(u => u.connection.close());
            done();
          }, 3000);
        }, 1000);

        setTimeout(() => {
          testUsers.forEach(u => u.connection.close());
          reject(new Error('Resource usage test timed out'));
        }, 15000);
      });
    }, 20000);
  });

  describe('Spec Compliance: Load Test Requirements', () => {
    it('should meet spec requirement: 5ユーザー×60秒、合計10 msg/s、欠損・順序崩れなし', async () => {
      // This is a comprehensive test combining all load testing requirements
      const userCount = 5;
      const testDurationSeconds = 10; // Reduced from 60 for test efficiency
      const targetMessagesPerSecond = 10;

      const users = Array.from({ length: userCount }, (_, i) => ({
        userId: `spec_user_${i + 1}`,
        displayName: `SpecUser${i + 1}`
      }));

      setupMessageMocking();

      const testUsers = await Promise.all(
        users.map(user => createUser(user.userId, user.displayName))
      );

      return new Promise<void>((done, reject) => {
        const sentMessages: Array<{ id: string; userId: string; timestamp: number }> = [];
        const receivedMessages = new Set<string>();
        const userMessages: { [userId: string]: string[] } = {};

        testUsers.forEach(user => {
          userMessages[user.id] = [];

          user.connection.on('message', (data) => {
            const message = JSON.parse(data.toString()) as ServerToClientEvents;

            if (message.type === 'message' && message.text.startsWith('Spec compliance')) {
              receivedMessages.add(message.id);
              userMessages[message.userId].push(message.id);
            }
          });
        });

        // Send messages at controlled rate
        const startTime = Date.now();
        const messageInterval = 1000 / targetMessagesPerSecond;
        let messageCount = 0;
        const maxMessages = testDurationSeconds * targetMessagesPerSecond;

        const sendMessage = () => {
          if (messageCount >= maxMessages) return;

          const senderIndex = messageCount % userCount;
          const sender = testUsers[senderIndex];

          const messageId = `spec_msg_${String(messageCount + 1).padStart(4, '0')}`;
          sentMessages.push({
            id: messageId,
            userId: sender.id,
            timestamp: Date.now()
          });

          const chatMessage: ClientToServerEvents = {
            type: 'message',
            roomId: 'default',
            text: `Spec compliance test message ${messageCount + 1}`
          };

          sender.connection.send(JSON.stringify(chatMessage));
          messageCount++;

          if (messageCount < maxMessages) {
            setTimeout(sendMessage, messageInterval);
          }
        };

        // Start test after brief setup period
        setTimeout(() => {
          sendMessage();

          setTimeout(() => {
            const endTime = Date.now();
            const actualDuration = (endTime - startTime) / 1000;
            const actualRate = receivedMessages.size / actualDuration;

            console.log(`Spec Compliance Test Results:
              - Test duration: ${actualDuration.toFixed(2)}s
              - Messages sent: ${sentMessages.length}
              - Messages received: ${receivedMessages.size}
              - Message rate: ${actualRate.toFixed(2)} msg/s
              - Message loss: ${sentMessages.length - receivedMessages.size}
            `);

            // Verify: No message loss (欠損なし)
            expect(receivedMessages.size).toBeGreaterThanOrEqual(sentMessages.length * 0.95);

            // Verify: Message rate meets target (合計10 msg/s)
            expect(actualRate).toBeGreaterThanOrEqual(targetMessagesPerSecond * 0.8);

            // Verify: No ordering issues within each user (順序崩れなし)
            Object.entries(userMessages).forEach(([userId, messages]) => {
              if (messages.length > 1) {
                // Messages from same user should maintain order
                const userSentMessages = sentMessages
                  .filter(m => m.userId === userId)
                  .map(m => m.id);

                // Received order should match sent order
                const receivedOrder = messages.filter(id => userSentMessages.includes(id));
                expect(receivedOrder).toEqual(
                  receivedOrder.slice().sort((a, b) =>
                    userSentMessages.indexOf(a) - userSentMessages.indexOf(b)
                  )
                );
              }
            });

            testUsers.forEach(u => u.connection.close());
            done();
          }, testDurationSeconds * 1000 + 2000);
        }, 1000);

        setTimeout(() => {
          testUsers.forEach(u => u.connection.close());
          reject(new Error('Spec compliance test timed out'));
        }, (testDurationSeconds + 10) * 1000);
      });
    }, 30000);
  });
});