import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { logMonitorService } from '../services/log-monitor';
import { writeLimiter } from '../middleware/rate-limit';
import { requireAdmin } from '../middleware/auth';

export const logsRouter: RouterType = Router();

// Log output can contain internal paths, request details, and operational
// failures. Gate the router once so every current and future log endpoint is
// fail-closed instead of relying on each handler to remember the middleware.
logsRouter.use(requireAdmin);

function parseBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) return null;
  return Math.min(parsed, max);
}

/**
 * GET /api/logs/stats
 * Get aggregated log statistics
 */
logsRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await logMonitorService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[Logs] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get log stats' });
  }
});

/**
 * GET /api/logs/files
 * Get list of log files
 */
logsRouter.get('/files', (_req: Request, res: Response) => {
  try {
    const files = logMonitorService.getLogFiles();
    const diskUsage = logMonitorService.getDiskUsage();
    res.json({ files, diskUsage });
  } catch (error) {
    console.error('[Logs] Error getting files:', error);
    res.status(500).json({ error: 'Failed to get log files' });
  }
});

/**
 * GET /api/logs/recent/:fileName
 * Get recent logs from a specific file
 */
logsRouter.get('/recent/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;
    const limit = parseBoundedInteger(req.query.limit, 100, 1, 1000);
    if (limit === null) {
      return res.status(400).json({ error: 'limit must be a positive integer' });
    }

    // Only files returned by getLogFiles are readable. That method excludes
    // symlinks and non-.log entries, so a name inside the directory cannot be
    // used to expose some other operational file.
    if (
      fileName.includes('..') ||
      fileName.includes('/') ||
      !logMonitorService.getLogFiles().some(file => file.name === fileName)
    ) {
      return res.status(400).json({ error: 'Invalid file name' });
    }

    const entries = await logMonitorService.getRecentLogs(fileName, limit);
    res.json({ entries, count: entries.length });
  } catch (error) {
    console.error('[Logs] Error getting recent logs:', error);
    res.status(500).json({ error: 'Failed to get recent logs' });
  }
});

/**
 * GET /api/logs/search
 * Search logs with filters
 */
logsRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const {
      query,
      level,
      module,
      startDate,
      endDate,
      limit = '100',
      offset = '0',
    } = req.query;

    const parsedLimit = parseBoundedInteger(limit, 100, 1, 500);
    const parsedOffset = parseBoundedInteger(offset, 0, 0, Number.MAX_SAFE_INTEGER);
    if (parsedLimit === null || parsedOffset === null) {
      return res.status(400).json({
        error: 'limit must be a positive integer and offset a non-negative integer',
      });
    }

    if (
      (level !== undefined &&
        (typeof level !== 'string' || !['info', 'warn', 'error'].includes(level))) ||
      [query, module, startDate, endDate].some(
        value => value !== undefined && typeof value !== 'string'
      )
    ) {
      return res.status(400).json({ error: 'Invalid search filters' });
    }

    const result = await logMonitorService.searchLogs({
      query: query as string | undefined,
      level: level as 'info' | 'warn' | 'error' | undefined,
      module: module as string | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    res.json(result);
  } catch (error) {
    console.error('[Logs] Error searching logs:', error);
    res.status(500).json({ error: 'Failed to search logs' });
  }
});

/**
 * GET /api/logs/errors/today
 * Get today's error summary
 */
logsRouter.get('/errors/today', async (_req: Request, res: Response) => {
  try {
    const summary = await logMonitorService.getTodayErrorSummary();
    res.json(summary);
  } catch (error) {
    console.error('[Logs] Error getting today errors:', error);
    res.status(500).json({ error: 'Failed to get today errors' });
  }
});

/**
 * DELETE /api/logs/cleanup
 * Clean up old log files (admin only)
 * Query: daysToKeep (default: 30)
 */
logsRouter.delete('/cleanup', writeLimiter, (req: Request, res: Response) => {
  try {
    const daysToKeep = parseInt(req.query.daysToKeep as string) || 30;

    if (daysToKeep < 7) {
      return res.status(400).json({ error: 'Minimum retention is 7 days' });
    }

    const result = logMonitorService.clearOldLogs(daysToKeep);
    res.json({
      message: `Cleaned up logs older than ${daysToKeep} days`,
      ...result,
    });
  } catch (error) {
    console.error('[Logs] Error cleaning up:', error);
    res.status(500).json({ error: 'Failed to clean up logs' });
  }
});

/**
 * GET /api/logs/disk-usage
 * Get disk usage summary
 */
logsRouter.get('/disk-usage', (_req: Request, res: Response) => {
  try {
    const diskUsage = logMonitorService.getDiskUsage();
    const files = logMonitorService.getLogFiles();

    const byType = {
      out: files.filter(f => f.type === 'out').reduce((sum, f) => sum + f.size, 0),
      error: files.filter(f => f.type === 'error').reduce((sum, f) => sum + f.size, 0),
    };

    res.json({
      ...diskUsage,
      byType: {
        out: { bytes: byType.out, mb: (byType.out / 1024 / 1024).toFixed(2) },
        error: { bytes: byType.error, mb: (byType.error / 1024 / 1024).toFixed(2) },
      },
      fileCount: files.length,
    });
  } catch (error) {
    console.error('[Logs] Error getting disk usage:', error);
    res.status(500).json({ error: 'Failed to get disk usage' });
  }
});
