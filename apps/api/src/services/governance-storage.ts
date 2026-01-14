/**
 * SQLite-backed storage service for Governance OS v2.0
 * Provides persistence for documents, voting, locks, KPI metrics, and pipeline runs
 */
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

// ========================================
// Document Storage
// ========================================

export interface StoredDocument {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  content: string;
  state: string;
  version: number;
  created_by: string;
  workflow_id: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version: number;
  content: string;
  changed_by: string;
  change_reason: string | null;
  created_at: string;
}

export class DocumentStorage {
  constructor(private db: Database.Database) {}

  create(doc: Omit<StoredDocument, 'id' | 'created_at' | 'updated_at' | 'version'>): StoredDocument {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO governance_documents (id, type, title, summary, content, state, version, created_by, workflow_id, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(id, doc.type, doc.title, doc.summary, doc.content, doc.state, doc.created_by, doc.workflow_id, doc.metadata, now, now);

    return this.getById(id)!;
  }

  getById(id: string): StoredDocument | null {
    return this.db.prepare(`SELECT * FROM governance_documents WHERE id = ?`).get(id) as StoredDocument | null;
  }

  getByType(type: string, limit = 50): StoredDocument[] {
    return this.db.prepare(`SELECT * FROM governance_documents WHERE type = ? ORDER BY created_at DESC LIMIT ?`).all(type, limit) as StoredDocument[];
  }

  getByState(state: string, limit = 50): StoredDocument[] {
    return this.db.prepare(`SELECT * FROM governance_documents WHERE state = ? ORDER BY created_at DESC LIMIT ?`).all(state, limit) as StoredDocument[];
  }

  update(id: string, updates: Partial<Pick<StoredDocument, 'title' | 'summary' | 'content' | 'state' | 'metadata'>>): StoredDocument | null {
    const doc = this.getById(id);
    if (!doc) return null;

    const now = new Date().toISOString();
    const newVersion = doc.version + 1;

    // Save old version
    this.db.prepare(`
      INSERT INTO governance_document_versions (id, document_id, version, content, changed_by, change_reason, created_at)
      VALUES (?, ?, ?, ?, 'system', 'Updated', ?)
    `).run(uuidv4(), id, doc.version, doc.content, now);

    // Update document
    const fields: string[] = ['version = ?', 'updated_at = ?'];
    const values: unknown[] = [newVersion, now];

    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
    if (updates.summary !== undefined) { fields.push('summary = ?'); values.push(updates.summary); }
    if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content); }
    if (updates.state !== undefined) { fields.push('state = ?'); values.push(updates.state); }
    if (updates.metadata !== undefined) { fields.push('metadata = ?'); values.push(updates.metadata); }

    values.push(id);
    this.db.prepare(`UPDATE governance_documents SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.getById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM governance_documents WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  getVersions(documentId: string): DocumentVersion[] {
    return this.db.prepare(`
      SELECT * FROM governance_document_versions WHERE document_id = ? ORDER BY version DESC
    `).all(documentId) as DocumentVersion[];
  }

  addProvenance(documentId: string, action: string, actor: string, details?: string): void {
    this.db.prepare(`
      INSERT INTO governance_document_provenance (id, document_id, action, actor, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), documentId, action, actor, details || null, new Date().toISOString());
  }

  getAll(limit = 100): StoredDocument[] {
    return this.db.prepare(`SELECT * FROM governance_documents ORDER BY created_at DESC LIMIT ?`).all(limit) as StoredDocument[];
  }
}

// ========================================
// Voting Storage
// ========================================

export interface StoredVoting {
  id: string;
  document_id: string | null;
  issue_id: string | null;
  title: string;
  description: string | null;
  voting_type: string;
  status: string;
  config: string;
  agent_house_tally: string | null;
  human_house_tally: string | null;
  final_result: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
}

export interface StoredVote {
  id: string;
  voting_id: string;
  voter_id: string;
  voter_type: string;
  house: string;
  choice: string;
  weight: number;
  reasoning: string | null;
  confidence: number | null;
  created_at: string;
}

export class VotingStorage {
  constructor(private db: Database.Database) {}

  createVoting(voting: Omit<StoredVoting, 'id' | 'created_at' | 'updated_at' | 'finalized_at' | 'agent_house_tally' | 'human_house_tally' | 'final_result'>): StoredVoting {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO governance_votings (id, document_id, issue_id, title, description, voting_type, status, config, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, voting.document_id, voting.issue_id, voting.title, voting.description, voting.voting_type, voting.status, voting.config, voting.starts_at, voting.ends_at, now, now);

    return this.getVotingById(id)!;
  }

  getVotingById(id: string): StoredVoting | null {
    return this.db.prepare(`SELECT * FROM governance_votings WHERE id = ?`).get(id) as StoredVoting | null;
  }

  getVotingsByStatus(status: string, limit = 50): StoredVoting[] {
    return this.db.prepare(`SELECT * FROM governance_votings WHERE status = ? ORDER BY created_at DESC LIMIT ?`).all(status, limit) as StoredVoting[];
  }

  updateVoting(id: string, updates: Partial<Pick<StoredVoting, 'status' | 'agent_house_tally' | 'human_house_tally' | 'final_result' | 'finalized_at'>>): StoredVoting | null {
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [new Date().toISOString()];

    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.agent_house_tally !== undefined) { fields.push('agent_house_tally = ?'); values.push(updates.agent_house_tally); }
    if (updates.human_house_tally !== undefined) { fields.push('human_house_tally = ?'); values.push(updates.human_house_tally); }
    if (updates.final_result !== undefined) { fields.push('final_result = ?'); values.push(updates.final_result); }
    if (updates.finalized_at !== undefined) { fields.push('finalized_at = ?'); values.push(updates.finalized_at); }

    values.push(id);
    this.db.prepare(`UPDATE governance_votings SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.getVotingById(id);
  }

  castVote(vote: Omit<StoredVote, 'id' | 'created_at'>): StoredVote {
    const id = uuidv4();
    const now = new Date().toISOString();

    // Use INSERT OR REPLACE to handle vote updates
    this.db.prepare(`
      INSERT OR REPLACE INTO governance_votes (id, voting_id, voter_id, voter_type, house, choice, weight, reasoning, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, vote.voting_id, vote.voter_id, vote.voter_type, vote.house, vote.choice, vote.weight, vote.reasoning, vote.confidence, now);

    return this.db.prepare(`SELECT * FROM governance_votes WHERE voting_id = ? AND voter_id = ? AND house = ?`).get(vote.voting_id, vote.voter_id, vote.house) as StoredVote;
  }

  getVotes(votingId: string): StoredVote[] {
    return this.db.prepare(`SELECT * FROM governance_votes WHERE voting_id = ?`).all(votingId) as StoredVote[];
  }

  getVotesByHouse(votingId: string, house: string): StoredVote[] {
    return this.db.prepare(`SELECT * FROM governance_votes WHERE voting_id = ? AND house = ?`).all(votingId, house) as StoredVote[];
  }

  getAllVotings(limit = 100): StoredVoting[] {
    return this.db.prepare(`SELECT * FROM governance_votings ORDER BY created_at DESC LIMIT ?`).all(limit) as StoredVoting[];
  }
}

// ========================================
// Lock Storage (Safe Autonomy)
// ========================================

export interface StoredLockedAction {
  id: string;
  action_type: string;
  action_data: string;
  risk_level: string;
  status: string;
  required_approvals: string;
  current_approvals: number;
  reason: string | null;
  created_by: string;
  timeout_at: string | null;
  created_at: string;
  updated_at: string;
  unlocked_at: string | null;
  executed_at: string | null;
}

export interface StoredLockApproval {
  id: string;
  lock_id: string;
  reviewer_id: string;
  reviewer_type: string;
  action: string;
  comments: string | null;
  timestamp: string;
}

export class LockStorage {
  constructor(private db: Database.Database) {}

  createLock(lock: Omit<StoredLockedAction, 'id' | 'created_at' | 'updated_at' | 'unlocked_at' | 'executed_at' | 'current_approvals'>): StoredLockedAction {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO governance_locked_actions (id, action_type, action_data, risk_level, status, required_approvals, current_approvals, reason, created_by, timeout_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(id, lock.action_type, lock.action_data, lock.risk_level, lock.status, lock.required_approvals, lock.reason, lock.created_by, lock.timeout_at, now, now);

    return this.getById(id)!;
  }

  getById(id: string): StoredLockedAction | null {
    return this.db.prepare(`SELECT * FROM governance_locked_actions WHERE id = ?`).get(id) as StoredLockedAction | null;
  }

  getByStatus(status: string, limit = 50): StoredLockedAction[] {
    return this.db.prepare(`SELECT * FROM governance_locked_actions WHERE status = ? ORDER BY created_at DESC LIMIT ?`).all(status, limit) as StoredLockedAction[];
  }

  getByRiskLevel(riskLevel: string, limit = 50): StoredLockedAction[] {
    return this.db.prepare(`SELECT * FROM governance_locked_actions WHERE risk_level = ? ORDER BY created_at DESC LIMIT ?`).all(riskLevel, limit) as StoredLockedAction[];
  }

  updateLock(id: string, updates: Partial<Pick<StoredLockedAction, 'status' | 'current_approvals' | 'unlocked_at' | 'executed_at'>>): StoredLockedAction | null {
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [new Date().toISOString()];

    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.current_approvals !== undefined) { fields.push('current_approvals = ?'); values.push(updates.current_approvals); }
    if (updates.unlocked_at !== undefined) { fields.push('unlocked_at = ?'); values.push(updates.unlocked_at); }
    if (updates.executed_at !== undefined) { fields.push('executed_at = ?'); values.push(updates.executed_at); }

    values.push(id);
    this.db.prepare(`UPDATE governance_locked_actions SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.getById(id);
  }

  addApproval(approval: Omit<StoredLockApproval, 'id' | 'timestamp'>): StoredLockApproval {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO governance_lock_approvals (id, lock_id, reviewer_id, reviewer_type, action, comments, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, approval.lock_id, approval.reviewer_id, approval.reviewer_type, approval.action, approval.comments, now);

    // Update approval count on the lock
    const lock = this.getById(approval.lock_id);
    if (lock && approval.action === 'approve') {
      this.updateLock(approval.lock_id, { current_approvals: lock.current_approvals + 1 });
    }

    return this.db.prepare(`SELECT * FROM governance_lock_approvals WHERE id = ?`).get(id) as StoredLockApproval;
  }

  getApprovals(lockId: string): StoredLockApproval[] {
    return this.db.prepare(`SELECT * FROM governance_lock_approvals WHERE lock_id = ? ORDER BY timestamp DESC`).all(lockId) as StoredLockApproval[];
  }

  addAuditLog(lockId: string, eventType: string, details?: string): void {
    this.db.prepare(`
      INSERT INTO governance_lock_audit (id, lock_id, event_type, details, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), lockId, eventType, details || null, new Date().toISOString());
  }

  getPendingLocks(): StoredLockedAction[] {
    return this.db.prepare(`SELECT * FROM governance_locked_actions WHERE status = 'locked' ORDER BY created_at DESC`).all() as StoredLockedAction[];
  }
}

// ========================================
// KPI Storage
// ========================================

export interface StoredKPISample {
  id: string;
  metric_name: string;
  value: number;
  target: number | null;
  unit: string | null;
  category: string | null;
  tags: string | null;
  timestamp: string;
}

export interface StoredKPIAlert {
  id: string;
  metric_name: string;
  alert_type: string;
  severity: string;
  current_value: number | null;
  threshold: number | null;
  message: string;
  acknowledged: number;
  timestamp: string;
}

export class KPIStorage {
  constructor(private db: Database.Database) {}

  recordSample(sample: Omit<StoredKPISample, 'id' | 'timestamp'>): StoredKPISample {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO governance_kpi_samples (id, metric_name, value, target, unit, category, tags, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sample.metric_name, sample.value, sample.target, sample.unit, sample.category, sample.tags, now);

    return this.db.prepare(`SELECT * FROM governance_kpi_samples WHERE id = ?`).get(id) as StoredKPISample;
  }

  getSamples(metricName: string, limit = 100): StoredKPISample[] {
    return this.db.prepare(`
      SELECT * FROM governance_kpi_samples WHERE metric_name = ? ORDER BY timestamp DESC LIMIT ?
    `).all(metricName, limit) as StoredKPISample[];
  }

  getSamplesByCategory(category: string, limit = 100): StoredKPISample[] {
    return this.db.prepare(`
      SELECT * FROM governance_kpi_samples WHERE category = ? ORDER BY timestamp DESC LIMIT ?
    `).all(category, limit) as StoredKPISample[];
  }

  getLatestSample(metricName: string): StoredKPISample | null {
    return this.db.prepare(`
      SELECT * FROM governance_kpi_samples WHERE metric_name = ? ORDER BY timestamp DESC LIMIT 1
    `).get(metricName) as StoredKPISample | null;
  }

  createAlert(alert: Omit<StoredKPIAlert, 'id' | 'timestamp' | 'acknowledged'>): StoredKPIAlert {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO governance_kpi_alerts (id, metric_name, alert_type, severity, current_value, threshold, message, acknowledged, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, alert.metric_name, alert.alert_type, alert.severity, alert.current_value, alert.threshold, alert.message, now);

    return this.db.prepare(`SELECT * FROM governance_kpi_alerts WHERE id = ?`).get(id) as StoredKPIAlert;
  }

  getAlerts(acknowledged = false, limit = 50): StoredKPIAlert[] {
    return this.db.prepare(`
      SELECT * FROM governance_kpi_alerts WHERE acknowledged = ? ORDER BY timestamp DESC LIMIT ?
    `).all(acknowledged ? 1 : 0, limit) as StoredKPIAlert[];
  }

  acknowledgeAlert(id: string): boolean {
    const result = this.db.prepare(`UPDATE governance_kpi_alerts SET acknowledged = 1 WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  getMetricStats(metricName: string, hours = 24): { avg: number; min: number; max: number; count: number } {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const result = this.db.prepare(`
      SELECT AVG(value) as avg, MIN(value) as min, MAX(value) as max, COUNT(*) as count
      FROM governance_kpi_samples
      WHERE metric_name = ? AND timestamp >= ?
    `).get(metricName, since) as { avg: number | null; min: number | null; max: number | null; count: number };

    return {
      avg: result.avg ?? 0,
      min: result.min ?? 0,
      max: result.max ?? 0,
      count: result.count,
    };
  }
}

// ========================================
// Pipeline Storage
// ========================================

export interface StoredPipelineRun {
  id: string;
  issue_id: string | null;
  workflow_type: string;
  status: string;
  current_stage: string | null;
  stages_completed: string | null;
  context: string | null;
  result: string | null;
  started_at: string;
  completed_at: string | null;
}

export class PipelineStorage {
  constructor(private db: Database.Database) {}

  createRun(run: Omit<StoredPipelineRun, 'id' | 'started_at' | 'completed_at' | 'status' | 'stages_completed' | 'result'>): StoredPipelineRun {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO governance_pipeline_runs (id, issue_id, workflow_type, status, current_stage, context, started_at)
      VALUES (?, ?, ?, 'running', ?, ?, ?)
    `).run(id, run.issue_id, run.workflow_type, run.current_stage, run.context, now);

    return this.getById(id)!;
  }

  getById(id: string): StoredPipelineRun | null {
    return this.db.prepare(`SELECT * FROM governance_pipeline_runs WHERE id = ?`).get(id) as StoredPipelineRun | null;
  }

  getByIssueId(issueId: string): StoredPipelineRun[] {
    return this.db.prepare(`SELECT * FROM governance_pipeline_runs WHERE issue_id = ? ORDER BY started_at DESC`).all(issueId) as StoredPipelineRun[];
  }

  getByStatus(status: string, limit = 50): StoredPipelineRun[] {
    return this.db.prepare(`SELECT * FROM governance_pipeline_runs WHERE status = ? ORDER BY started_at DESC LIMIT ?`).all(status, limit) as StoredPipelineRun[];
  }

  updateRun(id: string, updates: Partial<Pick<StoredPipelineRun, 'status' | 'current_stage' | 'stages_completed' | 'context' | 'result' | 'completed_at'>>): StoredPipelineRun | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.current_stage !== undefined) { fields.push('current_stage = ?'); values.push(updates.current_stage); }
    if (updates.stages_completed !== undefined) { fields.push('stages_completed = ?'); values.push(updates.stages_completed); }
    if (updates.context !== undefined) { fields.push('context = ?'); values.push(updates.context); }
    if (updates.result !== undefined) { fields.push('result = ?'); values.push(updates.result); }
    if (updates.completed_at !== undefined) { fields.push('completed_at = ?'); values.push(updates.completed_at); }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    this.db.prepare(`UPDATE governance_pipeline_runs SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.getById(id);
  }

  getRunningPipelines(): StoredPipelineRun[] {
    return this.db.prepare(`SELECT * FROM governance_pipeline_runs WHERE status = 'running' ORDER BY started_at DESC`).all() as StoredPipelineRun[];
  }
}

// ========================================
// Combined Storage Service
// ========================================

export class GovernanceStorage {
  public readonly documents: DocumentStorage;
  public readonly voting: VotingStorage;
  public readonly locks: LockStorage;
  public readonly kpi: KPIStorage;
  public readonly pipeline: PipelineStorage;

  constructor(db: Database.Database) {
    this.documents = new DocumentStorage(db);
    this.voting = new VotingStorage(db);
    this.locks = new LockStorage(db);
    this.kpi = new KPIStorage(db);
    this.pipeline = new PipelineStorage(db);
  }
}
