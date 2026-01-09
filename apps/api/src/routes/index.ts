import { Express, Router } from 'express';
import { healthRouter } from './health';
import { agentsRouter } from './agents';
import { agoraRouter } from './agora';
import { signalsRouter } from './signals';
import { issuesRouter } from './issues';
import { proposalsRouter } from './proposals';
import { budgetRouter } from './budget';
import { activityRouter } from './activity';
import { statsRouter } from './stats';
import { chatterRouter } from './chatter';

export function setupRoutes(app: Express): void {
  const apiRouter = Router();

  // Mount route modules
  apiRouter.use('/health', healthRouter);
  apiRouter.use('/agents', agentsRouter);
  apiRouter.use('/agora', agoraRouter);
  apiRouter.use('/signals', signalsRouter);
  apiRouter.use('/issues', issuesRouter);
  apiRouter.use('/proposals', proposalsRouter);
  apiRouter.use('/budget', budgetRouter);
  apiRouter.use('/activity', activityRouter);
  apiRouter.use('/stats', statsRouter);
  apiRouter.use('/chatter', chatterRouter);

  // Mount API router
  app.use('/api', apiRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource was not found',
    });
  });

  // Error handler
  app.use((err: Error, _req: Express.Request, res: Express.Response, _next: Express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    });
  });
}
