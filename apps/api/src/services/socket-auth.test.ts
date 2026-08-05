/**
 * Socket.IO authorization.
 *
 * The REST twins of these five operations were put behind requireAdmin, but the
 * socket handlers were left open and the handshake middleware was a comment that
 * called next() for everyone. Anyone who could reach /socket.io/ could trigger
 * LLM inference, start or silence automated debate, and summon or dismiss agents.
 *
 * Connections themselves stay anonymous on purpose: the live showcase is a
 * broadcast-only client (nothing in apps/web emits), so rejecting unauthenticated
 * handshakes would take the public feed down while closing nothing extra.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { createServer, type Server as HttpServer } from 'http';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { AddressInfo } from 'net';

import { createSchema } from '../db';
import { setupSocketHandlers } from './socket';

const ADMIN_KEY = 'socket-test-admin-key-9f2b';

const ADMIN_ONLY_EVENTS = [
  ['agora:requestResponse', { sessionId: 's1', agentId: 'a1' }],
  ['agora:startAutomated', { sessionId: 's1' }],
  ['agora:stopAutomated', { sessionId: 's1' }],
  ['agent:summon', { agentId: 'a1' }],
  ['agent:dismiss', { agentId: 'a1' }],
] as const;

let httpServer: HttpServer;
let io: SocketServer;
let db: Database.Database;
let port: number;

function connect(auth?: Record<string, unknown>): Promise<ClientSocket> {
  const socket = ioClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    auth,
    reconnection: false,
  });
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

/** Resolves with the first of `events` to arrive, or 'timeout'. */
function firstOf(
  socket: ClientSocket,
  events: string[],
  ms = 1500
): Promise<string> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve('timeout'), ms);
    for (const event of events) {
      socket.once(event, () => {
        clearTimeout(timer);
        resolve(event);
      });
    }
  });
}

beforeAll(async () => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;

  db = new Database(':memory:');
  createSchema(db);

  httpServer = createServer();
  io = new SocketServer(httpServer, { cors: { origin: '*' } });
  setupSocketHandlers(io, db);

  await new Promise<void>(resolve =>
    httpServer.listen(0, '127.0.0.1', resolve)
  );
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  io.close();
  await new Promise<void>(resolve => httpServer.close(() => resolve()));
  db.close();
});

describe('socket connections', () => {
  let socket: ClientSocket;

  beforeEach(() => {
    if (socket?.connected) socket.disconnect();
  });

  it('accepts an anonymous client so the public feed keeps working', async () => {
    socket = await connect();
    expect(socket.connected).toBe(true);
  });

  it('accepts an admin client', async () => {
    socket = await connect({ token: ADMIN_KEY });
    expect(socket.connected).toBe(true);
  });

  it('lets an anonymous client join a session and read history', async () => {
    socket = await connect();
    socket.emit('agora:join', 'session-public');

    await expect(firstOf(socket, ['agora:history'])).resolves.toBe(
      'agora:history'
    );
  });
});

describe('admin-only socket events', () => {
  let socket: ClientSocket;

  for (const [event, payload] of ADMIN_ONLY_EVENTS) {
    it(`rejects ${event} from an anonymous client`, async () => {
      socket = await connect();
      socket.emit(event, payload);

      const received = await firstOf(socket, ['error:unauthorized']);
      expect(received).toBe('error:unauthorized');

      socket.disconnect();
    });
  }

  it('reports which event was refused', async () => {
    socket = await connect();

    const detail = await new Promise<{ event?: string }>(resolve => {
      socket.once('error:unauthorized', d => resolve(d as { event?: string }));
      socket.emit('agent:summon', { agentId: 'a1' });
    });

    expect(detail.event).toBe('agent:summon');
    socket.disconnect();
  });

  it('does not refuse an admin client', async () => {
    socket = await connect({ token: ADMIN_KEY });
    socket.emit('agent:summon', { agentId: 'missing-agent' });

    // The agent does not exist, so the handler answers with an ack rather than
    // an authorization error — what matters is that it got past the gate.
    const received = await firstOf(socket, [
      'error:unauthorized',
      'agent:summon:ack',
    ]);
    expect(received).toBe('agent:summon:ack');

    socket.disconnect();
  });

  it('refuses a client that presents the wrong key', async () => {
    socket = await connect({ token: 'not-the-admin-key' });
    socket.emit('agora:startAutomated', { sessionId: 's1' });

    const received = await firstOf(socket, [
      'error:unauthorized',
      'agora:automatedStarted',
    ]);
    expect(received).toBe('error:unauthorized');

    socket.disconnect();
  });
});
