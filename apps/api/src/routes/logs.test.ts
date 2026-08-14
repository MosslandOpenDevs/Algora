import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logMonitorService } from '../services/log-monitor';
import { cacheMiddleware } from '../middleware/caching';
import { logsRouter } from './logs';

const ADMIN_KEY = 'logs-route-test-admin-key-4e2f';

describe('logs routes authorization', () => {
  const originalAdminKey = process.env.ADMIN_API_KEY;
  let app: Express;

  beforeEach(() => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    app = express();
    app.use(cacheMiddleware);
    app.use('/api/logs', logsRouter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalAdminKey !== undefined) process.env.ADMIN_API_KEY = originalAdminKey;
    else delete process.env.ADMIN_API_KEY;
  });

  it.each([
    '/stats',
    '/files',
    '/recent/api-out.log',
    '/search',
    '/errors/today',
    '/disk-usage',
  ])('rejects anonymous GET %s', async (path) => {
    const response = await request(app).get(`/api/logs${path}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
    expect(response.headers['cache-control']).toBe(
      'no-store, no-cache, must-revalidate'
    );
  });

  it('rejects an incorrect key before reading logs', async () => {
    const getStats = vi.spyOn(logMonitorService, 'getStats');

    const response = await request(app)
      .get('/api/logs/stats')
      .set('x-admin-key', 'wrong-key');

    expect(response.status).toBe(401);
    expect(getStats).not.toHaveBeenCalled();
  });

  it('rejects anonymous cleanup before the destructive handler', async () => {
    const cleanup = vi.spyOn(logMonitorService, 'clearOldLogs');

    const response = await request(app).delete('/api/logs/cleanup');

    expect(response.status).toBe(401);
    expect(cleanup).not.toHaveBeenCalled();
    expect(response.headers['ratelimit-policy']).toBeUndefined();
    expect(response.headers['ratelimit-limit']).toBeUndefined();
  });

  it('fails closed when the admin credential is not configured', async () => {
    delete process.env.ADMIN_API_KEY;

    const response = await request(app).get('/api/logs/files');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: 'Admin API not configured. Set ADMIN_API_KEY.',
    });
  });

  it('allows an authenticated admin to reach a log handler', async () => {
    vi.spyOn(logMonitorService, 'getLogFiles').mockReturnValue([]);
    vi.spyOn(logMonitorService, 'getDiskUsage').mockReturnValue({
      totalBytes: 0,
      totalMB: '0.00',
    });

    const response = await request(app)
      .get('/api/logs/files')
      .set('x-admin-key', ADMIN_KEY);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe(
      'no-store, no-cache, must-revalidate'
    );
    expect(response.body).toEqual({
      files: [],
      diskUsage: { totalBytes: 0, totalMB: '0.00' },
    });
  });

  it.each([
    ['/recent/api-out.log?limit=-1', 'limit must be a positive integer'],
    ['/recent/api-out.log?limit=abc', 'limit must be a positive integer'],
    [
      '/search?limit=-1',
      'limit must be a positive integer and offset a non-negative integer',
    ],
    [
      '/search?offset=-1',
      'limit must be a positive integer and offset a non-negative integer',
    ],
  ])('rejects invalid pagination for %s', async (path, error) => {
    vi.spyOn(logMonitorService, 'getLogFiles').mockReturnValue([
      {
        name: 'api-out.log',
        size: 1,
        modified: new Date(0),
        type: 'out',
      },
    ]);

    const response = await request(app)
      .get(`/api/logs${path}`)
      .set('x-admin-key', ADMIN_KEY);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
  });

  it('does not read a file outside the enumerated regular log files', async () => {
    vi.spyOn(logMonitorService, 'getLogFiles').mockReturnValue([]);
    const getRecentLogs = vi.spyOn(logMonitorService, 'getRecentLogs');

    const response = await request(app)
      .get('/api/logs/recent/not-a-log.txt')
      .set('x-admin-key', ADMIN_KEY);

    expect(response.status).toBe(400);
    expect(getRecentLogs).not.toHaveBeenCalled();
  });
});
