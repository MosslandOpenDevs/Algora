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
];

function startScheduler(): SchedulerService {
  const db = new Database(':memory:');
  createSchema(db);
  const io = new SocketServer(createServer());
  const scheduler = new SchedulerService(db, io, new ActivityService(db, io));
  scheduler.start();
  return scheduler;
}

/** Stand-in Agora service that records how the stale-session job called it. */
function stubAgora() {
  const calls = {
    harvest: 0,
    sweeps: [] as Array<Record<string, unknown> | undefined>,
  };
  const service = {
    harvestStaleSessions: async () => {
      calls.harvest++;
      return { harvested: 0, failed: 0, ids: [] };
    },
    cleanupStaleSessions: (opts?: Record<string, unknown>) => {
      calls.sweeps.push(opts);
      return { cleaned: 0, ids: [] };
    },
  };
  return { calls, service };
}

async function runStaleMaintenance(scheduler: SchedulerService): Promise<void> {
  await (
    scheduler as unknown as { runAgoraStaleMaintenance(): Promise<void> }
  ).runAgoraStaleMaintenance();
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

  it("schedules none of the pipeline jobs unless GOVERNANCE_PIPELINE_ENABLED is 'true'", () => {
    vi.stubEnv('GOVERNANCE_PIPELINE_ENABLED', '');

    scheduler = startScheduler();
    const status = scheduler.getStatus();

    expect(status.config.governancePipelineEnabled).toBe(false);
    for (const job of PIPELINE_JOBS) {
      expect(status.activeIntervals).not.toContain(job);
    }
    // The queue's tracked boot kick must not fire behind the gate either.
    expect(status.activeIntervals).not.toContain('proposalQueue:boot');
    // The stale-session sweep keeps running so sessions orphaned by a
    // restart are closed; only its harvest is gated (next test).
    expect(status.activeIntervals).toContain('agoraStaleCleanup');
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

  it('sweeps stale Agora sessions without harvesting them into proposals when the gate is off', async () => {
    vi.stubEnv('GOVERNANCE_PIPELINE_ENABLED', '');
    scheduler = startScheduler();
    const { calls, service } = stubAgora();
    scheduler.setAgoraService(service);

    await runStaleMaintenance(scheduler);

    expect(calls.harvest).toBe(0);
    expect(calls.sweeps).toHaveLength(1);
    // Nothing is left waiting for a harvest that will never come.
    expect(calls.sweeps[0]).not.toHaveProperty('preserveHarvestable');
  });

  it('harvests before sweeping when the gate is on', async () => {
    vi.stubEnv('GOVERNANCE_PIPELINE_ENABLED', 'true');
    scheduler = startScheduler();
    const { calls, service } = stubAgora();
    scheduler.setAgoraService(service);

    await runStaleMaintenance(scheduler);

    expect(calls.harvest).toBe(1);
    expect(calls.sweeps[0]).toHaveProperty('preserveHarvestable');
  });
});
