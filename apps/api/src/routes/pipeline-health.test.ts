/**
 * What the escalation health stage is allowed to react to.
 *
 * The stage used to score the raw count of open escalations: under 5 healthy,
 * under 10 degraded, otherwise critical. That conflated two unrelated things.
 *
 * Only `extended_discussion` resolves on its own — `handleAgoraSessionCompleted`
 * closes it once the follow-up deliberation finishes. `working_group` and
 * `human_review` wait on people by design and can legitimately sit open for
 * weeks. Under the old rule, five people-shaped escalations dragged the
 * pipeline to "degraded" and ten to "critical", for a system that was working
 * exactly as designed.
 *
 * That is not a cosmetic complaint. Production sat at escalation-critical for
 * over two weeks; a signal pinned red is a signal people stop reading, which is
 * how an issue timeline that returned 500 for every issue went unnoticed for
 * the same fortnight.
 *
 * So the score now reacts to one thing — a deliberation the system owns and
 * never ran — and the human backlog moves to `/alerts`, where something can
 * actually be done about it.
 */

import express, { type Express } from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { createSchema } from '../db';
import { pipelineHealthRouter } from './pipeline-health';

type EscalationType = 'extended_discussion' | 'working_group' | 'human_review';

const HOUR = 60 * 60 * 1000;

function escalation(escalationType: EscalationType, ageHours: number, id = `${escalationType}-${ageHours}`) {
  return {
    id,
    sessionId: `session-${id}`,
    issueId: null,
    escalationType,
    consensusScore: 0.4,
    totalRounds: 5,
    reason: 'low consensus',
    status: 'in_progress' as const,
    assignedTo: null,
    resolution: null,
    createdAt: new Date(Date.now() - ageHours * HOUR),
    updatedAt: new Date(),
    resolvedAt: null,
  };
}

function appWith(escalations: ReturnType<typeof escalation>[]): Express {
  const db = new Database(':memory:');
  createSchema(db);

  const app = express();
  app.locals.db = db;
  app.locals.governanceOSBridge = { getPendingEscalations: () => escalations };
  app.use('/api/pipeline', pipelineHealthRouter);
  return app;
}

const escalationStage = (body: { stages: Record<string, unknown> }) =>
  body.stages.escalation as {
    status: string;
    score: number;
    details: { pendingEscalations: number; stalled: number; awaitingPeople: number };
  };

describe('escalation health stage', () => {
  it('stays healthy while people hold a backlog', async () => {
    // Twelve, well past the old rule's "critical" threshold of ten.
    const backlog = Array.from({ length: 12 }, (_, i) =>
      escalation(i % 2 ? 'human_review' : 'working_group', 400, `person-${i}`),
    );

    const res = await request(appWith(backlog)).get('/api/pipeline/health');

    const stage = escalationStage(res.body);
    expect(stage.status).toBe('healthy');
    expect(stage.score).toBe(100);
    // Still counted and reported — invisible is not the same as unpenalised.
    expect(stage.details.awaitingPeople).toBe(12);
    expect(stage.details.pendingEscalations).toBe(12);
    expect(stage.details.stalled).toBe(0);
  });

  it('degrades when deliberations the system owns never ran', async () => {
    const res = await request(
      appWith([escalation('extended_discussion', 48, 'a'), escalation('extended_discussion', 72, 'b')]),
    ).get('/api/pipeline/health');

    const stage = escalationStage(res.body);
    expect(stage.details.stalled).toBe(2);
    expect(stage.status).toBe('degraded');
  });

  it('goes critical once several have stalled', async () => {
    const stalled = Array.from({ length: 4 }, (_, i) =>
      escalation('extended_discussion', 100, `stalled-${i}`),
    );

    const res = await request(appWith(stalled)).get('/api/pipeline/health');

    expect(escalationStage(res.body).status).toBe('critical');
  });

  it('gives a fresh escalation time to be picked up', async () => {
    // One hour old: the deliberation may simply still be running.
    const res = await request(appWith([escalation('extended_discussion', 1)])).get(
      '/api/pipeline/health',
    );

    const stage = escalationStage(res.body);
    expect(stage.details.stalled).toBe(0);
    expect(stage.status).toBe('healthy');
    expect(stage.details.pendingEscalations).toBe(1);
  });
});

describe('escalation alerts', () => {
  interface Alert {
    id: string;
    severity: string;
    details?: Record<string, unknown>;
  }
  const alertsOf = async (app: Express): Promise<Alert[]> =>
    (await request(app).get('/api/pipeline/alerts')).body.alerts;

  it('warns about work waiting on people, covering both people-shaped types', async () => {
    const alerts = await alertsOf(
      appWith([escalation('human_review', 10), escalation('working_group', 10)]),
    );

    const waiting = alerts.find(a => a.id === 'escalations-awaiting-people');
    expect(waiting?.severity).toBe('warning');
    // working_group used to be missed entirely by this alert.
    expect(waiting?.details).toMatchObject({ humanReview: 1, workingGroup: 1, count: 2 });
  });

  it('raises a critical alert for a deliberation that never started', async () => {
    const alerts = await alertsOf(appWith([escalation('extended_discussion', 48)]));

    expect(alerts.find(a => a.id === 'escalations-stalled')?.severity).toBe('critical');
  });

  it('says nothing about escalations that are simply in flight', async () => {
    const alerts = await alertsOf(appWith([escalation('extended_discussion', 1)]));

    expect(alerts.find(a => a.id === 'escalations-stalled')).toBeUndefined();
    expect(alerts.find(a => a.id === 'escalations-awaiting-people')).toBeUndefined();
  });
});
