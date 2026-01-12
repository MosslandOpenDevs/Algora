// ===========================================
// Workflow A Tests
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorkflowAHandler,
  createWorkflowAHandler,
  DEFAULT_WORKFLOW_A_CONFIG,
} from '../workflows/workflow-a.js';
import type { WorkflowContext, AgentOpinion } from '../types.js';
import type { LLMProvider } from '../specialist-manager.js';

// Mock LLM Provider
function createMockLLMProvider(): LLMProvider {
  return {
    generate: vi.fn().mockResolvedValue({
      content: 'Mock LLM response content',
      model: 'mock-model',
      tokensUsed: 100,
    }),
    isAvailable: vi.fn().mockReturnValue(true),
    getModelInfo: vi.fn().mockReturnValue({
      id: 'mock-model',
      contextWindow: 8000,
      tokensPerSecond: 100,
    }),
  };
}

// Create mock context
function createMockContext(): WorkflowContext {
  return {
    issueId: 'test-issue-001',
    workflowType: 'A',
    currentState: 'RESEARCH',
    issue: {
      id: 'test-issue-001',
      title: 'AI Research for Mossland',
      description: 'Research AI developments relevant to Mossland ecosystem',
      category: 'blockchain_ai_ecosystem',
      source: 'community',
      signalIds: ['signal-1', 'signal-2'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    stateHistory: [],
    agentOpinions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('WorkflowAHandler', () => {
  let handler: WorkflowAHandler;
  let mockProvider: LLMProvider;

  beforeEach(() => {
    mockProvider = createMockLLMProvider();
    handler = new WorkflowAHandler(mockProvider);
  });

  describe('createWorkflowAHandler', () => {
    it('should create a handler with default config', () => {
      const h = createWorkflowAHandler(mockProvider);
      expect(h).toBeInstanceOf(WorkflowAHandler);
    });

    it('should create a handler with custom config', () => {
      const h = createWorkflowAHandler(mockProvider, {
        minPapersForDigest: 10,
        assessmentThreshold: 90,
      });
      expect(h).toBeInstanceOf(WorkflowAHandler);
    });
  });

  describe('DEFAULT_WORKFLOW_A_CONFIG', () => {
    it('should have reasonable default values', () => {
      expect(DEFAULT_WORKFLOW_A_CONFIG.minPapersForDigest).toBe(5);
      expect(DEFAULT_WORKFLOW_A_CONFIG.minRelevanceScore).toBe(60);
      expect(DEFAULT_WORKFLOW_A_CONFIG.assessmentThreshold).toBe(80);
      expect(DEFAULT_WORKFLOW_A_CONFIG.digestSchedule).toBe('weekly');
      expect(DEFAULT_WORKFLOW_A_CONFIG.targetTopics).toContain('artificial_intelligence');
    });
  });

  describe('executeResearchPhase', () => {
    it('should execute research phase and return research brief', async () => {
      const context = createMockContext();
      const signals = [
        {
          title: 'New AI Paper',
          content: 'Research on autonomous governance systems',
          source: 'arxiv',
          url: 'https://arxiv.org/paper/1234',
        },
        {
          title: 'Blockchain Update',
          content: 'Latest developments in decentralized systems',
          source: 'blog',
        },
      ];

      const result = await handler.executeResearchPhase(context, signals);

      expect(result).toHaveProperty('researchBrief');
      expect(result).toHaveProperty('papers');
      expect(result.researchBrief).toHaveProperty('id');
      expect(result.researchBrief).toHaveProperty('issueId', 'test-issue-001');
      expect(result.researchBrief).toHaveProperty('summary');
      expect(result.researchBrief).toHaveProperty('keyFindings');
      expect(mockProvider.generate).toHaveBeenCalled();
    });

    it('should handle empty signals', async () => {
      const context = createMockContext();
      const result = await handler.executeResearchPhase(context, []);

      expect(result.papers).toHaveLength(0);
      expect(result.researchBrief).toBeDefined();
    });
  });

  describe('executeDeliberationPhase', () => {
    it('should gather agent opinions and calculate consensus', async () => {
      const context = createMockContext();
      const researchBrief = {
        id: 'brief-001',
        issueId: 'test-issue-001',
        papers: [],
        summary: 'Test summary',
        keyFindings: ['Finding 1', 'Finding 2'],
        trendAnalysis: 'Trend analysis',
        relevanceToMossland: 'High relevance',
        generatedAt: new Date(),
        modelUsed: 'mock-model',
      };

      const result = await handler.executeDeliberationPhase(context, researchBrief);

      expect(result).toHaveProperty('opinions');
      expect(result).toHaveProperty('consensusScore');
      expect(result.opinions.length).toBeGreaterThan(0);
      expect(result.consensusScore).toBeGreaterThanOrEqual(0);
      expect(result.consensusScore).toBeLessThanOrEqual(100);
    });
  });

  describe('generateResearchDigest', () => {
    it('should generate a weekly research digest', async () => {
      const papers = [
        {
          id: 'paper-1',
          title: 'AI Governance Paper',
          authors: ['Author 1'],
          abstract: 'Abstract about AI governance',
          source: 'arxiv' as const,
          sourceUrl: 'https://arxiv.org/1',
          publishedAt: new Date(),
          topics: ['artificial_intelligence' as const, 'governance' as const],
          relevanceScore: 85,
        },
      ];

      const digest = await handler.generateResearchDigest(papers, 2, 2026);

      expect(digest).toHaveProperty('id');
      expect(digest.weekNumber).toBe(2);
      expect(digest.year).toBe(2026);
      expect(digest).toHaveProperty('title');
      expect(digest).toHaveProperty('sections');
      expect(digest).toHaveProperty('provenance');
    });

    it('should handle empty papers array', async () => {
      const digest = await handler.generateResearchDigest([], 1, 2026);
      expect(digest).toBeDefined();
      expect(digest.sections).toHaveLength(0);
    });
  });

  describe('generateTechnologyAssessment', () => {
    it('should generate a technology assessment', async () => {
      const context = createMockContext();
      const researchBrief = {
        id: 'brief-001',
        issueId: 'test-issue-001',
        papers: [
          {
            id: 'paper-1',
            title: 'AI Paper',
            authors: ['Author'],
            abstract: 'Abstract',
            source: 'arxiv' as const,
            sourceUrl: 'https://arxiv.org/1',
            publishedAt: new Date(),
            topics: ['artificial_intelligence' as const],
            relevanceScore: 90,
          },
        ],
        summary: 'High-impact AI research findings',
        keyFindings: ['Key finding 1'],
        trendAnalysis: 'Strong upward trend',
        relevanceToMossland: 'Very high relevance',
        generatedAt: new Date(),
        modelUsed: 'mock-model',
      };
      const opinions: AgentOpinion[] = [
        {
          agentId: 'agent-1',
          agentName: 'Researcher 1',
          position: 'Positive outlook',
          reasoning: 'Strong evidence',
          confidence: 85,
          timestamp: new Date(),
        },
      ];

      const assessment = await handler.generateTechnologyAssessment(
        context,
        researchBrief,
        opinions
      );

      expect(assessment).toHaveProperty('id');
      expect(assessment.issueId).toBe('test-issue-001');
      expect(assessment).toHaveProperty('executiveSummary');
      expect(assessment).toHaveProperty('mosslandRelevance');
      expect(assessment.mosslandRelevance).toHaveProperty('score');
      expect(assessment.mosslandRelevance).toHaveProperty('opportunities');
      expect(assessment.mosslandRelevance).toHaveProperty('risks');
      expect(assessment.mosslandRelevance).toHaveProperty('recommendations');
    });
  });

  describe('shouldGenerateAssessment', () => {
    it('should return true for high-relevance brief', () => {
      const brief = {
        id: 'brief-001',
        issueId: 'test-issue-001',
        papers: [
          {
            id: 'paper-1',
            title: 'AI Paper',
            authors: ['Author'],
            abstract: 'Abstract',
            source: 'arxiv' as const,
            sourceUrl: 'https://arxiv.org/1',
            publishedAt: new Date(),
            topics: ['artificial_intelligence' as const],
            relevanceScore: 95,
          },
        ],
        summary: 'High-impact findings',
        keyFindings: ['Key finding 1', 'Key finding 2', 'Key finding 3'],
        trendAnalysis: 'Strong trend',
        relevanceToMossland: 'Very high',
        generatedAt: new Date(),
        modelUsed: 'mock-model',
      };

      expect(handler.shouldGenerateAssessment(brief)).toBe(true);
    });

    it('should return false for low-relevance brief', () => {
      const brief = {
        id: 'brief-001',
        issueId: 'test-issue-001',
        papers: [
          {
            id: 'paper-1',
            title: 'AI Paper',
            authors: ['Author'],
            abstract: 'Abstract',
            source: 'arxiv' as const,
            sourceUrl: 'https://arxiv.org/1',
            publishedAt: new Date(),
            topics: ['artificial_intelligence' as const],
            relevanceScore: 50,
          },
        ],
        summary: 'Low-impact findings',
        keyFindings: [],
        trendAnalysis: 'Weak trend',
        relevanceToMossland: 'Low',
        generatedAt: new Date(),
        modelUsed: 'mock-model',
      };

      expect(handler.shouldGenerateAssessment(brief)).toBe(false);
    });

    it('should return false for brief with no papers', () => {
      const brief = {
        id: 'brief-001',
        issueId: 'test-issue-001',
        papers: [],
        summary: 'No papers',
        keyFindings: [],
        trendAnalysis: 'No data',
        relevanceToMossland: 'Unknown',
        generatedAt: new Date(),
        modelUsed: 'mock-model',
      };

      expect(handler.shouldGenerateAssessment(brief)).toBe(false);
    });
  });
});
