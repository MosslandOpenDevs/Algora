import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

export interface AgentTrustScore {
  agent_id: string;
  overall_score: number;
  prediction_accuracy: number;
  endorsement_accuracy: number;
  participation_rate: number;
  consistency_score: number;
  total_predictions: number;
  correct_predictions: number;
  total_endorsements: number;
  accurate_endorsements: number;
  last_updated: string;
}

export interface PredictionRecord {
  id: string;
  agent_id: string;
  proposal_id: string;
  prediction: 'pass' | 'fail';
  confidence: number;
  reasoning?: string;
  actual_outcome?: 'passed' | 'rejected';
  was_correct?: boolean;
  created_at: string;
  resolved_at?: string;
}

export interface TrustUpdate {
  id: string;
  agent_id: string;
  update_type: 'prediction' | 'endorsement' | 'participation' | 'manual';
  score_before: number;
  score_after: number;
  score_delta: number;
  reason: string;
  reference_id?: string;
  created_at: string;
}

export class TrustScoringService {
  private db: Database.Database;
  private io: SocketServer;

  // Scoring weights
  private readonly WEIGHTS = {
    prediction: 0.35,
    endorsement: 0.35,
    participation: 0.15,
    consistency: 0.15,
  };

  // Score adjustments
  private readonly ADJUSTMENTS = {
    correctPrediction: 2.0,
    wrongPrediction: -1.5,
    accurateEndorsement: 1.5,
    inaccurateEndorsement: -1.0,
    participation: 0.5,
    inactivity: -0.2,
  };

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      -- Agent trust scores
      CREATE TABLE IF NOT EXISTS agent_trust_scores (
        agent_id TEXT PRIMARY KEY,
        overall_score REAL DEFAULT 50.0,
        prediction_accuracy REAL DEFAULT 50.0,
        endorsement_accuracy REAL DEFAULT 50.0,
        participation_rate REAL DEFAULT 50.0,
        consistency_score REAL DEFAULT 50.0,
        total_predictions INTEGER DEFAULT 0,
        correct_predictions INTEGER DEFAULT 0,
        total_endorsements INTEGER DEFAULT 0,
        accurate_endorsements INTEGER DEFAULT 0,
        last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      );

      -- Prediction records
      CREATE TABLE IF NOT EXISTS prediction_records (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        prediction TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        reasoning TEXT,
        actual_outcome TEXT,
        was_correct INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT,
        FOREIGN KEY (agent_id) REFERENCES agents(id),
        FOREIGN KEY (proposal_id) REFERENCES proposals(id)
      );

      CREATE INDEX IF NOT EXISTS idx_prediction_records_agent ON prediction_records(agent_id);
      CREATE INDEX IF NOT EXISTS idx_prediction_records_proposal ON prediction_records(proposal_id);

      -- Trust score history
      CREATE TABLE IF NOT EXISTS trust_updates (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        update_type TEXT NOT NULL,
        score_before REAL NOT NULL,
        score_after REAL NOT NULL,
        score_delta REAL NOT NULL,
        reason TEXT NOT NULL,
        reference_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      );

      CREATE INDEX IF NOT EXISTS idx_trust_updates_agent ON trust_updates(agent_id);
    `);

    // Initialize trust scores for all agents
    this.initializeAgentScores();

    console.log('[TrustScoring] Service initialized');
  }

  private initializeAgentScores(): void {
    const agents = this.db.prepare('SELECT id FROM agents').all() as { id: string }[];

    for (const agent of agents) {
      const existing = this.db.prepare('SELECT agent_id FROM agent_trust_scores WHERE agent_id = ?').get(agent.id);
      if (!existing) {
        this.db.prepare(`
          INSERT INTO agent_trust_scores (agent_id) VALUES (?)
        `).run(agent.id);
      }
    }
  }

  // === Prediction Management ===

  recordPrediction(
    agentId: string,
    proposalId: string,
    prediction: 'pass' | 'fail',
    confidence: number,
    reasoning?: string
  ): PredictionRecord {
    const id = uuidv4();

    this.db.prepare(`
      INSERT INTO prediction_records (id, agent_id, proposal_id, prediction, confidence, reasoning)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, agentId, proposalId, prediction, confidence, reasoning);

    const record = this.db.prepare('SELECT * FROM prediction_records WHERE id = ?').get(id) as PredictionRecord;

    this.io.emit('trust:prediction_recorded', { agentId, proposalId, prediction });

    return record;
  }

  resolvePredictions(proposalId: string, actualOutcome: 'passed' | 'rejected'): void {
    const predictions = this.db.prepare(`
      SELECT * FROM prediction_records WHERE proposal_id = ? AND actual_outcome IS NULL
    `).all(proposalId) as PredictionRecord[];

    const now = new Date().toISOString();

    for (const pred of predictions) {
      const wasCorrect = (pred.prediction === 'pass' && actualOutcome === 'passed') ||
                        (pred.prediction === 'fail' && actualOutcome === 'rejected');

      this.db.prepare(`
        UPDATE prediction_records
        SET actual_outcome = ?, was_correct = ?, resolved_at = ?
        WHERE id = ?
      `).run(actualOutcome, wasCorrect ? 1 : 0, now, pred.id);

      // Update agent's trust score
      this.updatePredictionScore(pred.agent_id, wasCorrect, pred.confidence);
    }

    this.io.emit('trust:predictions_resolved', { proposalId, actualOutcome, count: predictions.length });
  }

  private updatePredictionScore(agentId: string, wasCorrect: boolean, confidence: number): void {
    const current = this.getAgentScore(agentId);
    if (!current) return;

    const delta = wasCorrect
      ? this.ADJUSTMENTS.correctPrediction * confidence
      : this.ADJUSTMENTS.wrongPrediction * confidence;

    const newPredictions = current.total_predictions + 1;
    const newCorrect = current.correct_predictions + (wasCorrect ? 1 : 0);
    const newAccuracy = (newCorrect / newPredictions) * 100;

    this.db.prepare(`
      UPDATE agent_trust_scores
      SET total_predictions = ?, correct_predictions = ?, prediction_accuracy = ?, last_updated = ?
      WHERE agent_id = ?
    `).run(newPredictions, newCorrect, newAccuracy, new Date().toISOString(), agentId);

    this.recalculateOverallScore(agentId);
    this.recordTrustUpdate(agentId, 'prediction', current.overall_score, delta,
      wasCorrect ? 'Correct prediction' : 'Incorrect prediction');
  }

  // === Endorsement Tracking ===

  resolveEndorsements(proposalId: string, actualOutcome: 'passed' | 'rejected'): void {
    const endorsements = this.db.prepare(`
      SELECT pe.*, a.id as agent_id
      FROM proposal_endorsements pe
      JOIN agents a ON pe.agent_id = a.id
      WHERE pe.proposal_id = ?
    `).all(proposalId) as any[];

    for (const endorsement of endorsements) {
      const wasAccurate = (endorsement.stance === 'support' && actualOutcome === 'passed') ||
                         (endorsement.stance === 'oppose' && actualOutcome === 'rejected');

      // Update agent's endorsement accuracy
      this.updateEndorsementScore(endorsement.agent_id, wasAccurate, endorsement.confidence);
    }

    this.io.emit('trust:endorsements_resolved', { proposalId, actualOutcome, count: endorsements.length });
  }

  private updateEndorsementScore(agentId: string, wasAccurate: boolean, confidence: number): void {
    const current = this.getAgentScore(agentId);
    if (!current) return;

    const delta = wasAccurate
      ? this.ADJUSTMENTS.accurateEndorsement * confidence
      : this.ADJUSTMENTS.inaccurateEndorsement * confidence;

    const newEndorsements = current.total_endorsements + 1;
    const newAccurate = current.accurate_endorsements + (wasAccurate ? 1 : 0);
    const newAccuracy = (newAccurate / newEndorsements) * 100;

    this.db.prepare(`
      UPDATE agent_trust_scores
      SET total_endorsements = ?, accurate_endorsements = ?, endorsement_accuracy = ?, last_updated = ?
      WHERE agent_id = ?
    `).run(newEndorsements, newAccurate, newAccuracy, new Date().toISOString(), agentId);

    this.recalculateOverallScore(agentId);
    this.recordTrustUpdate(agentId, 'endorsement', current.overall_score, delta,
      wasAccurate ? 'Accurate endorsement' : 'Inaccurate endorsement');
  }

  // === Participation Tracking ===

  recordParticipation(agentId: string, activity: 'vote' | 'comment' | 'discussion' | 'analysis'): void {
    const current = this.getAgentScore(agentId);
    if (!current) return;

    // Boost participation rate
    const delta = this.ADJUSTMENTS.participation;
    const newRate = Math.min(100, current.participation_rate + delta);

    this.db.prepare(`
      UPDATE agent_trust_scores SET participation_rate = ?, last_updated = ? WHERE agent_id = ?
    `).run(newRate, new Date().toISOString(), agentId);

    this.recalculateOverallScore(agentId);
    this.recordTrustUpdate(agentId, 'participation', current.overall_score, delta, `Participated in ${activity}`);
  }

  decayInactiveScores(inactiveDays: number = 7): number {
    const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000).toISOString();

    const inactive = this.db.prepare(`
      SELECT agent_id, overall_score, participation_rate
      FROM agent_trust_scores
      WHERE last_updated < ?
    `).all(cutoff) as any[];

    for (const agent of inactive) {
      const newRate = Math.max(0, agent.participation_rate + this.ADJUSTMENTS.inactivity);

      this.db.prepare(`
        UPDATE agent_trust_scores SET participation_rate = ?, last_updated = ? WHERE agent_id = ?
      `).run(newRate, new Date().toISOString(), agent.agent_id);

      this.recalculateOverallScore(agent.agent_id);
    }

    return inactive.length;
  }

  // === Score Calculation ===

  private recalculateOverallScore(agentId: string): void {
    const score = this.getAgentScore(agentId);
    if (!score) return;

    const overall =
      score.prediction_accuracy * this.WEIGHTS.prediction +
      score.endorsement_accuracy * this.WEIGHTS.endorsement +
      score.participation_rate * this.WEIGHTS.participation +
      score.consistency_score * this.WEIGHTS.consistency;

    const boundedScore = Math.max(0, Math.min(100, overall));

    this.db.prepare(`
      UPDATE agent_trust_scores SET overall_score = ? WHERE agent_id = ?
    `).run(boundedScore, agentId);

    // Also update the agent's trust_score in the agents table
    this.db.prepare(`
      UPDATE agents SET trust_score = ? WHERE id = ?
    `).run(boundedScore, agentId);

    this.io.emit('trust:score_updated', { agentId, score: boundedScore });
  }

  calculateConsistencyScore(agentId: string): number {
    // Get recent predictions and endorsements
    const recentPredictions = this.db.prepare(`
      SELECT prediction, confidence FROM prediction_records
      WHERE agent_id = ? AND created_at > datetime('now', '-30 days')
      ORDER BY created_at DESC LIMIT 20
    `).all(agentId) as any[];

    if (recentPredictions.length < 3) return 50; // Default for new agents

    // Calculate variance in confidence levels (lower variance = more consistent)
    const confidences = recentPredictions.map(p => p.confidence);
    const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;

    // Convert variance to consistency score (higher score = more consistent)
    const consistencyScore = Math.max(0, 100 - variance * 200);

    this.db.prepare(`
      UPDATE agent_trust_scores SET consistency_score = ? WHERE agent_id = ?
    `).run(consistencyScore, agentId);

    return consistencyScore;
  }

  // === Trust History ===

  private recordTrustUpdate(
    agentId: string,
    updateType: TrustUpdate['update_type'],
    scoreBefore: number,
    delta: number,
    reason: string,
    referenceId?: string
  ): void {
    const current = this.getAgentScore(agentId);
    const scoreAfter = current?.overall_score || scoreBefore + delta;

    this.db.prepare(`
      INSERT INTO trust_updates (id, agent_id, update_type, score_before, score_after, score_delta, reason, reference_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), agentId, updateType, scoreBefore, scoreAfter, scoreAfter - scoreBefore, reason, referenceId);
  }

  getTrustHistory(agentId: string, limit: number = 50): TrustUpdate[] {
    return this.db.prepare(`
      SELECT * FROM trust_updates WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(agentId, limit) as TrustUpdate[];
  }

  // === Query Methods ===

  getAgentScore(agentId: string): AgentTrustScore | null {
    return this.db.prepare('SELECT * FROM agent_trust_scores WHERE agent_id = ?').get(agentId) as AgentTrustScore | null;
  }

  getAllScores(options: { orderBy?: 'overall_score' | 'prediction_accuracy' | 'endorsement_accuracy'; limit?: number } = {}): AgentTrustScore[] {
    const orderBy = options.orderBy || 'overall_score';
    return this.db.prepare(`
      SELECT * FROM agent_trust_scores ORDER BY ${orderBy} DESC LIMIT ?
    `).all(options.limit || 100) as AgentTrustScore[];
  }

  getTopAgents(limit: number = 10): AgentTrustScore[] {
    return this.getAllScores({ limit });
  }

  getAgentPredictions(agentId: string, limit: number = 50): PredictionRecord[] {
    return this.db.prepare(`
      SELECT * FROM prediction_records WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(agentId, limit) as PredictionRecord[];
  }

  // === Statistics ===

  getStats(): any {
    let avgScore = { avg: 50 };
    let topPredictors: any[] = [];
    let totalPredictions = { count: 0 };
    let predictionAccuracy = { accuracy: 0 };
    let recentUpdates = { count: 0 };

    try {
      avgScore = this.db.prepare(`
        SELECT AVG(overall_score) as avg FROM agent_trust_scores
      `).get() as { avg: number } || { avg: 50 };
    } catch {
      // Table might not exist
    }

    try {
      topPredictors = this.db.prepare(`
        SELECT agent_id, 50 as prediction_accuracy, 0 as total_predictions
        FROM agent_trust_scores
        LIMIT 5
      `).all();
    } catch {
      // Table might not exist
    }

    try {
      totalPredictions = this.db.prepare(`
        SELECT COUNT(*) as count FROM prediction_records
      `).get() as { count: number } || { count: 0 };
    } catch {
      // Table might not exist
    }

    try {
      predictionAccuracy = this.db.prepare(`
        SELECT
          COUNT(CASE WHEN was_correct = 1 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as accuracy
        FROM prediction_records
        WHERE was_correct IS NOT NULL
      `).get() as { accuracy: number } || { accuracy: 0 };
    } catch {
      // Table might not exist
    }

    try {
      recentUpdates = this.db.prepare(`
        SELECT COUNT(*) as count FROM trust_updates WHERE created_at > datetime('now', '-24 hours')
      `).get() as { count: number } || { count: 0 };
    } catch {
      // Table might not exist
    }

    return {
      averageScore: avgScore?.avg || 50,
      topPredictors,
      totalPredictions: totalPredictions?.count || 0,
      overallPredictionAccuracy: predictionAccuracy?.accuracy || 0,
      updatesLast24h: recentUpdates?.count || 0,
    };
  }

  // === Batch Processing ===

  processProposalOutcome(proposalId: string, outcome: 'passed' | 'rejected'): void {
    // Resolve all predictions for this proposal
    this.resolvePredictions(proposalId, outcome);

    // Resolve all endorsements
    this.resolveEndorsements(proposalId, outcome);

    // Recalculate consistency scores for affected agents
    const predictions = this.db.prepare(`
      SELECT DISTINCT agent_id FROM prediction_records WHERE proposal_id = ?
    `).all(proposalId) as { agent_id: string }[];

    for (const { agent_id } of predictions) {
      this.calculateConsistencyScore(agent_id);
    }

    this.logActivity('PROPOSAL_OUTCOME_PROCESSED', 'info', `Trust scores updated for proposal outcome`, {
      proposalId,
      outcome,
      agentsAffected: predictions.length,
    });
  }

  private logActivity(type: string, severity: string, message: string, details: any): void {
    this.db.prepare(`
      INSERT INTO activity_log (id, type, severity, timestamp, message, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), type, severity, new Date().toISOString(), message, JSON.stringify(details));
  }
}
