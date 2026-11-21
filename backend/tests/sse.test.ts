import http from 'http';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { signToken } from '../src/utils/jwt';
import { SSEStreamHandler } from '../src/utils/sseStream';

const app = createApp();

describe('SSE Lifecycle & Progressive Streaming Integration Tests', () => {
  let server: http.Server;
  let serverPort: number;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // 1. Create test user
    const user = await prisma.user.upsert({
      where: { email: 'sse_test_user@example.com' },
      update: {},
      create: {
        email: 'sse_test_user@example.com',
        name: 'SSE Tester',
        passwordHash: 'dummy'
      }
    });
    userId = user.id;
    authToken = signToken({ userId: user.id, email: user.email, role: 'USER' });

    // 2. Start HTTP server on dynamic port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as any;
        serverPort = address.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('1. should establish POST-based SSE connection and receive progressive events after request body ends', async () => {
    const postData = JSON.stringify({
      message: 'Plan a 5-day trip to Goa for two people from Kolkata with ₹50,000 budget'
    });

    const receivedChunks: string[] = [];
    const receivedEvents: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/api/chat/stream',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            Accept: 'text/event-stream',
            Authorization: `Bearer ${authToken}`
          }
        },
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/event-stream');

          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            receivedChunks.push(chunk);
            const matches = chunk.match(/event:\s*([a-zA-Z_]+)/g);
            if (matches) {
              matches.forEach((m) => receivedEvents.push(m.replace('event:', '').trim()));
            }
          });

          res.on('end', () => {
            resolve();
          });
        }
      );

      req.on('error', reject);

      // Write POST body and end request stream
      // At this point req emits 'end' and 'close' - the response stream MUST remain open!
      req.write(postData);
      req.end();
    });

    // Verify progressive events received
    expect(receivedEvents).toContain('workflow_step');
    expect(receivedEvents).toContain('intent_extracted');
    expect(receivedEvents).toContain('tool_start');
    expect(receivedEvents).toContain('flight_results');
    expect(receivedEvents).toContain('hotel_results');
    expect(receivedEvents).toContain('destination_results');
    expect(receivedEvents).toContain('plan_ready');
    expect(receivedEvents).toContain('done');
    expect(receivedChunks.length).toBeGreaterThan(3);
  }, 30000);

  it('2. should detect genuine client disconnect via socket and clear heartbeat safely', (done) => {
    // Mock Request & Response objects to simulate premature disconnect
    const mockReq: any = {
      on: jest.fn(),
      aborted: false
    };

    let closeHandler: (() => void) | null = null;

    const mockSocket: any = {
      destroyed: false,
      on: jest.fn()
    };

    const mockRes: any = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      writableEnded: false,
      writableFinished: false,
      destroyed: false,
      socket: mockSocket,
      write: jest.fn().mockReturnValue(true),
      end: jest.fn(),
      on: jest.fn((event: string, handler: any) => {
        if (event === 'close') {
          closeHandler = handler;
        }
      })
    };

    const sseHandler = new SSEStreamHandler(mockReq, mockRes);
    expect(sseHandler.isConnected).toBe(true);

    // Initial write succeeds
    const initialWriteOk = sseHandler.emit('workflow_step', { step: 'init' });
    expect(initialWriteOk).toBe(true);

    // Simulate premature client disconnect before res.end()
    mockRes.writableFinished = false; // unfinished response
    mockSocket.destroyed = true;

    let disconnectNotified = false;
    sseHandler.onDisconnect(() => {
      disconnectNotified = true;
    });

    if (closeHandler) {
      (closeHandler as any)();
    }

    expect(sseHandler.isConnected).toBe(false);
    expect(sseHandler.wasPrematurelyDisconnected).toBe(true);
    expect(disconnectNotified).toBe(true);

    // Any subsequent emit must safely skip and return false without throwing
    const postDisconnectWrite = sseHandler.emit('flight_results', { test: true });
    expect(postDisconnectWrite).toBe(false);

    // Ensure idempotent close
    sseHandler.close();
    expect(sseHandler.isConnected).toBe(false);
    done();
  });

  it('3. should verify AgentRun terminal status after workflow completes', async () => {
    const postData = JSON.stringify({
      message: 'Plan a 5-day trip to Goa for two people from Kolkata with ₹50,000 budget'
    });

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/api/chat/stream',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Authorization: `Bearer ${authToken}`
          }
        },
        (res) => {
          res.resume();
          res.on('end', resolve);
        }
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    // Check database to ensure no AgentRun was left in RUNNING status
    const runningRuns = await prisma.agentRun.findMany({
      where: {
        userId,
        status: 'RUNNING'
      }
    });

    expect(runningRuns.length).toBe(0);

    const completedRuns = await prisma.agentRun.findMany({
      where: {
        userId,
        status: 'COMPLETED'
      }
    });

    expect(completedRuns.length).toBeGreaterThan(0);
  }, 30000);
});
