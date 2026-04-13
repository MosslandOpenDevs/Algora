import { Router } from 'express';
import type Database from 'better-sqlite3';
import { requireAdmin } from '../middleware/auth';

export const budgetRouter: Router = Router();

// GET /api/budget/status - Get budget status
budgetRouter.get('/status', (req, res) => {
  const db: Database.Database = req.app.locals.db;

  try {
    const today = new Date().toISOString().split('T')[0];

    // Get config for all providers
    const configs = db.prepare('SELECT * FROM budget_config WHERE enabled = 1').all();

    // Get today's usage for all providers
    const usage = db.prepare(`
      SELECT provider, SUM(estimated_cost_usd) as total_cost, SUM(call_count) as total_calls,
             SUM(input_tokens) as total_input_tokens, SUM(output_tokens) as total_output_tokens
      FROM budget_usage
      WHERE date = ?
      GROUP BY provider
    `).all(today);

    const usageMap = new Map((usage as any[]).map(u => [u.provider, u]));

    const status = (configs as any[]).map(config => {
      const providerUsage = usageMap.get(config.provider) || {
        total_cost: 0,
        total_calls: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
      };

      return {
        provider: config.provider,
        dailyBudgetUsd: config.daily_budget_usd,
        hourlyCallLimit: config.hourly_call_limit,
        todayUsed: providerUsage.total_cost,
        todayCalls: providerUsage.total_calls,
        remainingBudget: config.daily_budget_usd - providerUsage.total_cost,
        isExhausted: providerUsage.total_cost >= config.daily_budget_usd,
        percentUsed: (providerUsage.total_cost / config.daily_budget_usd) * 100,
      };
    });

    res.json({ status, date: today });
  } catch (error) {
    console.error('Failed to fetch budget status:', error);
    res.status(500).json({ error: 'Failed to fetch budget status' });
  }
});

// GET /api/budget/status/:provider - Get budget status for specific provider
budgetRouter.get('/status/:provider', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { provider } = req.params;

  try {
    const today = new Date().toISOString().split('T')[0];

    const config = db.prepare('SELECT * FROM budget_config WHERE provider = ?').get(provider);
    if (!config) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const usage = db.prepare(`
      SELECT SUM(estimated_cost_usd) as total_cost, SUM(call_count) as total_calls,
             SUM(input_tokens) as total_input_tokens, SUM(output_tokens) as total_output_tokens
      FROM budget_usage
      WHERE provider = ? AND date = ?
    `).get(provider, today) as any;

    const status = {
      provider,
      dailyBudgetUsd: (config as any).daily_budget_usd,
      hourlyCallLimit: (config as any).hourly_call_limit,
      todayUsed: usage?.total_cost || 0,
      todayCalls: usage?.total_calls || 0,
      remainingBudget: (config as any).daily_budget_usd - (usage?.total_cost || 0),
      isExhausted: (usage?.total_cost || 0) >= (config as any).daily_budget_usd,
      percentUsed: ((usage?.total_cost || 0) / (config as any).daily_budget_usd) * 100,
    };

    res.json({ status, date: today });
  } catch (error) {
    console.error('Failed to fetch budget status:', error);
    res.status(500).json({ error: 'Failed to fetch budget status' });
  }
});

// PATCH /api/budget/config/:provider - Update budget config (Admin only)
budgetRouter.patch('/config/:provider', requireAdmin, (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { provider } = req.params;
  const { dailyBudgetUsd, hourlyCallLimit, enabled } = req.body;

  try {
    db.prepare(`
      UPDATE budget_config
      SET daily_budget_usd = COALESCE(?, daily_budget_usd),
          hourly_call_limit = COALESCE(?, hourly_call_limit),
          enabled = COALESCE(?, enabled)
      WHERE provider = ?
    `).run(dailyBudgetUsd, hourlyCallLimit, enabled, provider);

    const config = db.prepare('SELECT * FROM budget_config WHERE provider = ?').get(provider);

    res.json({ config });
  } catch (error) {
    console.error('Failed to update budget config:', error);
    res.status(500).json({ error: 'Failed to update budget config' });
  }
});

// GET /api/budget/history - Get usage history
budgetRouter.get('/history', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { days = '7', provider } = req.query;

  try {
    let query = `
      SELECT date, provider, SUM(estimated_cost_usd) as total_cost, SUM(call_count) as total_calls
      FROM budget_usage
      WHERE date >= date('now', '-' || ? || ' days')
    `;
    const params: any[] = [parseInt(days as string)];

    if (provider) {
      query += ' AND provider = ?';
      params.push(provider);
    }

    query += ' GROUP BY date, provider ORDER BY date DESC';

    const history = db.prepare(query).all(...params);

    res.json({ history });
  } catch (error) {
    console.error('Failed to fetch budget history:', error);
    res.status(500).json({ error: 'Failed to fetch budget history' });
  }
});
