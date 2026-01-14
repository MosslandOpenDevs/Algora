// ===========================================
// Model Router Package for Algora v2.0
// ===========================================

/**
 * @packageDocumentation
 *
 * The Model Router package provides intelligent LLM model selection,
 * difficulty-based routing, quality gates, and RAG capabilities
 * for Algora v2.0's agentic governance system.
 *
 * ## Core Components
 *
 * - **ModelRouter**: Task-to-model routing with fallback
 * - **ModelRegistry**: Model management and health checks
 * - **TaskDifficultyClassifier**: Difficulty classification
 * - **QualityGate**: Output validation
 * - **EmbeddingService**: Text embeddings for RAG
 * - **RerankerService**: Document reranking for RAG
 *
 * ## Example Usage
 *
 * ```typescript
 * import {
 *   createModelRouterWithDefaults,
 *   Task,
 * } from '@algora/model-router';
 *
 * // Create router with pre-seeded models
 * const router = await createModelRouterWithDefaults();
 *
 * // Create a task
 * const task: Task = {
 *   id: 'task-001',
 *   type: 'research',
 *   prompt: 'Analyze the latest developments in AI governance...',
 *   createdAt: new Date(),
 * };
 *
 * // Route and execute
 * const result = await router.execute(task);
 * console.log(result.content);
 * ```
 *
 * ## Difficulty Levels
 *
 * Tasks are classified into five difficulty levels:
 * - **trivial**: Chatter, simple lookups (Tier 1, local)
 * - **simple**: Summarization, tagging (Tier 1, local)
 * - **moderate**: Research briefs, analysis (Tier 1, quality gate)
 * - **complex**: Decision packets, deliberation (Tier 1/2, review required)
 * - **critical**: High-stakes decisions (Tier 2, approval required)
 */

// ============================================
// Types
// ============================================

export type {
  // LLM types
  LLMTier,
  ModelCapability,
  ModelProvider,
  ProviderConfig,
  ModelStatus,
  HealthCheckResult,
  ModelEntry,

  // Task types
  TaskType,
  TaskTypeMapping,
  Task,
  TaskClassification,
  DifficultyLevel,
  DifficultyRules,

  // Model selection
  ModelSelection,
  QualityGateConfig,
  QualityCheckResult,
  QualityIssue,

  // Generation
  GenerationResult,
  TokenUsage,

  // RAG types
  EmbeddingModel,
  RerankerModel,
  EmbeddingRequest,
  EmbeddingResult,
  RerankRequest,
  RerankResult,
  RankedDocument,

  // Configuration
  ModelRouterConfig,
  ModelRouterStats,
  ModelRouterEvents,
  ResetStatsOptions,
} from './types.js';

export {
  // Constants
  LLM_TIER_DESCRIPTIONS,
  MODEL_CAPABILITY_DESCRIPTIONS,
  DEFAULT_PROVIDER_CONFIGS,
  DEFAULT_TASK_TYPE_MAPPINGS,
  DIFFICULTY_DESCRIPTIONS,
  DEFAULT_DIFFICULTY_RULES,
  DEFAULT_MODEL_SELECTIONS,
  DEFAULT_EMBEDDING_MODELS,
  DEFAULT_RERANKER_MODELS,
  DEFAULT_MODEL_ROUTER_CONFIG,
} from './types.js';

// ============================================
// Model Registry
// ============================================

export {
  ModelRegistry,
  InMemoryModelRegistryStorage,
  DefaultHealthCheckProvider,
} from './registry.js';

export type {
  ModelRegistryStorage,
  HealthCheckProvider,
  ModelRegistryOptions,
} from './registry.js';

// ============================================
// Task Difficulty Classifier
// ============================================

export {
  TaskDifficultyClassifier,
  quickClassify,
  estimateTokens,
} from './classifier.js';

export type {
  ClassificationCriteria,
  ClassifierOptions,
} from './classifier.js';

// ============================================
// Model Router
// ============================================

export {
  ModelRouter,
  MockLLMProvider,
  createModelRouter,
  createModelRouterWithDefaults,
} from './router.js';

export type {
  LLMProvider,
  ModelRouterOptions,
} from './router.js';

// ============================================
// Quality Gate
// ============================================

export {
  QualityGate,
  createQualityGate,
  createDecisionPacketGate,
  coherenceValidator,
  completenessValidator,
  decisionPacketValidator,
  jsonValidator,
} from './quality-gate.js';

export type {
  QualityCheckOptions,
  QualityValidator,
  QualityGateOptions,
} from './quality-gate.js';

// ============================================
// RAG - Embeddings
// ============================================

export {
  EmbeddingService,
  MockEmbeddingProvider,
  createEmbeddingService,
  normalizeEmbedding,
  euclideanDistance,
  dotProduct,
} from './rag/embeddings.js';

export type {
  EmbeddingProvider,
  EmbeddingServiceOptions,
} from './rag/embeddings.js';

// ============================================
// RAG - Reranker
// ============================================

export {
  RerankerService,
  MockRerankerProvider,
  createRerankerService,
  ragPipeline,
} from './rag/reranker.js';

export type {
  RerankerProvider,
  RerankerServiceOptions,
  RAGPipelineOptions,
} from './rag/reranker.js';

// ============================================
// Providers
// ============================================

export {
  OllamaProvider,
  OllamaLLMProvider,
  OllamaError,
  createOllamaProvider,
  createOllamaLLMProvider,
  OLLAMA_INSTALL_COMMANDS,
  OLLAMA_HARDWARE_REQUIREMENTS,
  DEFAULT_OLLAMA_CONFIG,
  AnthropicProvider,
  AnthropicLLMProvider,
  AnthropicError,
  createAnthropicProvider,
  createAnthropicLLMProvider,
  DEFAULT_ANTHROPIC_CONFIG,
} from './providers/index.js';

export type { OllamaProviderConfig, AnthropicProviderConfig } from './providers/index.js';

// ============================================
// Factory Functions
// ============================================

import { ModelRouter } from './router.js';
import { ModelRegistry } from './registry.js';
import { TaskDifficultyClassifier } from './classifier.js';
import { QualityGate } from './quality-gate.js';
import { EmbeddingService } from './rag/embeddings.js';
import { RerankerService } from './rag/reranker.js';
import type { ModelRouterConfig } from './types.js';
import { DEFAULT_MODEL_ROUTER_CONFIG } from './types.js';

/**
 * Create a complete model routing system.
 */
export function createModelRoutingSystem(config?: Partial<ModelRouterConfig>): {
  router: ModelRouter;
  registry: ModelRegistry;
  classifier: TaskDifficultyClassifier;
  qualityGate: QualityGate;
  embeddings: EmbeddingService;
  reranker: RerankerService;
} {
  const fullConfig = {
    ...DEFAULT_MODEL_ROUTER_CONFIG,
    ...config,
  };

  const registry = new ModelRegistry({
    healthCheckIntervalMs: fullConfig.healthCheckIntervalMs,
  });
  const classifier = new TaskDifficultyClassifier();
  const qualityGate = new QualityGate();
  const embeddings = new EmbeddingService();
  const reranker = new RerankerService();

  const router = new ModelRouter({
    config: fullConfig,
    registry,
    classifier,
    qualityGate,
  });

  return {
    router,
    registry,
    classifier,
    qualityGate,
    embeddings,
    reranker,
  };
}

/**
 * Create a complete model routing system with pre-seeded models.
 */
export async function createModelRoutingSystemWithDefaults(
  config?: Partial<ModelRouterConfig>
): Promise<{
  router: ModelRouter;
  registry: ModelRegistry;
  classifier: TaskDifficultyClassifier;
  qualityGate: QualityGate;
  embeddings: EmbeddingService;
  reranker: RerankerService;
}> {
  const system = createModelRoutingSystem(config);
  await system.registry.seedDefaultModels();
  return system;
}

// ============================================
// Ollama-Specific Factory Functions
// ============================================

import { OllamaLLMProvider } from './providers/index.js';
import type { OllamaProviderConfig } from './providers/index.js';

/**
 * Create a model routing system with Ollama as the LLM provider.
 * This enables actual local LLM inference instead of mock responses.
 */
export function createOllamaModelRoutingSystem(options?: {
  config?: Partial<ModelRouterConfig>;
  ollamaConfig?: Partial<OllamaProviderConfig>;
}): {
  router: ModelRouter;
  registry: ModelRegistry;
  classifier: TaskDifficultyClassifier;
  qualityGate: QualityGate;
  embeddings: EmbeddingService;
  reranker: RerankerService;
  ollamaProvider: OllamaLLMProvider;
} {
  const fullConfig = {
    ...DEFAULT_MODEL_ROUTER_CONFIG,
    ...options?.config,
  };

  const registry = new ModelRegistry({
    healthCheckIntervalMs: fullConfig.healthCheckIntervalMs,
  });
  const classifier = new TaskDifficultyClassifier();
  const qualityGate = new QualityGate();
  const embeddings = new EmbeddingService();
  const reranker = new RerankerService();
  const ollamaProvider = new OllamaLLMProvider(options?.ollamaConfig);

  const router = new ModelRouter({
    config: fullConfig,
    registry,
    classifier,
    qualityGate,
    llmProvider: ollamaProvider,
  });

  return {
    router,
    registry,
    classifier,
    qualityGate,
    embeddings,
    reranker,
    ollamaProvider,
  };
}

/**
 * Create a model routing system with Ollama and pre-seeded models.
 */
export async function createOllamaModelRoutingSystemWithDefaults(options?: {
  config?: Partial<ModelRouterConfig>;
  ollamaConfig?: Partial<OllamaProviderConfig>;
}): Promise<{
  router: ModelRouter;
  registry: ModelRegistry;
  classifier: TaskDifficultyClassifier;
  qualityGate: QualityGate;
  embeddings: EmbeddingService;
  reranker: RerankerService;
  ollamaProvider: OllamaLLMProvider;
}> {
  const system = createOllamaModelRoutingSystem(options);
  await system.registry.seedDefaultModels();
  return system;
}
