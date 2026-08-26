import { statSync } from 'fs';
import { Router } from 'express';

export const healthRouter: Router = Router();

healthRouter.get('/', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    // The engine page displayed a literal "24.5 MB" for this. Reported as
    // null rather than a guess when it cannot be read, so the page can say so.
    dbSizeBytes: databaseSizeBytes(req.app.locals.db),
  });
});

/** On-disk size of the SQLite file, or null if it cannot be measured. */
function databaseSizeBytes(db: { name?: string } | undefined): number | null {
  if (!db?.name) return null;
  try {
    // WAL content is only in the database file after a checkpoint, so this is
    // the durable size rather than the instantaneous one. Health must not fail
    // over a stat, hence the catch.
    return statSync(db.name).size;
  } catch {
    return null;
  }
}
