import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { requireAdmin, requireAuth } from './auth';

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockRes(): { res: Response; status: number | null; body: unknown } {
  const state: { status: number | null; body: unknown } = { status: null, body: null };
  const res = {
    status(code: number) { state.status = code; return this; },
    json(payload: unknown) { state.body = payload; return this; },
  } as unknown as Response;
  return { res, ...state, get status() { return state.status; }, get body() { return state.body; } } as any;
}

describe('requireAdmin / requireAuth', () => {
  const originalEnv = process.env.ADMIN_API_KEY;

  beforeEach(() => {
    process.env.ADMIN_API_KEY = 'test-admin-key-unique-value-123';
  });

  afterEach(() => {
    if (originalEnv !== undefined) process.env.ADMIN_API_KEY = originalEnv;
    else delete process.env.ADMIN_API_KEY;
  });

  it('returns 503 when ADMIN_API_KEY is not configured', () => {
    delete process.env.ADMIN_API_KEY;
    const req = mockReq({});
    const m = mockRes();
    let called = false;
    requireAdmin(req, m.res, () => { called = true; });
    expect(called).toBe(false);
    expect((m as any).status).toBe(503);
  });

  it('rejects request without key', () => {
    const m = mockRes();
    let called = false;
    requireAdmin(mockReq({}), m.res, () => { called = true; });
    expect(called).toBe(false);
    expect((m as any).status).toBe(401);
  });

  it('rejects wrong key', () => {
    const m = mockRes();
    let called = false;
    requireAdmin(mockReq({ 'x-admin-key': 'wrong' }), m.res, () => { called = true; });
    expect(called).toBe(false);
    expect((m as any).status).toBe(401);
  });

  it('accepts correct x-admin-key header', () => {
    const m = mockRes();
    let called = false;
    requireAdmin(mockReq({ 'x-admin-key': 'test-admin-key-unique-value-123' }), m.res, () => { called = true; });
    expect(called).toBe(true);
    expect((m as any).status).toBeNull();
  });

  it('accepts correct Bearer token', () => {
    const m = mockRes();
    let called = false;
    requireAdmin(
      mockReq({ authorization: 'Bearer test-admin-key-unique-value-123' }),
      m.res,
      () => { called = true; },
    );
    expect(called).toBe(true);
  });

  it('does not accept a prefix-match partial key (length sensitivity)', () => {
    const m = mockRes();
    let called = false;
    requireAdmin(
      mockReq({ 'x-admin-key': 'test-admin-key-unique-value-12' }), // one char short
      m.res,
      () => { called = true; },
    );
    expect(called).toBe(false);
    expect((m as any).status).toBe(401);
  });

  it('requireAuth behaves the same as requireAdmin for now (pre-wallet-auth)', () => {
    const m = mockRes();
    let called = false;
    requireAuth(
      mockReq({ 'x-admin-key': 'test-admin-key-unique-value-123' }),
      m.res,
      () => { called = true; },
    );
    expect(called).toBe(true);
  });
});
