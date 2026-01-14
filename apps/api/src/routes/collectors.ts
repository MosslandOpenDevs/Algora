import { Router } from 'express';
import type { SignalCollectorService } from '../services/collectors';

export const collectorsRouter: Router = Router();

// GET /api/collectors/status - Get all collectors status
collectorsRouter.get('/status', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  try {
    const status = signalCollector.getStatus();
    const stats = signalCollector.getStats();

    res.json({ status, stats });
  } catch (error) {
    console.error('Failed to get collector status:', error);
    res.status(500).json({ error: 'Failed to get collector status' });
  }
});

// GET /api/collectors/stats - Get signal statistics
collectorsRouter.get('/stats', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  try {
    const stats = signalCollector.getStats();
    res.json({ stats });
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /api/collectors/recent - Get recent signals
collectorsRouter.get('/recent', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;
  const limit = parseInt(req.query.limit as string) || 20;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  try {
    const signals = signalCollector.getRecentSignals(limit);
    res.json({ signals });
  } catch (error) {
    console.error('Failed to get recent signals:', error);
    res.status(500).json({ error: 'Failed to get recent signals' });
  }
});

// GET /api/collectors/high-priority - Get high priority signals
collectorsRouter.get('/high-priority', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;
  const limit = parseInt(req.query.limit as string) || 10;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  try {
    const signals = signalCollector.getHighPrioritySignals(limit);
    res.json({ signals });
  } catch (error) {
    console.error('Failed to get high priority signals:', error);
    res.status(500).json({ error: 'Failed to get high priority signals' });
  }
});

// RSS Feed Management
// GET /api/collectors/rss/feeds - Get all RSS feeds
collectorsRouter.get('/rss/feeds', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  try {
    const feeds = signalCollector.getRSSCollector().getFeeds();
    res.json({ feeds });
  } catch (error) {
    console.error('Failed to get RSS feeds:', error);
    res.status(500).json({ error: 'Failed to get RSS feeds' });
  }
});

// POST /api/collectors/rss/feeds - Add new RSS feed
collectorsRouter.post('/rss/feeds', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;
  const { name, url, category, fetchInterval } = req.body;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  if (!name || !url || !category) {
    return res.status(400).json({ error: 'name, url, and category are required' });
  }

  try {
    const feed = signalCollector.getRSSCollector().addFeed({
      name,
      url,
      category,
      enabled: true,
      fetchInterval: fetchInterval || 30,
    });
    res.status(201).json({ feed });
  } catch (error) {
    console.error('Failed to add RSS feed:', error);
    res.status(500).json({ error: 'Failed to add RSS feed' });
  }
});

// DELETE /api/collectors/rss/feeds/:id - Remove RSS feed
collectorsRouter.delete('/rss/feeds/:id', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;
  const { id } = req.params;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  try {
    const success = signalCollector.getRSSCollector().removeFeed(id);
    res.json({ success });
  } catch (error) {
    console.error('Failed to remove RSS feed:', error);
    res.status(500).json({ error: 'Failed to remove RSS feed' });
  }
});

// GitHub Repo Management
// GET /api/collectors/github/repos - Get all GitHub repos
collectorsRouter.get('/github/repos', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  try {
    const repos = signalCollector.getGitHubCollector().getRepos();
    res.json({ repos });
  } catch (error) {
    console.error('Failed to get GitHub repos:', error);
    res.status(500).json({ error: 'Failed to get GitHub repos' });
  }
});

// POST /api/collectors/github/repos - Add new GitHub repo
collectorsRouter.post('/github/repos', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;
  const { owner, repo, category, fetchInterval } = req.body;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  if (!owner || !repo || !category) {
    return res.status(400).json({ error: 'owner, repo, and category are required' });
  }

  try {
    const newRepo = signalCollector.getGitHubCollector().addRepo({
      owner,
      repo,
      category,
      enabled: true,
      fetchInterval: fetchInterval || 30,
    });
    res.status(201).json({ repo: newRepo });
  } catch (error) {
    console.error('Failed to add GitHub repo:', error);
    res.status(500).json({ error: 'Failed to add GitHub repo' });
  }
});

// DELETE /api/collectors/github/repos/:id - Remove GitHub repo
collectorsRouter.delete('/github/repos/:id', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;
  const { id } = req.params;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  try {
    const success = signalCollector.getGitHubCollector().removeRepo(id);
    res.json({ success });
  } catch (error) {
    console.error('Failed to remove GitHub repo:', error);
    res.status(500).json({ error: 'Failed to remove GitHub repo' });
  }
});

// Blockchain Source Management
// GET /api/collectors/blockchain/sources - Get all blockchain sources
collectorsRouter.get('/blockchain/sources', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  try {
    const sources = signalCollector.getBlockchainCollector().getSources();
    res.json({ sources });
  } catch (error) {
    console.error('Failed to get blockchain sources:', error);
    res.status(500).json({ error: 'Failed to get blockchain sources' });
  }
});

// Social Source Management
// GET /api/collectors/social/sources - Get all social sources
collectorsRouter.get('/social/sources', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  try {
    const sources = signalCollector.getSocialCollector().getSources();
    res.json({ sources });
  } catch (error) {
    console.error('Failed to get social sources:', error);
    res.status(500).json({ error: 'Failed to get social sources' });
  }
});

// POST /api/collectors/social/sources - Add a social source
collectorsRouter.post('/social/sources', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;
  const { platform, name, endpoint, category, fetchInterval } = req.body;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  if (!platform || !name || !endpoint) {
    return res.status(400).json({ error: 'Platform, name, and endpoint are required' });
  }

  try {
    const newSource = signalCollector.getSocialCollector().addSource({
      platform,
      name,
      endpoint,
      category: category || 'general',
      enabled: true,
      fetchInterval: fetchInterval || 30,
    });
    res.status(201).json({ source: newSource });
  } catch (error) {
    console.error('Failed to add social source:', error);
    res.status(500).json({ error: 'Failed to add social source' });
  }
});

// DELETE /api/collectors/social/sources/:id - Remove a social source
collectorsRouter.delete('/social/sources/:id', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;
  const { id } = req.params;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  try {
    const success = signalCollector.getSocialCollector().removeSource(id);
    res.json({ success });
  } catch (error) {
    console.error('Failed to remove social source:', error);
    res.status(500).json({ error: 'Failed to remove social source' });
  }
});

// GET /api/collectors/social/stats - Get social collector stats
collectorsRouter.get('/social/stats', (req, res) => {
  const signalCollector: SignalCollectorService = req.app.locals.signalCollector;

  if (!signalCollector) {
    return res.status(503).json({ error: 'Signal collector not available' });
  }

  try {
    const stats = signalCollector.getSocialCollector().getStats();
    res.json({ stats });
  } catch (error) {
    console.error('Failed to get social stats:', error);
    res.status(500).json({ error: 'Failed to get social stats' });
  }
});
