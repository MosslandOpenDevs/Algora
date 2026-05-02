// ===========================================
// Model Router Types for Algora v2.0
// ===========================================

// ============================================
// LLM Tier System
// ============================================

/**
 * LLM tier levels for cost/capability tradeoffs.
 */
export type LLMTier = 0 | 1 | 2;

/**
 * LLM tier descriptions.
 */
export const LLM_TIER_DESCRIPTIONS: Record<LLMTier, string> = {
  0: 'Free - No LLM, data collection only',
  1: 'Local - Ollama models, free but limited',
  2: 'External - Cloud APIs (Claude, GPT), paid but powerful',
};

// ============================================
// Model Capabilities
// ============================================

/**
 * Model capability types.
 */
export type ModelCapability =
  | 'text'
  | 'code'
  | 'vision'
  | 'embedding'
  | 'rerank'
  | 'functions';

/**
 * Model capability descriptions.
 */
export const MODEL_CAPABILITY_DESCRIPTIONS: Record<ModelCapability, string> = {
  text: 'Text generation and conversation',
  code: 'Code generation and analysis',
  vision: 'Image understanding and analysis',
  embedding: 'Text embedding for retrieval',
  rerank: 'Document reranking for RAG',
  functions: 'Function/tool calling support',
};

// ============================================
// Model Providers
// ============================================

/**
 * Supported model providers.
 */
export type ModelProvider = 'ollama' | 'anthropic' | 'openai' | 'google';

/**
 * Provider configuration.
 */
export interface ProviderConfig {
  provider: ModelProvider;
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Default provider configurations.
 */
export const DEFAULT_PROVIDER_CONFIGS: Record<ModelProvider, Partial<ProviderConfig>> = {
  ollama: {
    baseUrl: 'http://localhost:11434',
    timeout: 120000,
    maxRetries: 3,
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    timeout: 60000,
    maxRetries: 3,
  },
  openai: {
    baseUrl: 'https://api.openai.com',
    timeout: 60000,
    maxRetries: 3,
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com',
    timeout: 60000,
    maxRetries: 3,
  },
};

// ============================================
// Model Status
// ============================================

/**
 * Model availability status.
 */
export type ModelStatus = 'available' | 'unavailable' | 'degraded' | 'unknown';

/**
 * Health check result.
 */
export interface HealthCheckResult {
  status: ModelStatus;
  latencyMs?: number;
  tokensPerSecond?: number;
  error?: string;
  timestamp: Date;
}

// ============================================
// Model Entry
// ============================================

/**
 * A model entry in the registry.
 */
export interface ModelEntry {
  /** Model identifier (e.g., "qwen3.5:4b", "claude-sonnet-4-20250514") */
  id: string;
  /** Display name */
  name: string;
  /** Model provider */
  provider: ModelProvider;
  /** LLM tier */
  tier: LLMTier;
  /** Model capabilities */
  capabilities: ModelCapability[];
  /** Context window size in tokens */
  contextWindow: number;
  /** Estimated tokens per second on target hardware */
  tokensPerSecond: number;
  /** Cost per 1k tokens (0 for local models) */
  costPer1kTokens: number;
  /** Supported languages */
  languages: string[];
  /** Specializations (e.g., 'coding', 'korean', 'vision') */
  specializations: string[];
  /** Current availability status */
  status: ModelStatus;
  /** Last health check timestamp */
  lastHealthCheck?: Date;
  /** Last health check result */
  lastHealthResult?: HealthCheckResult;
}

// ============================================
// Task Types
// ============================================

/**
 * Task type categories for routing.
 */
export type TaskType =
  | 'scouting'
  | 'debate'
  | 'core_decision'
  | 'coding'
  | 'vision'
  | 'korean'
  | 'complex_analysis'
  | 'chatter'
  | 'summarization'
  | 'translation'
  | 'research'
  | 'embedding'
  | 'reranking';

/**
 * Task type to model mapping.
 */
export interface TaskTypeMapping {
  taskType: TaskType;
  primaryModel: string;
  backupModel: string;
  tier: LLMTier;
  maxTokens: number;
}

/**
 * Default task type mappings.
 *
 * The shared remote Ollama keeps exactly one chat model (qwen3.5:4b) and one
 * embedding model (qwen3-embedding:0.6b) resident on the ~8GB GPU. All Tier-1
 * routing flattens to that pair so we never trigger a VRAM swap. Anything else
 * will 404 against the server until it's pulled again.
 */
export const DEFAULT_TASK_TYPE_MAPPINGS: TaskTypeMapping[] = [
  { taskType: 'scouting', primaryModel: 'qwen3.5:4b', backupModel: 'qwen3.5:4b', tier: 1, maxTokens: 1000 },
  { taskType: 'debate', primaryModel: 'qwen3.5:4b', backupModel: 'qwen3.5:4b', tier: 1, maxTokens: 2000 },
  { taskType: 'core_decision', primaryModel: 'qwen3.5:4b', backupModel: 'qwen3.5:4b', tier: 1, maxTokens: 4000 },
  { taskType: 'coding', primaryModel: 'qwen3.5:4b', backupModel: 'qwen3.5:4b', tier: 1, maxTokens: 4000 },
  { taskType: 'vision', primaryModel: 'qwen3.5:4b', backupModel: 'qwen3.5:4b', tier: 1, maxTokens: 2000 },
  { taskType: 'korean', primaryModel: 'qwen3.5:4b', backupModel: 'qwen3.5:4b', tier: 1, maxTokens: 2000 },
  { taskType: 'complex_analysis', primaryModel: 'claude-sonnet-4-20250514', backupModel: 'gpt-4o', tier: 2, maxTokens: 8000 },
  { taskType: 'chatter', primaryModel: 'qwen3.5:4b', backupModel: 'qwen3.5:4b', tier: 1, maxTokens: 500 },
  { taskType: 'summarization', primaryModel: 'qwen3.5:4b', backupModel: 'qwen3.5:4b', tier: 1, maxTokens: 1000 },
  { taskType: 'translation', primaryModel: 'qwen3.5:4b', backupModel: 'qwen3.5:4b', tier: 1, maxTokens: 2000 },
  { taskType: 'research', primaryModel: 'qwen3.5:4b', backupModel: 'qwen3.5:4b', tier: 1, maxTokens: 3000 },
  { taskType: 'embedding', primaryModel: 'qwen3-embedding:0.6b', backupModel: 'qwen3-embedding:0.6b', tier: 1, maxTokens: 8192 },
  // No dedicated reranker on the remote anymore — fall back to the chat model
  // emitting a relevance score. Cross-encoder pairs are short, so qwen3.5:4b
  // handles them in a single small call.
  { taskType: 'reranking', primaryModel: 'qwen3.5:4b', backupModel: 'qwen3.5:4b', tier: 1, maxTokens: 512 },
];

// ============================================
// Difficulty Classification
// ============================================

/**
 * Task difficulty levels.
 */
export type DifficultyLevel =
  | 'trivial'
  | 'simple'
  | 'moderate'
  | 'complex'
  | 'critical';

/**
 * Difficulty level descriptions.
 */
export const DIFFICULTY_DESCRIPTIONS: Record<DifficultyLevel, string> = {
  trivial: 'Chatter, simple lookups, greetings',
  simple: 'Single-step analysis, summarization, tagging',
  moderate: 'Multi-step reasoning, research briefs, option analysis',
  complex: 'Expert-level analysis, decision packets, deliberation',
  critical: 'High-stakes decisions, partnerships, treasury allocation',
};

/**
 * Classification rules for difficulty levels.
 */
export interface DifficultyRules {
  maxTokens: number;
  examples: string[];
  requiresTier2?: boolean;
  requiresReview?: boolean;
}

/**
 * Default difficulty classification rules.
 */
export const DEFAULT_DIFFICULTY_RULES: Record<DifficultyLevel, DifficultyRules> = {
  trivial: {
    maxTokens: 500,
    examples: ['idle_chatter', 'greeting', 'simple_lookup', 'status_check'],
  },
  simple: {
    maxTokens: 1000,
    examples: ['summarize_signal', 'tag_content', 'translate_short', 'format_data'],
  },
  moderate: {
    maxTokens: 2000,
    examples: ['research_brief', 'option_analysis', 'risk_assessment', 'compare_options'],
  },
  complex: {
    maxTokens: 4000,
    examples: ['decision_packet', 'full_deliberation', 'strategy_synthesis', 'architecture_review'],
    requiresReview: true,
  },
  critical: {
    maxTokens: 8000,
    examples: ['high_risk_decision', 'partnership_agreement', 'treasury_allocation', 'security_audit'],
    requiresTier2: true,
    requiresReview: true,
  },
};

// ============================================
// Task Definition
// ============================================

/**
 * A task to be routed to an LLM.
 */
export interface Task {
  /** Unique task identifier */
  id: string;
  /** Task type category */
  type: TaskType;
  /** Task description/prompt */
  prompt: string;
  /** System prompt (optional) */
  systemPrompt?: string;
  /** Expected output format */
  outputFormat?: 'text' | 'json' | 'markdown';
  /** Language preference */
  language?: string;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Temperature for generation */
  temperature?: number;
  /** Required capabilities */
  requiredCapabilities?: ModelCapability[];
  /** Priority (higher = more important) */
  priority?: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Created timestamp */
  createdAt: Date;
}

/**
 * Task classification result.
 */
export interface TaskClassification {
  task: Task;
  difficulty: DifficultyLevel;
  confidence: number;
  reasoning: string;
  suggestedTokens: number;
  requiresTier2: boolean;
  requiresReview: boolean;
}

// ============================================
// Model Selection
// ============================================

/**
 * Model selection result from the router.
 */
export interface ModelSelection {
  /** Primary model to use */
  primaryModel: string;
  /** Fallback models in order */
  fallbackModels: string[];
  /** Selected tier */
  tier: LLMTier;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Quality gate configuration */
  qualityGate: QualityGateConfig;
  /** Reasoning for selection */
  reasoning: string;
}

/**
 * Default model selections by difficulty.
 */
export const DEFAULT_MODEL_SELECTIONS: Record<DifficultyLevel, Omit<ModelSelection, 'reasoning'>> = {
  trivial: {
    primaryModel: 'qwen3.5:4b',
    fallbackModels: ['qwen3.5:4b'],
    tier: 1,
    maxRetries: 2,
    qualityGate: { enabled: false, minConfidence: 0, requiresReview: false, escalateOnFailure: false },
  },
  simple: {
    primaryModel: 'qwen3.5:4b',
    fallbackModels: ['qwen3.5:4b'],
    tier: 1,
    maxRetries: 2,
    qualityGate: { enabled: false, minConfidence: 0, requiresReview: false, escalateOnFailure: false },
  },
  moderate: {
    primaryModel: 'qwen3.5:4b',
    fallbackModels: ['qwen3.5:4b'],
    tier: 1,
    maxRetries: 3,
    qualityGate: { enabled: true, minConfidence: 70, requiresReview: false, escalateOnFailure: false },
  },
  complex: {
    primaryModel: 'qwen3.5:4b',
    fallbackModels: ['claude-sonnet-4-20250514'],
    tier: 1,
    maxRetries: 3,
    qualityGate: { enabled: true, minConfidence: 80, requiresReview: true, escalateOnFailure: true },
  },
  critical: {
    primaryModel: 'claude-sonnet-4-20250514',
    fallbackModels: ['gpt-4o', 'qwen3.5:4b'],
    tier: 2,
    maxRetries: 5,
    qualityGate: { enabled: true, minConfidence: 90, requiresReview: true, escalateOnFailure: true },
  },
};

// ============================================
// Quality Gate
// ============================================

/**
 * Quality gate configuration.
 */
export interface QualityGateConfig {
  /** Whether quality gate is enabled */
  enabled: boolean;
  /** Minimum confidence score (0-100) */
  minConfidence: number;
  /** Whether human review is required */
  requiresReview: boolean;
  /** Whether to escalate on failure */
  escalateOnFailure: boolean;
}

/**
 * Quality check result.
 */
export interface QualityCheckResult {
  passed: boolean;
  confidence: number;
  issues: QualityIssue[];
  suggestions: string[];
  requiresReview: boolean;
  escalated: boolean;
}

/**
 * A quality issue found during validation.
 */
export interface QualityIssue {
  type: 'format' | 'content' | 'length' | 'confidence' | 'safety';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  field?: string;
}

// ============================================
// Generation Result
// ============================================

/**
 * LLM generation result.
 */
export interface GenerationResult {
  /** Generated content */
  content: string;
  /** Model used */
  model: string;
  /** Provider used */
  provider: ModelProvider;
  /** Token usage */
  usage: TokenUsage;
  /** Generation latency in ms */
  latencyMs: number;
  /** Cost in USD */
  costUsd: number;
  /** Finish reason */
  finishReason: 'stop' | 'length' | 'error' | 'safety';
  /** Quality check result */
  qualityCheck?: QualityCheckResult;
  /** Raw response metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Token usage information.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ============================================
// RAG Types
// ============================================

/**
 * Embedding model entry.
 */
export interface EmbeddingModel {
  id: string;
  name: string;
  provider: ModelProvider;
  dimensions: number;
  maxTokens: number;
  languages: string[];
  useCase: string;
}

/**
 * Default embedding models.
 *
 * Only one is on the shared remote Ollama; legacy entries (nomic / mxbai /
 * bge-m3) were removed when the server was consolidated to a 2-model GPU.
 */
export const DEFAULT_EMBEDDING_MODELS: EmbeddingModel[] = [
  {
    id: 'qwen3-embedding:0.6b',
    name: 'Qwen 3 Embedding 0.6B',
    provider: 'ollama',
    dimensions: 1024,
    maxTokens: 8192,
    languages: ['en', 'ko', 'zh', 'ja'],
    useCase: 'Multilingual general-purpose retrieval (Matryoshka 64–1024)',
  },
];

/**
 * Reranker model entry.
 */
export interface RerankerModel {
  id: string;
  name: string;
  provider: ModelProvider;
  maxTokens: number;
  languages: string[];
  useCase: string;
}

/**
 * Default reranker models.
 *
 * No dedicated reranker model is resident on the shared remote Ollama
 * anymore. Reranking falls back to the chat model (qwen3.5:4b) emitting a
 * relevance score per pair — slower per call but avoids a third resident
 * model on an already-tight 8GB GPU.
 */
export const DEFAULT_RERANKER_MODELS: RerankerModel[] = [
  {
    id: 'qwen3.5:4b',
    name: 'Qwen 3.5 9B (LLM-as-reranker)',
    provider: 'ollama',
    maxTokens: 512,
    languages: ['en', 'ko', 'zh', 'ja'],
    useCase: 'LLM-as-reranker — pairwise scoring via the resident chat model',
  },
];

/**
 * Embedding request.
 */
export interface EmbeddingRequest {
  texts: string[];
  model?: string;
}

/**
 * Embedding result.
 */
export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
  usage: TokenUsage;
  latencyMs: number;
}

/**
 * Rerank request.
 */
export interface RerankRequest {
  query: string;
  documents: string[];
  model?: string;
  topK?: number;
}

/**
 * Rerank result.
 */
export interface RerankResult {
  rankings: RankedDocument[];
  model: string;
  latencyMs: number;
}

/**
 * A ranked document.
 */
export interface RankedDocument {
  index: number;
  score: number;
  document: string;
}

// ============================================
// Model Router Configuration
// ============================================

/**
 * Model router configuration.
 */
export interface ModelRouterConfig {
  /** Available providers */
  providers: Record<ModelProvider, ProviderConfig>;
  /** Default tier preference */
  defaultTier: LLMTier;
  /** Maximum budget per day in USD */
  dailyBudgetUsd: number;
  /** Current budget spent today */
  budgetSpentToday: number;
  /** Enable Tier 2 fallback when Tier 1 fails */
  enableTier2Fallback: boolean;
  /** Health check interval in ms */
  healthCheckIntervalMs: number;
  /** Enable quality gates */
  enableQualityGates: boolean;
  /** Custom task type mappings */
  taskTypeMappings?: TaskTypeMapping[];
  /** Custom difficulty rules */
  difficultyRules?: Record<DifficultyLevel, DifficultyRules>;
}

/**
 * Default model router configuration.
 */
export const DEFAULT_MODEL_ROUTER_CONFIG: ModelRouterConfig = {
  providers: {
    ollama: { provider: 'ollama', baseUrl: 'http://localhost:11434' },
    anthropic: { provider: 'anthropic' },
    openai: { provider: 'openai' },
    google: { provider: 'google' },
  },
  defaultTier: 1,
  dailyBudgetUsd: 10,
  budgetSpentToday: 0,
  enableTier2Fallback: true,
  healthCheckIntervalMs: 60000,
  enableQualityGates: true,
};

// ============================================
// Events
// ============================================

/**
 * Model router event types.
 */
export interface ModelRouterEvents {
  'model:selected': { task: Task; selection: ModelSelection };
  'model:fallback': { task: Task; failedModel: string; nextModel: string; error: string };
  'model:exhausted': { task: Task; triedModels: string[]; error: string };
  'generation:started': { task: Task; model: string };
  'generation:completed': { task: Task; result: GenerationResult };
  'generation:failed': { task: Task; model: string; error: string };
  'quality:checked': { task: Task; result: QualityCheckResult };
  'quality:failed': { task: Task; result: QualityCheckResult };
  'budget:warning': { spent: number; budget: number; percentage: number };
  'budget:exceeded': { spent: number; budget: number };
  'health:checked': { model: string; result: HealthCheckResult };
  'health:degraded': { model: string; result: HealthCheckResult };
}

// ============================================
// Utility Types
// ============================================

/**
 * Model router statistics.
 */
export interface ModelRouterStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  averageLatencyMs: number;
  modelUsage: Record<string, number>;
  tierUsage: Record<LLMTier, number>;
  qualityPassRate: number;
}

/**
 * Reset stats options.
 */
export interface ResetStatsOptions {
  resetBudget?: boolean;
  resetModelUsage?: boolean;
  resetQualityStats?: boolean;
}
