import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || 'data/algora.db';

export function initDatabase(): Database.Database {
  // Ensure data directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64MB cache
  db.pragma('foreign_keys = ON');

  // Run schema creation
  createSchema(db);

  return db;
}

function createSchema(db: Database.Database): void {
  db.exec(`
    -- ========================================
    -- Budget & Scheduler
    -- ========================================

    CREATE TABLE IF NOT EXISTS budget_usage (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      tier INTEGER NOT NULL,
      date TEXT NOT NULL,
      hour INTEGER,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      estimated_cost_usd REAL DEFAULT 0,
      call_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, tier, date, hour)
    );

    CREATE TABLE IF NOT EXISTS budget_config (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      daily_budget_usd REAL NOT NULL,
      hourly_call_limit INTEGER NOT NULL,
      input_token_price REAL NOT NULL,
      output_token_price REAL NOT NULL,
      enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS scheduler_tasks (
      id TEXT PRIMARY KEY,
      tier INTEGER NOT NULL,
      task_type TEXT NOT NULL,
      priority INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      payload TEXT NOT NULL,
      result TEXT,
      error TEXT,
      estimated_tokens INTEGER,
      actual_tokens INTEGER,
      actual_cost_usd REAL,
      scheduled_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ========================================
    -- Activity & Disclosure
    -- ========================================

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      message TEXT NOT NULL,
      agent_id TEXT,
      details TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(type);

    CREATE TABLE IF NOT EXISTS disclosure_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      log_type TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      model_used TEXT,
      prompt_template_version TEXT,
      provenance TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_ops_reports (
      id TEXT PRIMARY KEY,
      report_date TEXT NOT NULL UNIQUE,
      signals_count INTEGER NOT NULL,
      signals_summary TEXT,
      issue_candidates TEXT,
      ongoing_deliberations TEXT,
      decision_packet_drafts TEXT,
      generated_by TEXT NOT NULL,
      model_used TEXT,
      ir_formatted_content TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ========================================
    -- Signals & Issues
    -- ========================================

    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      original_id TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_signals_category ON signals(category);
    CREATE INDEX IF NOT EXISTS idx_signals_severity ON signals(severity);

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'detected',
      detected_at TEXT NOT NULL,
      resolved_at TEXT,
      signal_ids TEXT,
      evidence TEXT,
      suggested_actions TEXT,
      decision_packet TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ========================================
    -- Agents
    -- ========================================

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      group_name TEXT NOT NULL,
      persona_prompt TEXT NOT NULL,
      speaking_style TEXT,
      expertise TEXT,
      idle_messages TEXT,
      summoning_tags TEXT,
      tier_preference TEXT DEFAULT 'tier1',
      is_operative INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      avatar_url TEXT,
      color TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_states (
      agent_id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'idle',
      current_activity TEXT,
      current_session_id TEXT,
      last_chatter TEXT,
      last_active TEXT,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS agent_chatter (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      content TEXT NOT NULL,
      context TEXT,
      tier INTEGER DEFAULT 0,
      tier_used TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_chatter_time ON agent_chatter(created_at DESC);

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

    -- ========================================
    -- Agora (Discussion Sessions)
    -- ========================================

    CREATE TABLE IF NOT EXISTS agora_sessions (
      id TEXT PRIMARY KEY,
      issue_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active',
      current_round INTEGER DEFAULT 1,
      max_rounds INTEGER DEFAULT 5,
      summoned_agents TEXT,
      human_participants TEXT,
      consensus_score REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      concluded_at TEXT,
      FOREIGN KEY (issue_id) REFERENCES issues(id)
    );

    CREATE TABLE IF NOT EXISTS agora_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'active',
      FOREIGN KEY (session_id) REFERENCES agora_sessions(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      UNIQUE(session_id, agent_id)
    );

    CREATE INDEX IF NOT EXISTS idx_agora_participants_session ON agora_participants(session_id);

    CREATE TABLE IF NOT EXISTS agora_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      agent_id TEXT,
      human_id TEXT,
      message_type TEXT NOT NULL,
      content TEXT NOT NULL,
      round INTEGER DEFAULT 1,
      evidence TEXT,
      tier INTEGER DEFAULT 0,
      tier_used TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES agora_sessions(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_agora_messages_session ON agora_messages(session_id);

    CREATE TABLE IF NOT EXISTS agora_decision_packets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      confidence REAL DEFAULT 0,
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES agora_sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_agora_decision_packets_session ON agora_decision_packets(session_id);

    -- ========================================
    -- Proposals & Voting
    -- ========================================

    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      proposer TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      voting_starts TEXT,
      voting_ends TEXT,
      issue_id TEXT,
      decision_packet TEXT,
      tally TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id)
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      voter TEXT NOT NULL,
      choice TEXT NOT NULL,
      weight REAL NOT NULL,
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposal_id) REFERENCES proposals(id),
      UNIQUE(proposal_id, voter)
    );

    CREATE TABLE IF NOT EXISTS delegations (
      id TEXT PRIMARY KEY,
      delegator TEXT NOT NULL,
      delegate TEXT NOT NULL,
      categories TEXT,
      expires_at TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ========================================
    -- Decision History & Learning
    -- ========================================

    CREATE TABLE IF NOT EXISTS decision_history (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      consensus_score REAL,
      recommendation_type TEXT,
      agent_opinions TEXT,
      outcome_status TEXT DEFAULT 'pending',
      outcome_success_rate REAL,
      kpi_results TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      outcome_recorded_at TEXT,
      FOREIGN KEY (issue_id) REFERENCES issues(id)
    );

    -- ========================================
    -- Governance OS v2.0 - Documents
    -- ========================================

    CREATE TABLE IF NOT EXISTS governance_documents (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT NOT NULL,
      state TEXT DEFAULT 'draft',
      version INTEGER DEFAULT 1,
      created_by TEXT NOT NULL,
      workflow_id TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_governance_documents_type ON governance_documents(type);
    CREATE INDEX IF NOT EXISTS idx_governance_documents_state ON governance_documents(state);

    CREATE TABLE IF NOT EXISTS governance_document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      change_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES governance_documents(id),
      UNIQUE(document_id, version)
    );

    CREATE TABLE IF NOT EXISTS governance_document_provenance (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      details TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES governance_documents(id)
    );

    -- ========================================
    -- Governance OS v2.0 - Dual-House Voting
    -- ========================================

    CREATE TABLE IF NOT EXISTS governance_votings (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      issue_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      voting_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      config TEXT NOT NULL,
      agent_house_tally TEXT,
      human_house_tally TEXT,
      final_result TEXT,
      starts_at TEXT,
      ends_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finalized_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_governance_votings_status ON governance_votings(status);
    CREATE INDEX IF NOT EXISTS idx_governance_votings_document ON governance_votings(document_id);

    CREATE TABLE IF NOT EXISTS governance_votes (
      id TEXT PRIMARY KEY,
      voting_id TEXT NOT NULL,
      voter_id TEXT NOT NULL,
      voter_type TEXT NOT NULL,
      house TEXT NOT NULL,
      choice TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      reasoning TEXT,
      confidence REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (voting_id) REFERENCES governance_votings(id),
      UNIQUE(voting_id, voter_id, house)
    );

    CREATE INDEX IF NOT EXISTS idx_governance_votes_voting ON governance_votes(voting_id);

    CREATE TABLE IF NOT EXISTS governance_delegations (
      id TEXT PRIMARY KEY,
      delegator_id TEXT NOT NULL,
      delegator_type TEXT NOT NULL,
      delegate_id TEXT NOT NULL,
      delegate_type TEXT NOT NULL,
      house TEXT NOT NULL,
      scope TEXT,
      weight REAL DEFAULT 1.0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      revoked_at TEXT
    );

    -- ========================================
    -- Governance OS v2.0 - Safe Autonomy (Locks)
    -- ========================================

    CREATE TABLE IF NOT EXISTS governance_locked_actions (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      action_data TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT DEFAULT 'locked',
      required_approvals TEXT NOT NULL,
      current_approvals INTEGER DEFAULT 0,
      reason TEXT,
      created_by TEXT NOT NULL,
      timeout_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      unlocked_at TEXT,
      executed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_governance_locks_status ON governance_locked_actions(status);
    CREATE INDEX IF NOT EXISTS idx_governance_locks_risk ON governance_locked_actions(risk_level);

    CREATE TABLE IF NOT EXISTS governance_lock_approvals (
      id TEXT PRIMARY KEY,
      lock_id TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      reviewer_type TEXT NOT NULL,
      action TEXT NOT NULL,
      comments TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lock_id) REFERENCES governance_locked_actions(id)
    );

    CREATE TABLE IF NOT EXISTS governance_lock_audit (
      id TEXT PRIMARY KEY,
      lock_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lock_id) REFERENCES governance_locked_actions(id)
    );

    -- ========================================
    -- Governance OS v2.0 - KPI & Metrics
    -- ========================================

    CREATE TABLE IF NOT EXISTS governance_kpi_samples (
      id TEXT PRIMARY KEY,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      target REAL,
      unit TEXT,
      category TEXT,
      tags TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_governance_kpi_metric ON governance_kpi_samples(metric_name);
    CREATE INDEX IF NOT EXISTS idx_governance_kpi_time ON governance_kpi_samples(timestamp DESC);

    CREATE TABLE IF NOT EXISTS governance_kpi_alerts (
      id TEXT PRIMARY KEY,
      metric_name TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      current_value REAL,
      threshold REAL,
      message TEXT NOT NULL,
      acknowledged INTEGER DEFAULT 0,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_governance_kpi_alerts_time ON governance_kpi_alerts(timestamp DESC);

    -- ========================================
    -- Governance OS v2.0 - Pipeline Execution
    -- ========================================

    CREATE TABLE IF NOT EXISTS governance_pipeline_runs (
      id TEXT PRIMARY KEY,
      issue_id TEXT,
      workflow_type TEXT NOT NULL,
      status TEXT DEFAULT 'running',
      current_stage TEXT,
      stages_completed TEXT,
      context TEXT,
      result TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_governance_pipeline_status ON governance_pipeline_runs(status);
    CREATE INDEX IF NOT EXISTS idx_governance_pipeline_issue ON governance_pipeline_runs(issue_id);
  `);

  console.info('Database schema initialized');
}

export type { Database };
