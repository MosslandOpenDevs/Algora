/**
 * The Agora record is read-only under MIP-1 Archive (2026-09-02).
 *
 * POST /api/agora/sessions and POST /api/agora/sessions/:id/message were left
 * public in 0f91601 for the live showcase, behind nothing but writeLimiter.
 * Every other Agora write already needed the admin key. The message route took
 * messageType and agentId from the body, so an anonymous caller could write
 * rows that read as agent deliberation — the rows the stale-session harvest
 * counts before it completes a session into a proposal.
 *
 * Reads stay public: the archive is meant to be looked at.
 */

import express, { type Express } from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSchema } from '../db';
import { agoraRouter } from './agora';

const ADMIN_KEY = 'agora-route-test-admin-key-7c1d';
const SESSION_ID = 'agora-archive-session';

let db: Database.Database;
let app: Express;

function count(table: 'agora_sessions' | 'agora_messages'): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

describe('Agora write routes under MIP-1 Archive', () => {
  const originalAdminKey = process.env.ADMIN_API_KEY;

  beforeEach(() => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;

    db = new Database(':memory:');
    createSchema(db);
    db.prepare(
      `INSERT INTO agora_sessions (id, title, status) VALUES (?, 'Archived session', 'completed')`
    ).run(SESSION_ID);

    // The two routes emit on the socket server; nothing here asserts on it.
    const io = {
      emit: () => undefined,
      to: () => ({ emit: () => undefined }),
    } as unknown as SocketServer;

    app = express();
    app.use(express.json());
    app.locals.db = db;
    app.locals.io = io;
    app.use('/api/agora', agoraRouter);
  });

  afterEach(() => {
    db.close();
    if (originalAdminKey !== undefined) process.env.ADMIN_API_KEY = originalAdminKey;
    else delete process.env.ADMIN_API_KEY;
  });

  describe('POST /sessions', () => {
    it('refuses an anonymous caller and creates no session', async () => {
      const response = await request(app)
        .post('/api/agora/sessions')
        .send({ title: 'Anonymous session', issueId: null });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized' });
      expect(count('agora_sessions')).toBe(1);
    });

    it('refuses a wrong key', async () => {
      const response = await request(app)
        .post('/api/agora/sessions')
        .set('x-admin-key', 'not-the-admin-key')
        .send({ title: 'Wrong key' });

      expect(response.status).toBe(401);
      expect(count('agora_sessions')).toBe(1);
    });

    it('lets the operator create a session', async () => {
      const response = await request(app)
        .post('/api/agora/sessions')
        .set('x-admin-key', ADMIN_KEY)
        .send({ title: 'Operator session', summonedAgents: [] });

      expect(response.status).toBe(201);
      expect(response.body.session.title).toBe('Operator session');
      expect(count('agora_sessions')).toBe(2);
    });
  });

  describe('POST /sessions/:id/message', () => {
    it('refuses an anonymous human message', async () => {
      const response = await request(app)
        .post(`/api/agora/sessions/${SESSION_ID}/message`)
        .send({ content: 'hello', messageType: 'human', humanId: 'anonymous' });

      expect(response.status).toBe(401);
      expect(count('agora_messages')).toBe(0);
    });

    it('refuses an anonymous message posing as an agent', async () => {
      const response = await request(app)
        .post(`/api/agora/sessions/${SESSION_ID}/message`)
        .send({
          content: 'I support this proposal.',
          messageType: 'agent',
          agentId: 'some-agent',
          tierUsed: '1',
        });

      expect(response.status).toBe(401);
      expect(count('agora_messages')).toBe(0);
    });

    it('lets the operator post', async () => {
      const response = await request(app)
        .post(`/api/agora/sessions/${SESSION_ID}/message`)
        .set('Authorization', `Bearer ${ADMIN_KEY}`)
        .send({ content: 'Correction note', messageType: 'system', tierUsed: '0' });

      expect(response.status).toBe(201);
      expect(response.body.message.content).toBe('Correction note');
      expect(count('agora_messages')).toBe(1);
    });
  });

  it('fails closed when the admin credential is not configured', async () => {
    delete process.env.ADMIN_API_KEY;

    const created = await request(app)
      .post('/api/agora/sessions')
      .send({ title: 'No key configured' });
    const posted = await request(app)
      .post(`/api/agora/sessions/${SESSION_ID}/message`)
      .send({ content: 'hello', messageType: 'human' });

    expect(created.status).toBe(503);
    expect(posted.status).toBe(503);
    expect(count('agora_sessions')).toBe(1);
    expect(count('agora_messages')).toBe(0);
  });

  it('keeps the record readable without a credential', async () => {
    const list = await request(app).get('/api/agora/sessions');
    const detail = await request(app).get(`/api/agora/sessions/${SESSION_ID}`);

    expect(list.status).toBe(200);
    expect(list.body.sessions.map((s: { id: string }) => s.id)).toEqual([SESSION_ID]);
    expect(detail.status).toBe(200);
    expect(detail.body.session.id).toBe(SESSION_ID);
  });
});
