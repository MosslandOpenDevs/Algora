import { Router } from 'express';
import type Database from 'better-sqlite3';
import { stripMarkdown } from '@algora/core';

export const searchRouter: Router = Router();

interface SearchResult {
  id: string;
  type: 'agent' | 'proposal' | 'issue' | 'signal' | 'session';
  title: string;
  description?: string;
  status?: string;
  createdAt?: string;
  url: string;
}

// GET /api/search - Global search across all entities
searchRouter.get('/', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { q: query, type, limit = '20' } = req.query;

  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const searchLimit = Math.min(parseInt(limit as string) || 20, 100);
  const searchTerm = `%${query.toLowerCase()}%`;
  const results: SearchResult[] = [];

  try {
    // Search agents
    if (!type || type === 'agent') {
      // The agents table has no description column (the roster schema uses
      // persona fields) -- selecting one made every /api/search request 500.
      const agents = db.prepare(`
        SELECT id, name, display_name, expertise, speaking_style, group_name
        FROM agents
        WHERE is_active = 1
        AND (
          LOWER(name) LIKE ?
          OR LOWER(display_name) LIKE ?
          OR LOWER(COALESCE(expertise, '')) LIKE ?
          OR LOWER(group_name) LIKE ?
        )
        LIMIT ?
      `).all(searchTerm, searchTerm, searchTerm, searchTerm, searchLimit) as Array<{
        id: string;
        name: string;
        display_name: string;
        expertise: string | null;
        speaking_style: string | null;
        group_name: string;
      }>;

      for (const agent of agents) {
        results.push({
          id: agent.id,
          type: 'agent',
          title: agent.display_name,
          description: (agent.expertise || agent.speaking_style || agent.group_name)?.substring(0, 100),
          url: `/agents/${agent.id}`,
        });
      }
    }

    // Search proposals
    if (!type || type === 'proposal') {
      const proposals = db.prepare(`
        SELECT id, title, description, status, created_at
        FROM proposals
        WHERE LOWER(title) LIKE ?
        OR LOWER(description) LIKE ?
        LIMIT ?
      `).all(searchTerm, searchTerm, searchLimit) as Array<{
        id: string;
        title: string;
        description: string;
        status: string;
        created_at: string;
      }>;

      for (const proposal of proposals) {
        results.push({
          id: proposal.id,
          type: 'proposal',
          title: proposal.title,
          description: proposal.description ? stripMarkdown(proposal.description).substring(0, 100) : undefined,
          status: proposal.status,
          createdAt: proposal.created_at,
          url: `/proposals/${proposal.id}`,
        });
      }
    }

    // Search issues
    if (!type || type === 'issue') {
      const issues = db.prepare(`
        SELECT id, title, description, status, priority, created_at
        FROM issues
        WHERE LOWER(title) LIKE ?
        OR LOWER(description) LIKE ?
        LIMIT ?
      `).all(searchTerm, searchTerm, searchLimit) as Array<{
        id: string;
        title: string;
        description: string;
        status: string;
        priority: string;
        created_at: string;
      }>;

      for (const issue of issues) {
        results.push({
          id: issue.id,
          type: 'issue',
          title: issue.title,
          description: issue.description ? stripMarkdown(issue.description).substring(0, 100) : undefined,
          status: `${issue.priority} - ${issue.status}`,
          createdAt: issue.created_at,
          url: `/issues/${issue.id}`,
        });
      }
    }

    // Search signals
    if (!type || type === 'signal') {
      // Signals have no title/summary columns -- the headline lives in
      // description, alongside source/category/severity.
      const signals = db.prepare(`
        SELECT id, description, source, category, severity, timestamp
        FROM signals
        WHERE LOWER(description) LIKE ?
        OR LOWER(source) LIKE ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(searchTerm, searchTerm, searchLimit) as Array<{
        id: string;
        description: string;
        source: string;
        category: string;
        severity: string;
        timestamp: string;
      }>;

      for (const signal of signals) {
        const headline = signal.description ? stripMarkdown(signal.description) : '';
        results.push({
          id: signal.id,
          type: 'signal',
          title: headline.substring(0, 80) || signal.source,
          description: `${signal.source} · ${signal.category}`,
          status: signal.severity,
          createdAt: signal.timestamp,
          url: `/signals/${signal.id}`,
        });
      }
    }

    // Search agora sessions
    if (!type || type === 'session') {
      const sessions = db.prepare(`
        SELECT id, title, description, status, created_at
        FROM agora_sessions
        WHERE LOWER(title) LIKE ?
        OR LOWER(description) LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(searchTerm, searchTerm, searchLimit) as Array<{
        id: string;
        title: string;
        description: string;
        status: string;
        created_at: string;
      }>;

      for (const session of sessions) {
        results.push({
          id: session.id,
          type: 'session',
          title: session.title,
          description: session.description?.substring(0, 100),
          status: session.status,
          createdAt: session.created_at,
          url: `/agora/${session.id}`,
        });
      }
    }

    // Sort by relevance (exact title matches first, then by date)
    results.sort((a, b) => {
      const aExact = a.title.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
      const bExact = b.title.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      // Then by date
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate;
    });

    res.json({
      query,
      count: results.length,
      results: results.slice(0, searchLimit),
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/search/suggestions - Get search suggestions
searchRouter.get('/suggestions', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { q: query } = req.query;

  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.json({ suggestions: [] });
  }

  const searchTerm = `%${query.toLowerCase()}%`;
  const suggestions: string[] = [];

  try {
    // Get agent names
    const agents = db.prepare(`
      SELECT DISTINCT display_name FROM agents
      WHERE is_active = 1 AND LOWER(display_name) LIKE ?
      LIMIT 3
    `).all(searchTerm) as Array<{ display_name: string }>;
    suggestions.push(...agents.map(a => a.display_name));

    // Get proposal titles
    const proposals = db.prepare(`
      SELECT DISTINCT title FROM proposals
      WHERE LOWER(title) LIKE ?
      LIMIT 3
    `).all(searchTerm) as Array<{ title: string }>;
    suggestions.push(...proposals.map(p => p.title));

    // Get issue titles
    const issues = db.prepare(`
      SELECT DISTINCT title FROM issues
      WHERE LOWER(title) LIKE ?
      LIMIT 3
    `).all(searchTerm) as Array<{ title: string }>;
    suggestions.push(...issues.map(i => i.title));

    // Remove duplicates and limit
    const uniqueSuggestions = [...new Set(suggestions)].slice(0, 8);

    res.json({ suggestions: uniqueSuggestions });
  } catch (error) {
    console.error('Suggestions error:', error);
    res.json({ suggestions: [] });
  }
});
