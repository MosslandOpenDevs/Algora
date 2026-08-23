/**
 * Every GET route must answer. None may return 500.
 *
 * Four defects this month were the same shape: an endpoint that returned 500
 * on every request while nothing noticed. `/api/timeline/issue/:id` did it for
 * two weeks across all 2,553 issues that had a deliberation; three
 * `/api/outcomes/analytics/*` routes did it on every call. Each was found by
 * reading production logs by hand, because no test ever asked the API for a
 * response.
 *
 * `db/schema-conformance.test.ts` now catches the SQL half of that class before
 * it ships. This catches the rest — anything that throws once a request is
 * actually served — and it found one on the first run:
 * `/api/governance-os/documents/:id` returned 500 for a document that does not
 * exist, because `getDocument` was typed `Promise<Document | null>` while the
 * registry underneath threw. The route's `if (!doc) return 404` branch could
 * never be reached.
 *
 * What each status means here:
 *
 *   200/400/404  the handler ran and decided — fine
 *   503          the route reports its dependency is missing, which is the
 *                correct answer in a fixture that does not wire every service
 *   500          the handler threw. Always a defect.
 *
 * The fixture wires the services that construct from `(db, io)` alone, which is
 * most of them. It deliberately does not reproduce the whole of `index.ts`:
 * routes whose dependency is absent answer 503 by design, and a fixture that
 * drifts from production wiring is worse than one that is obviously partial.
 */

import express, { type Express } from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { describe, expect, it } from 'vitest';

import { createSchema } from '../db';
import { setupRoutes } from './index';
import { GovernanceService } from '../services/governance';
import { ProofOfOutcomeService } from '../services/proof-of-outcome';
import { TokenIntegrationService } from '../services/token';
import { SignatureService } from '../services/signature';
import { DisclosureService } from '../services/disclosure';
import { GovernanceOSBridge } from '../services/governance-os-bridge';
import { ReportGeneratorService } from '../services/report-generator';

/** A value that matches no seeded row, so every :param route takes its miss path. */
const ABSENT_ID = 'route-smoke-absent-id';

interface ExpressLayer {
  route?: { path: string; methods?: Record<string, boolean> };
  name?: string;
  regexp?: RegExp;
  handle?: { stack?: ExpressLayer[] };
}

/** Every GET path express will actually serve, mount prefixes included. */
function collectGetPaths(app: Express): string[] {
  const out: string[] = [];

  const walk = (stack: ExpressLayer[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        if (layer.route.methods?.get) out.push(prefix + layer.route.path);
        continue;
      }
      if (layer.name !== 'router' || !layer.handle?.stack) continue;

      const mount = (layer.regexp?.source ?? '')
        .replace('^\\/', '/')
        .replace('\\/?(?=\\/|$)', '')
        .replace(/\\\//g, '/')
        .replace(/\$$/, '');
      walk(layer.handle.stack, prefix + (mount === '/(?:/)?' ? '' : mount));
    }
  };

  walk((app as unknown as { _router: { stack: ExpressLayer[] } })._router.stack, '');
  return [...new Set(out)];
}

function appWithServices(): Express {
  const db = new Database(':memory:');
  createSchema(db);

  // Nothing here asserts on socket traffic; these are the two methods the
  // services call.
  const io = { emit: () => undefined, on: () => undefined } as unknown as SocketServer;
  const governance = new GovernanceService(db, io);

  const app = express();
  app.locals.db = db;
  app.locals.io = io;
  app.locals.governance = governance;
  app.locals.proposalService = governance.proposals;
  app.locals.proofOfOutcome = new ProofOfOutcomeService(db, io);
  app.locals.tokenIntegration = new TokenIntegrationService(db, io);
  app.locals.signatureService = new SignatureService(db, false);
  app.locals.disclosure = new DisclosureService(db, io);
  app.locals.governanceOSBridge = new GovernanceOSBridge(db, io);
  app.locals.reportGenerator = new ReportGeneratorService(db, io);
  setupRoutes(app);
  return app;
}

describe('every GET route answers without throwing', () => {
  const app = appWithServices();
  const paths = collectGetPaths(app);

  it('finds the route table', () => {
    // Guards the collector: if express changed shape and this returned nothing,
    // the sweep below would pass while checking nothing.
    expect(paths.length).toBeGreaterThan(100);
  });

  it('returns no 500 for any route', async () => {
    const failures: string[] = [];

    for (const path of paths) {
      const url = path.replace(/:[A-Za-z]+/g, ABSENT_ID);
      const res = await request(app).get(url);
      if (res.status === 500) {
        failures.push(`GET ${url} -> 500 ${JSON.stringify(res.body).slice(0, 160)}`);
      }
    }

    expect(failures).toEqual([]);
  }, 120_000);

  it('answers a missing document with 404 rather than a server error', async () => {
    // The regression this sweep found: getDocument promised `Document | null`
    // while the registry threw, so the route's 404 branch was unreachable.
    const res = await request(app).get(`/api/governance-os/documents/${ABSENT_ID}`);

    expect(res.status).toBe(404);
  });
});
