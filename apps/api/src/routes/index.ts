import { Express, Router, Request, Response, NextFunction } from 'express';
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
import { collectorsRouter } from './collectors';
import { outcomesRouter } from './outcomes';
import { tokenRouter } from './token';
import { disclosureRouter } from './disclosure';
import { searchRouter } from './search';
import { alertsRouter } from './alerts';
import { passiveConsensusRouter } from './passive-consensus';
import { ragRouter } from './rag';
import { qualityRouter } from './quality';
import { timelineRouter } from './timeline';
import governanceOSRouter from './governance-os';

export function setupRoutes(app: Express): void {
  const apiRouter: Router = Router();

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
  apiRouter.use('/collectors', collectorsRouter);
  apiRouter.use('/outcomes', outcomesRouter);
  apiRouter.use('/token', tokenRouter);
  apiRouter.use('/disclosure', disclosureRouter);
  apiRouter.use('/search', searchRouter);
  apiRouter.use('/alerts', alertsRouter);
  apiRouter.use('/passive-consensus', passiveConsensusRouter);
  apiRouter.use('/rag', ragRouter);
  apiRouter.use('/quality', qualityRouter);
  apiRouter.use('/timeline', timelineRouter);
  apiRouter.use('/governance-os', governanceOSRouter);

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
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    });
  });
}
