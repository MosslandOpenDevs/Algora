/**
 * Under MIP-1 Archive (ratified 2026-09-02) the scheduler must not open,
 * advance or close governance records on its own.
 *
 * Only the report schedule was gated at ratification. The proposal queue,
 * voting resolution, backfill, Tier 2 and Agora harvest jobs kept running, so
 * production went on minting roughly twenty agent-authored proposals a day and
 * resolving them 'passed' with no vote. These pin which jobs the
 * GOVERNANCE_PIPELINE_ENABLED gate covers, and that it defaults to off.
 */

import Database from 'better-sqlite3';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityService } from '../activity';
import { createSchema } from '../db';
import { SchedulerService } from './index';

/** Every scheduled job that opens, advances or closes a governance record. */
const PIPELINE_JOBS = [
  'tier2',
  'passiveConsensus',
  'proposalBackfill',
  'proposalQueue',
  'votingResolution',
  'agoraStaleCleanup',
];

function startScheduler(): SchedulerService {
  const db = new Database(':memory:');
  createSchema(db);
  const io = new SocketServer(createServer());
  const scheduler = new SchedulerService(db, io, new ActivityService(db, io));
  scheduler.start();
  return scheduler;
}

describe('SchedulerService governance pipeline gate', () => {
  let scheduler: SchedulerService | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    scheduler?.stop();
    scheduler = null;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('schedules none of the pipeline jobs when GOVERNANCE_PIPELINE_ENABLED is unset', () => {
    vi.stubEnv('GOVERNANCE_PIPELINE_ENABLED', '');

    scheduler = startScheduler();
    const status = scheduler.getStatus();

    expect(status.config.governancePipelineEnabled).toBe(false);
    for (const job of PIPELINE_JOBS) {
      expect(status.activeIntervals).not.toContain(job);
    }
    // Neither boot kick may fire the queue or the harvest behind the gate.
    expect(status.activeIntervals).not.toContain('proposalQueue:boot');
    expect(status.activeIntervals).not.toContain('agoraStaleCleanup:boot');
    // Retention cleanup is not a governance write and keeps running.
    expect(status.activeIntervals).toContain('dataCleanup');
  });

  it('schedules every pipeline job when GOVERNANCE_PIPELINE_ENABLED=true', () => {
    vi.stubEnv('GOVERNANCE_PIPELINE_ENABLED', 'true');

    scheduler = startScheduler();
    const status = scheduler.getStatus();

    expect(status.config.governancePipelineEnabled).toBe(true);
    for (const job of PIPELINE_JOBS) {
      expect(status.activeIntervals).toContain(job);
    }
  });
});
