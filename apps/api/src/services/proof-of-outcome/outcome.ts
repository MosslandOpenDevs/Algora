import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

export type OutcomeStatus =
  | 'pending'      // Waiting for execution
  | 'executing'    // Currently being executed
  | 'completed'    // Successfully completed
  | 'failed'       // Execution failed
  | 'verified'     // Outcome verified
  | 'disputed';    // Outcome disputed

export interface Outcome {
  id: string;
  proposal_id: string;
  decision: 'approved' | 'rejected' | 'deferred';
  status: OutcomeStatus;
  execution_plan?: string;
  execution_started_at?: string;
  execution_completed_at?: string;
  executor?: string;
  result_summary?: string;
  result_evidence: string[];
  verification_score?: number;
  verified_by?: string;
  verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ExecutionStep {
  id: string;
  outcome_id: string;
  step_number: number;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  started_at?: string;
  completed_at?: string;
  result?: string;
  error?: string;
}

export interface OutcomeVerification {
  id: string;
  outcome_id: string;
  verifier_id: string;
  verifier_type: 'human' | 'agent';
  verification_result: 'success' | 'partial' | 'failure';
  confidence: number;
  evidence: string[];
  notes?: string;
  created_at: string;
}

export class OutcomeService {
  private db: Database.Database;
  private io: SocketServer;

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      -- Outcomes table for tracking proposal execution
      CREATE TABLE IF NOT EXISTS outcomes (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL UNIQUE,
        decision TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        execution_plan TEXT,
        execution_started_at TEXT,
        execution_completed_at TEXT,
        executor TEXT,
        result_summary TEXT,
        result_evidence TEXT DEFAULT '[]',
        verification_score REAL,
        verified_by TEXT,
        verified_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposal_id) REFERENCES proposals(id)
      );

      CREATE INDEX IF NOT EXISTS idx_outcomes_proposal ON outcomes(proposal_id);
      CREATE INDEX IF NOT EXISTS idx_outcomes_status ON outcomes(status);

      -- Execution steps for detailed tracking
      CREATE TABLE IF NOT EXISTS execution_steps (
        id TEXT PRIMARY KEY,
        outcome_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        started_at TEXT,
        completed_at TEXT,
        result TEXT,
        error TEXT,
        FOREIGN KEY (outcome_id) REFERENCES outcomes(id)
      );

      CREATE INDEX IF NOT EXISTS idx_execution_steps_outcome ON execution_steps(outcome_id);

      -- Outcome verifications
      CREATE TABLE IF NOT EXISTS outcome_verifications (
        id TEXT PRIMARY KEY,
        outcome_id TEXT NOT NULL,
        verifier_id TEXT NOT NULL,
        verifier_type TEXT NOT NULL,
        verification_result TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        evidence TEXT DEFAULT '[]',
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (outcome_id) REFERENCES outcomes(id)
      );

      CREATE INDEX IF NOT EXISTS idx_outcome_verifications_outcome ON outcome_verifications(outcome_id);
    `);

    console.log('[Outcome] Service initialized');
  }

  // === Outcome Creation ===

  createFromProposal(proposalId: string, decision: 'approved' | 'rejected' | 'deferred'): Outcome {
    const proposal = this.db.prepare('SELECT * FROM proposals WHERE id = ?').get(proposalId) as any;
    if (!proposal) throw new Error('Proposal not found');

    // Check if outcome already exists
    const existing = this.db.prepare('SELECT id FROM outcomes WHERE proposal_id = ?').get(proposalId);
    if (existing) throw new Error('Outcome already exists for this proposal');

    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO outcomes (id, proposal_id, decision, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).run(id, proposalId, decision, now, now);

    const outcome = this.getById(id)!;

    this.io.emit('outcome:created', { outcome });
    this.logActivity('OUTCOME_CREATED', 'info', `Outcome created for proposal: ${proposal.title}`, {
      outcomeId: id,
      proposalId,
      decision,
    });

    return outcome;
  }

  // === Execution Management ===

  setExecutionPlan(outcomeId: string, plan: string, steps: string[]): Outcome {
    const outcome = this.getById(outcomeId);
    if (!outcome) throw new Error('Outcome not found');

    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE outcomes SET execution_plan = ?, updated_at = ? WHERE id = ?
    `).run(plan, now, outcomeId);

    // Create execution steps
    for (let i = 0; i < steps.length; i++) {
      this.db.prepare(`
        INSERT INTO execution_steps (id, outcome_id, step_number, description, status)
        VALUES (?, ?, ?, ?, 'pending')
      `).run(uuidv4(), outcomeId, i + 1, steps[i]);
    }

    const updated = this.getById(outcomeId)!;
    this.io.emit('outcome:plan_set', { outcome: updated });

    return updated;
  }

  startExecution(outcomeId: string, executor: string): Outcome {
    const outcome = this.getById(outcomeId);
    if (!outcome) throw new Error('Outcome not found');
    if (outcome.status !== 'pending') throw new Error('Outcome is not in pending status');

    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE outcomes SET status = 'executing', executor = ?, execution_started_at = ?, updated_at = ?
      WHERE id = ?
    `).run(executor, now, now, outcomeId);

    const updated = this.getById(outcomeId)!;

    this.io.emit('outcome:execution_started', { outcome: updated });
    this.logActivity('EXECUTION_STARTED', 'info', `Execution started`, { outcomeId, executor });

    return updated;
  }

  updateStep(outcomeId: string, stepNumber: number, status: ExecutionStep['status'], result?: string, error?: string): ExecutionStep {
    const step = this.db.prepare(`
      SELECT * FROM execution_steps WHERE outcome_id = ? AND step_number = ?
    `).get(outcomeId, stepNumber) as ExecutionStep | undefined;

    if (!step) throw new Error('Step not found');

    const now = new Date().toISOString();
    const updates: any = { status };

    if (status === 'in_progress') {
      updates.started_at = now;
    } else if (status === 'completed' || status === 'failed') {
      updates.completed_at = now;
      if (result) updates.result = result;
      if (error) updates.error = error;
    }

    this.db.prepare(`
      UPDATE execution_steps
      SET status = ?, started_at = COALESCE(?, started_at), completed_at = ?, result = ?, error = ?
      WHERE outcome_id = ? AND step_number = ?
    `).run(
      updates.status,
      updates.started_at || null,
      updates.completed_at || null,
      updates.result || null,
      updates.error || null,
      outcomeId,
      stepNumber
    );

    const updatedStep = this.db.prepare(`
      SELECT * FROM execution_steps WHERE outcome_id = ? AND step_number = ?
    `).get(outcomeId, stepNumber) as ExecutionStep;

    this.io.emit('outcome:step_updated', { outcomeId, step: updatedStep });

    // Check if all steps are complete
    this.checkExecutionCompletion(outcomeId);

    return updatedStep;
  }

  private checkExecutionCompletion(outcomeId: string): void {
    const steps = this.getExecutionSteps(outcomeId);
    const allCompleted = steps.every(s => s.status === 'completed' || s.status === 'skipped');
    const anyFailed = steps.some(s => s.status === 'failed');

    if (allCompleted || anyFailed) {
      const now = new Date().toISOString();
      const newStatus = anyFailed ? 'failed' : 'completed';

      this.db.prepare(`
        UPDATE outcomes SET status = ?, execution_completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(newStatus, now, now, outcomeId);

      const outcome = this.getById(outcomeId)!;
      this.io.emit('outcome:execution_completed', { outcome, status: newStatus });
      this.logActivity('EXECUTION_COMPLETED', 'info', `Execution ${newStatus}`, { outcomeId });
    }
  }

  completeExecution(outcomeId: string, resultSummary: string, evidence: string[]): Outcome {
    const outcome = this.getById(outcomeId);
    if (!outcome) throw new Error('Outcome not found');

    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE outcomes
      SET status = 'completed', result_summary = ?, result_evidence = ?,
          execution_completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(resultSummary, JSON.stringify(evidence), now, now, outcomeId);

    // Update proposal status to executed
    this.db.prepare(`
      UPDATE proposals SET status = 'executed', updated_at = ? WHERE id = ?
    `).run(now, outcome.proposal_id);

    const updated = this.getById(outcomeId)!;

    this.io.emit('outcome:completed', { outcome: updated });
    this.logActivity('OUTCOME_COMPLETED', 'info', `Outcome completed`, { outcomeId, resultSummary });

    return updated;
  }

  failExecution(outcomeId: string, reason: string): Outcome {
    const outcome = this.getById(outcomeId);
    if (!outcome) throw new Error('Outcome not found');

    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE outcomes
      SET status = 'failed', result_summary = ?, execution_completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(`Execution failed: ${reason}`, now, now, outcomeId);

    const updated = this.getById(outcomeId)!;

    this.io.emit('outcome:failed', { outcome: updated, reason });
    this.logActivity('OUTCOME_FAILED', 'warning', `Outcome execution failed`, { outcomeId, reason });

    return updated;
  }

  // === Verification ===

  addVerification(
    outcomeId: string,
    verifierId: string,
    verifierType: 'human' | 'agent',
    result: 'success' | 'partial' | 'failure',
    confidence: number,
    evidence: string[],
    notes?: string
  ): OutcomeVerification {
    const outcome = this.getById(outcomeId);
    if (!outcome) throw new Error('Outcome not found');
    if (outcome.status !== 'completed' && outcome.status !== 'failed') {
      throw new Error('Can only verify completed or failed outcomes');
    }

    const id = uuidv4();

    this.db.prepare(`
      INSERT INTO outcome_verifications (id, outcome_id, verifier_id, verifier_type, verification_result, confidence, evidence, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, outcomeId, verifierId, verifierType, result, confidence, JSON.stringify(evidence), notes);

    // Calculate aggregate verification score
    this.updateVerificationScore(outcomeId);

    const verification = this.db.prepare('SELECT * FROM outcome_verifications WHERE id = ?').get(id) as any;
    verification.evidence = JSON.parse(verification.evidence);

    this.io.emit('outcome:verification_added', { outcomeId, verification });

    return verification;
  }

  private updateVerificationScore(outcomeId: string): void {
    const verifications = this.getVerifications(outcomeId);
    if (verifications.length === 0) return;

    // Calculate weighted score based on confidence and result
    let totalWeight = 0;
    let weightedScore = 0;

    for (const v of verifications) {
      const resultScore = v.verification_result === 'success' ? 1 :
                          v.verification_result === 'partial' ? 0.5 : 0;
      weightedScore += resultScore * v.confidence;
      totalWeight += v.confidence;
    }

    const score = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE outcomes SET verification_score = ?, updated_at = ? WHERE id = ?
    `).run(score, now, outcomeId);

    // If score is high enough and we have enough verifications, mark as verified
    if (score >= 0.7 && verifications.length >= 2) {
      this.db.prepare(`
        UPDATE outcomes SET status = 'verified', verified_at = ? WHERE id = ?
      `).run(now, outcomeId);

      const outcome = this.getById(outcomeId)!;
      this.io.emit('outcome:verified', { outcome });
    }
  }

  disputeOutcome(outcomeId: string, disputedBy: string, reason: string): Outcome {
    const outcome = this.getById(outcomeId);
    if (!outcome) throw new Error('Outcome not found');

    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE outcomes SET status = 'disputed', updated_at = ? WHERE id = ?
    `).run(now, outcomeId);

    // Log the dispute
    this.logActivity('OUTCOME_DISPUTED', 'warning', `Outcome disputed: ${reason}`, {
      outcomeId,
      disputedBy,
      reason,
    });

    const updated = this.getById(outcomeId)!;
    this.io.emit('outcome:disputed', { outcome: updated, disputedBy, reason });

    return updated;
  }

  // === Query Methods ===

  getById(id: string): Outcome | null {
    const outcome = this.db.prepare('SELECT * FROM outcomes WHERE id = ?').get(id) as any;
    if (!outcome) return null;

    outcome.result_evidence = JSON.parse(outcome.result_evidence || '[]');
    return outcome as Outcome;
  }

  getByProposalId(proposalId: string): Outcome | null {
    const outcome = this.db.prepare('SELECT * FROM outcomes WHERE proposal_id = ?').get(proposalId) as any;
    if (!outcome) return null;

    outcome.result_evidence = JSON.parse(outcome.result_evidence || '[]');
    return outcome as Outcome;
  }

  getAll(options: { status?: OutcomeStatus; limit?: number; offset?: number } = {}): Outcome[] {
    let query = 'SELECT * FROM outcomes WHERE 1=1';
    const params: any[] = [];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(options.limit || 50, options.offset || 0);

    const outcomes = this.db.prepare(query).all(...params) as any[];
    return outcomes.map(o => ({
      ...o,
      result_evidence: JSON.parse(o.result_evidence || '[]'),
    }));
  }

  getPending(): Outcome[] {
    return this.getAll({ status: 'pending' });
  }

  getExecutionSteps(outcomeId: string): ExecutionStep[] {
    return this.db.prepare(`
      SELECT * FROM execution_steps WHERE outcome_id = ? ORDER BY step_number
    `).all(outcomeId) as ExecutionStep[];
  }

  getVerifications(outcomeId: string): OutcomeVerification[] {
    const verifications = this.db.prepare(`
      SELECT * FROM outcome_verifications WHERE outcome_id = ? ORDER BY created_at DESC
    `).all(outcomeId) as any[];

    return verifications.map(v => ({
      ...v,
      evidence: JSON.parse(v.evidence || '[]'),
    }));
  }

  getOutcomeWithDetails(outcomeId: string): any {
    const outcome = this.getById(outcomeId);
    if (!outcome) return null;

    const steps = this.getExecutionSteps(outcomeId);
    const verifications = this.getVerifications(outcomeId);
    const proposal = this.db.prepare('SELECT * FROM proposals WHERE id = ?').get(outcome.proposal_id);

    return {
      outcome,
      proposal,
      steps,
      verifications,
    };
  }

  // === Statistics ===

  getStats(): any {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM outcomes').get() as { count: number };
    const byStatus = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM outcomes GROUP BY status
    `).all() as any[];
    const verified = this.db.prepare(`
      SELECT COUNT(*) as count FROM outcomes WHERE status = 'verified'
    `).get() as { count: number };
    const avgVerificationScore = this.db.prepare(`
      SELECT AVG(verification_score) as avg FROM outcomes WHERE verification_score IS NOT NULL
    `).get() as { avg: number };
    const successRate = this.db.prepare(`
      SELECT
        COUNT(CASE WHEN status IN ('completed', 'verified') THEN 1 END) * 100.0 /
        NULLIF(COUNT(CASE WHEN status NOT IN ('pending', 'executing') THEN 1 END), 0) as rate
      FROM outcomes
    `).get() as { rate: number };

    return {
      total: total.count,
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
      verified: verified.count,
      avgVerificationScore: avgVerificationScore?.avg || 0,
      successRate: successRate?.rate || 0,
    };
  }

  private logActivity(type: string, severity: string, message: string, details: any): void {
    this.db.prepare(`
      INSERT INTO activity_log (id, type, severity, timestamp, message, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), type, severity, new Date().toISOString(), message, JSON.stringify(details));
  }
}
