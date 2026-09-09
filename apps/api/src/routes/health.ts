import { Router } from 'express';

export const healthRouter: Router = Router();

// Deliberately narrow, like the root /health: this takes no credential, so it
// answers "is the process up?" and nothing else. Process uptime, resident
// memory and the database file's size are host-side operating detail — an
// operator reads them from the host, not from an endpoint anyone can poll.
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

