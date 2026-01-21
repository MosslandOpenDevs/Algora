import { Router } from 'express';
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { cache, CACHE_TTL } from '../lib/cache';

const CACHE_KEY_TIMELINE = 'timeline:';

export const timelineRouter: Router = Router();

// Timeline event types
type TimelineEventType = 'signal' | 'issue' | 'agora_session' | 'proposal' | 'vote' | 'execution';

interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: string;
  title: string;
  description: string;
  status?: string;
  metadata: Record<string, unknown>;
  linkedId?: string; // ID of the parent entity (e.g., issue_id for proposal)
}

interface TimelineResponse {
  events: TimelineEvent[];
  count: number;
  issueId?: string;
}

// GET /api/timeline - Get recent governance timeline events
timelineRouter.get('/', (req: Request, res: Response) => {
  const db = req.app.locals.db as Database.Database;
  const { limit = 50, offset = 0, type } = req.query;

  try {
    const events: TimelineEvent[] = [];
    const limitNum = Math.min(Number(limit), 100);
    const offsetNum = Number(offset);

    // Collect events from each source
    if (!type || type === 'signal') {
      const signals = db.prepare(`
        SELECT id, source, timestamp, category, severity, description, metadata
        FROM signals
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `).all(limitNum, offsetNum) as Array<{
        id: string;
        source: string;
        timestamp: string;
        category: string;
        severity: string;
        description: string;
        metadata: string | null;
      }>;

      for (const s of signals) {
        events.push({
          id: s.id,
          type: 'signal',
          timestamp: s.timestamp,
          title: `Signal: ${s.category}`,
          description: s.description || `${s.severity} severity signal from ${s.source}`,
          status: s.severity,
          metadata: {
            source: s.source,
            category: s.category,
            severity: s.severity,
            ...(s.metadata ? JSON.parse(s.metadata) : {}),
          },
        });
      }
    }

    if (!type || type === 'issue') {
      const issues = db.prepare(`
        SELECT id, title, description, category, priority, status, detected_at, resolved_at
        FROM issues
        ORDER BY detected_at DESC
        LIMIT ? OFFSET ?
      `).all(limitNum, offsetNum) as Array<{
        id: string;
        title: string;
        description: string;
        category: string;
        priority: string;
        status: string;
        detected_at: string;
        resolved_at: string | null;
      }>;

      for (const i of issues) {
        events.push({
          id: i.id,
          type: 'issue',
          timestamp: i.detected_at,
          title: i.title,
          description: i.description || `${i.priority} priority ${i.category} issue`,
          status: i.status,
          metadata: {
            category: i.category,
            priority: i.priority,
            resolvedAt: i.resolved_at,
          },
        });
      }
    }

    if (!type || type === 'proposal') {
      const proposals = db.prepare(`
        SELECT id, title, description, status, issue_id, voting_starts, voting_ends, created_at, tally
        FROM proposals
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(limitNum, offsetNum) as Array<{
        id: string;
        title: string;
        description: string;
        status: string;
        issue_id: string | null;
        voting_starts: string;
        voting_ends: string;
        created_at: string;
        tally: string | null;
      }>;

      for (const p of proposals) {
        events.push({
          id: p.id,
          type: 'proposal',
          timestamp: p.created_at,
          title: p.title,
          description: p.description || 'Governance proposal',
          status: p.status,
          linkedId: p.issue_id || undefined,
          metadata: {
            votingStarts: p.voting_starts,
            votingEnds: p.voting_ends,
            tally: p.tally ? JSON.parse(p.tally) : null,
          },
        });
      }
    }

    if (!type || type === 'vote') {
      const votes = db.prepare(`
        SELECT v.id, v.proposal_id, v.voter, v.choice, v.weight, v.reason, v.created_at,
               p.title as proposal_title
        FROM votes v
        JOIN proposals p ON v.proposal_id = p.id
        ORDER BY v.created_at DESC
        LIMIT ? OFFSET ?
      `).all(limitNum, offsetNum) as Array<{
        id: string;
        proposal_id: string;
        voter: string;
        choice: string;
        weight: number;
        reason: string | null;
        created_at: string;
        proposal_title: string;
      }>;

      for (const v of votes) {
        events.push({
          id: v.id,
          type: 'vote',
          timestamp: v.created_at,
          title: `Vote: ${v.choice}`,
          description: v.reason || `${v.voter} voted ${v.choice} on "${v.proposal_title}"`,
          status: v.choice,
          linkedId: v.proposal_id,
          metadata: {
            voter: v.voter,
            choice: v.choice,
            weight: v.weight,
            proposalTitle: v.proposal_title,
          },
        });
      }
    }

    // Sort all events by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply global limit
    const limitedEvents = events.slice(0, limitNum);

    res.json({
      events: limitedEvents,
      count: limitedEvents.length,
    });
  } catch (error) {
    console.error('[Timeline] Failed to fetch events:', error);
    res.status(500).json({ error: 'Failed to fetch timeline events' });
  }
});

// GET /api/timeline/issue/:issueId - Get complete timeline for a specific issue
timelineRouter.get('/issue/:issueId', (req: Request, res: Response) => {
  const db = req.app.locals.db as Database.Database;
  const { issueId } = req.params;

  try {
    const events: TimelineEvent[] = [];

    // Get the issue
    const issue = db.prepare(`
      SELECT id, title, description, category, priority, status, detected_at, resolved_at, signal_ids
      FROM issues WHERE id = ?
    `).get(issueId) as {
      id: string;
      title: string;
      description: string;
      category: string;
      priority: string;
      status: string;
      detected_at: string;
      resolved_at: string | null;
      signal_ids: string | null;
    } | undefined;

    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    // Get related signals
    const signalRows = db.prepare(`
      SELECT s.id, s.source, s.timestamp, s.category, s.severity, s.description
      FROM signals s
      JOIN issue_signals iss ON s.id = iss.signal_id
      WHERE iss.issue_id = ?
      ORDER BY s.timestamp ASC
    `).all(issueId) as Array<{
      id: string;
      source: string;
      timestamp: string;
      category: string;
      severity: string;
      description: string;
    }>;

    // Fallback to signal_ids if junction table is empty
    if (signalRows.length === 0 && issue.signal_ids) {
      const signalIds = JSON.parse(issue.signal_ids) as string[];
      if (signalIds.length > 0) {
        const placeholders = signalIds.map(() => '?').join(',');
        const signals = db.prepare(`
          SELECT id, source, timestamp, category, severity, description
          FROM signals WHERE id IN (${placeholders})
          ORDER BY timestamp ASC
        `).all(...signalIds) as Array<{
          id: string;
          source: string;
          timestamp: string;
          category: string;
          severity: string;
          description: string;
        }>;
        signalRows.push(...signals);
      }
    }

    // Add signal events
    for (const s of signalRows) {
      events.push({
        id: s.id,
        type: 'signal',
        timestamp: s.timestamp,
        title: `Signal: ${s.category}`,
        description: s.description || `${s.severity} severity from ${s.source}`,
        status: s.severity,
        metadata: { source: s.source, category: s.category, severity: s.severity },
      });
    }

    // Add issue event
    events.push({
      id: issue.id,
      type: 'issue',
      timestamp: issue.detected_at,
      title: issue.title,
      description: issue.description || `${issue.priority} priority issue detected`,
      status: issue.status,
      metadata: {
        category: issue.category,
        priority: issue.priority,
        resolvedAt: issue.resolved_at,
      },
    });

    // Get Agora sessions
    const sessions = db.prepare(`
      SELECT id, title, status, round_count, created_at, completed_at
      FROM agora_sessions WHERE issue_id = ?
      ORDER BY created_at ASC
    `).all(issueId) as Array<{
      id: string;
      title: string;
      status: string;
      round_count: number;
      created_at: string;
      completed_at: string | null;
    }>;

    for (const s of sessions) {
      events.push({
        id: s.id,
        type: 'agora_session',
        timestamp: s.created_at,
        title: `Agora: ${s.title || 'Deliberation Session'}`,
        description: `${s.round_count} rounds of agent deliberation`,
        status: s.status,
        linkedId: issueId,
        metadata: {
          roundCount: s.round_count,
          completedAt: s.completed_at,
        },
      });
    }

    // Get proposals linked to this issue
    const proposals = db.prepare(`
      SELECT id, title, description, status, voting_starts, voting_ends, created_at, tally
      FROM proposals WHERE issue_id = ?
      ORDER BY created_at ASC
    `).all(issueId) as Array<{
      id: string;
      title: string;
      description: string;
      status: string;
      voting_starts: string;
      voting_ends: string;
      created_at: string;
      tally: string | null;
    }>;

    for (const p of proposals) {
      events.push({
        id: p.id,
        type: 'proposal',
        timestamp: p.created_at,
        title: p.title,
        description: p.description || 'Governance proposal',
        status: p.status,
        linkedId: issueId,
        metadata: {
          votingStarts: p.voting_starts,
          votingEnds: p.voting_ends,
          tally: p.tally ? JSON.parse(p.tally) : null,
        },
      });

      // Get votes for this proposal
      const votes = db.prepare(`
        SELECT id, voter, choice, weight, reason, created_at
        FROM votes WHERE proposal_id = ?
        ORDER BY created_at ASC
      `).all(p.id) as Array<{
        id: string;
        voter: string;
        choice: string;
        weight: number;
        reason: string | null;
        created_at: string;
      }>;

      for (const v of votes) {
        events.push({
          id: v.id,
          type: 'vote',
          timestamp: v.created_at,
          title: `Vote: ${v.choice}`,
          description: v.reason || `${v.voter} voted ${v.choice}`,
          status: v.choice,
          linkedId: p.id,
          metadata: {
            voter: v.voter,
            choice: v.choice,
            weight: v.weight,
            proposalId: p.id,
          },
        });
      }

      // Check for execution (passed proposals)
      if (p.status === 'executed' || p.status === 'passed') {
        events.push({
          id: `exec-${p.id}`,
          type: 'execution',
          timestamp: p.tally ? new Date().toISOString() : p.voting_ends,
          title: p.status === 'executed' ? 'Executed' : 'Passed',
          description: `Proposal "${p.title}" ${p.status}`,
          status: p.status,
          linkedId: p.id,
          metadata: {
            proposalId: p.id,
            tally: p.tally ? JSON.parse(p.tally) : null,
          },
        });
      }
    }

    // Sort by timestamp
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.json({
      events,
      count: events.length,
      issueId,
      issue: {
        id: issue.id,
        title: issue.title,
        status: issue.status,
        category: issue.category,
        priority: issue.priority,
      },
    });
  } catch (error) {
    console.error('[Timeline] Failed to fetch issue timeline:', error);
    res.status(500).json({ error: 'Failed to fetch issue timeline' });
  }
});

// GET /api/timeline/proposal/:proposalId - Get timeline for a specific proposal
timelineRouter.get('/proposal/:proposalId', (req: Request, res: Response) => {
  const db = req.app.locals.db as Database.Database;
  const { proposalId } = req.params;

  try {
    const events: TimelineEvent[] = [];

    // Get the proposal
    const proposal = db.prepare(`
      SELECT id, title, description, status, issue_id, voting_starts, voting_ends, created_at, tally
      FROM proposals WHERE id = ?
    `).get(proposalId) as {
      id: string;
      title: string;
      description: string;
      status: string;
      issue_id: string | null;
      voting_starts: string;
      voting_ends: string;
      created_at: string;
      tally: string | null;
    } | undefined;

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Add proposal creation event
    events.push({
      id: proposal.id,
      type: 'proposal',
      timestamp: proposal.created_at,
      title: 'Proposal Created',
      description: proposal.title,
      status: 'draft',
      metadata: { stage: 'creation' },
    });

    // Add voting start event if voting has started
    if (new Date(proposal.voting_starts) <= new Date()) {
      events.push({
        id: `voting-start-${proposal.id}`,
        type: 'proposal',
        timestamp: proposal.voting_starts,
        title: 'Voting Started',
        description: `Voting opened for "${proposal.title}"`,
        status: 'voting',
        metadata: { stage: 'voting_start' },
      });
    }

    // Get all votes
    const votes = db.prepare(`
      SELECT id, voter, choice, weight, reason, created_at
      FROM votes WHERE proposal_id = ?
      ORDER BY created_at ASC
    `).all(proposalId) as Array<{
      id: string;
      voter: string;
      choice: string;
      weight: number;
      reason: string | null;
      created_at: string;
    }>;

    for (const v of votes) {
      events.push({
        id: v.id,
        type: 'vote',
        timestamp: v.created_at,
        title: `Vote: ${v.choice}`,
        description: v.reason || `${v.voter} voted ${v.choice}`,
        status: v.choice,
        linkedId: proposalId,
        metadata: {
          voter: v.voter,
          choice: v.choice,
          weight: v.weight,
        },
      });
    }

    // Add voting end / result event
    if (proposal.status === 'passed' || proposal.status === 'rejected' || proposal.status === 'executed') {
      events.push({
        id: `result-${proposal.id}`,
        type: 'execution',
        timestamp: proposal.voting_ends,
        title: proposal.status === 'executed' ? 'Executed' : proposal.status === 'passed' ? 'Passed' : 'Rejected',
        description: `Proposal ${proposal.status}`,
        status: proposal.status,
        metadata: {
          tally: proposal.tally ? JSON.parse(proposal.tally) : null,
          stage: 'result',
        },
      });
    }

    // Sort by timestamp
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.json({
      events,
      count: events.length,
      proposalId,
      proposal: {
        id: proposal.id,
        title: proposal.title,
        status: proposal.status,
        issueId: proposal.issue_id,
      },
    });
  } catch (error) {
    console.error('[Timeline] Failed to fetch proposal timeline:', error);
    res.status(500).json({ error: 'Failed to fetch proposal timeline' });
  }
});

// GET /api/timeline/stats - Get timeline statistics (with caching)
timelineRouter.get('/stats', (req: Request, res: Response) => {
  const db = req.app.locals.db as Database.Database;

  try {
    const today = new Date().toISOString().split('T')[0];

    const result = cache.getOrSetSync(`${CACHE_KEY_TIMELINE}stats:${today}`, () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const stats = {
        today: {
          signals: 0,
          issues: 0,
          proposals: 0,
          votes: 0,
        },
        week: {
          signals: 0,
          issues: 0,
          proposals: 0,
          votes: 0,
        },
        totals: {
          signals: 0,
          issues: 0,
          proposals: 0,
          votes: 0,
        },
        recentFlow: [] as Array<{
          issueId: string;
          issueTitle: string;
          signalCount: number;
          proposalCount: number;
          voteCount: number;
          status: string;
        }>,
      };

      // Today's counts
      stats.today.signals = (db.prepare(`SELECT COUNT(*) as c FROM signals WHERE DATE(timestamp) = ?`).get(today) as { c: number }).c;
      stats.today.issues = (db.prepare(`SELECT COUNT(*) as c FROM issues WHERE DATE(detected_at) = ?`).get(today) as { c: number }).c;
      stats.today.proposals = (db.prepare(`SELECT COUNT(*) as c FROM proposals WHERE DATE(created_at) = ?`).get(today) as { c: number }).c;
      stats.today.votes = (db.prepare(`SELECT COUNT(*) as c FROM votes WHERE DATE(created_at) = ?`).get(today) as { c: number }).c;

      // Week counts
      stats.week.signals = (db.prepare(`SELECT COUNT(*) as c FROM signals WHERE DATE(timestamp) >= ?`).get(weekAgo) as { c: number }).c;
      stats.week.issues = (db.prepare(`SELECT COUNT(*) as c FROM issues WHERE DATE(detected_at) >= ?`).get(weekAgo) as { c: number }).c;
      stats.week.proposals = (db.prepare(`SELECT COUNT(*) as c FROM proposals WHERE DATE(created_at) >= ?`).get(weekAgo) as { c: number }).c;
      stats.week.votes = (db.prepare(`SELECT COUNT(*) as c FROM votes WHERE DATE(created_at) >= ?`).get(weekAgo) as { c: number }).c;

      // Total counts
      stats.totals.signals = (db.prepare(`SELECT COUNT(*) as c FROM signals`).get() as { c: number }).c;
      stats.totals.issues = (db.prepare(`SELECT COUNT(*) as c FROM issues`).get() as { c: number }).c;
      stats.totals.proposals = (db.prepare(`SELECT COUNT(*) as c FROM proposals`).get() as { c: number }).c;
      stats.totals.votes = (db.prepare(`SELECT COUNT(*) as c FROM votes`).get() as { c: number }).c;

      // Recent governance flows
      const recentIssues = db.prepare(`
        SELECT
          i.id, i.title, i.status,
          (SELECT COUNT(*) FROM issue_signals WHERE issue_id = i.id) as signal_count,
          (SELECT COUNT(*) FROM proposals WHERE issue_id = i.id) as proposal_count,
          (SELECT COUNT(*) FROM votes v JOIN proposals p ON v.proposal_id = p.id WHERE p.issue_id = i.id) as vote_count
        FROM issues i
        ORDER BY i.detected_at DESC
        LIMIT 5
      `).all() as Array<{
        id: string;
        title: string;
        status: string;
        signal_count: number;
        proposal_count: number;
        vote_count: number;
      }>;

      stats.recentFlow = recentIssues.map(i => ({
        issueId: i.id,
        issueTitle: i.title,
        signalCount: i.signal_count,
        proposalCount: i.proposal_count,
        voteCount: i.vote_count,
        status: i.status,
      }));

      return stats;
    }, CACHE_TTL.STATS);

    res.json(result);
  } catch (error) {
    console.error('[Timeline] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch timeline stats' });
  }
});
