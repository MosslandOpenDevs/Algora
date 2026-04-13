import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AuditService } from './audit';

function newAudit(): AuditService {
  return new AuditService(new Database(':memory:'));
}

describe('AuditService', () => {
  let audit: AuditService;

  beforeEach(() => {
    audit = newAudit();
  });

  it('starts with an empty chain that verifies clean', () => {
    expect(audit.verify()).toEqual({ valid: true, checked: 0 });
  });

  it('assigns increasing seq and links prev_hash', () => {
    const a = audit.append({ type: 'VOTE_CAST', actor: 'alice', subjectId: 'p1', payload: { choice: 'for' } });
    const b = audit.append({ type: 'VOTE_CAST', actor: 'bob', subjectId: 'p1', payload: { choice: 'against' } });

    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(b.prev_hash).toBe(a.hash);
    expect(a.prev_hash).toBe('0'.repeat(64));
  });

  it('verify passes for a genuine chain', () => {
    for (let i = 0; i < 10; i++) {
      audit.append({ type: 'VOTE_CAST', actor: `voter-${i}`, subjectId: 'p1', payload: { i } });
    }
    expect(audit.verify()).toEqual({ valid: true, checked: 10 });
  });

  it('detects payload tampering', () => {
    const db = new Database(':memory:');
    const a = new AuditService(db);
    a.append({ type: 'VOTE_CAST', actor: 'alice', subjectId: 'p1', payload: { choice: 'for' } });
    a.append({ type: 'VOTE_CAST', actor: 'bob', subjectId: 'p1', payload: { choice: 'against' } });

    // Tamper with the payload directly in the DB, bypassing the service.
    db.prepare("UPDATE audit_log SET payload = ? WHERE seq = 1").run(JSON.stringify({ choice: 'abstain' }));

    const result = a.verify();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('detects prev_hash forgery', () => {
    const db = new Database(':memory:');
    const a = new AuditService(db);
    a.append({ type: 'VOTE_CAST', actor: 'alice', subjectId: 'p1', payload: {} });
    a.append({ type: 'VOTE_CAST', actor: 'bob', subjectId: 'p1', payload: {} });

    // Rewrite prev_hash of entry 2 to a wrong value.
    db.prepare("UPDATE audit_log SET prev_hash = ? WHERE seq = 2").run('f'.repeat(64));

    const result = a.verify();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.reason).toMatch(/prev_hash/);
  });

  it('detects sequence gap', () => {
    const db = new Database(':memory:');
    const a = new AuditService(db);
    a.append({ type: 'VOTE_CAST', actor: 'alice', subjectId: 'p1', payload: {} });
    a.append({ type: 'VOTE_CAST', actor: 'bob', subjectId: 'p1', payload: {} });
    a.append({ type: 'VOTE_CAST', actor: 'carol', subjectId: 'p1', payload: {} });

    db.prepare('DELETE FROM audit_log WHERE seq = 2').run();

    const result = a.verify();
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/sequence gap/);
  });

  it('recent returns entries in reverse seq order', () => {
    audit.append({ type: 'VOTE_CAST', actor: 'a', subjectId: 'p1', payload: {} });
    audit.append({ type: 'VOTE_CAST', actor: 'b', subjectId: 'p1', payload: {} });
    audit.append({ type: 'VOTE_CAST', actor: 'c', subjectId: 'p2', payload: {} });

    const recent = audit.recent(2);
    expect(recent.map((e) => e.actor)).toEqual(['c', 'b']);
  });

  it('getBySubject returns all entries in forward seq order', () => {
    audit.append({ type: 'VOTE_CAST', actor: 'a', subjectId: 'p1', payload: {} });
    audit.append({ type: 'VOTE_CAST', actor: 'b', subjectId: 'p2', payload: {} });
    audit.append({ type: 'VOTE_CAST', actor: 'c', subjectId: 'p1', payload: {} });

    const p1 = audit.getBySubject('p1');
    expect(p1.map((e) => e.actor)).toEqual(['a', 'c']);
  });
});
