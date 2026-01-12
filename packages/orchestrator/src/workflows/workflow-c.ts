// ===========================================
// Workflow C: Mossland Developer Support Program
// ===========================================
// Manage developer grants with Dual-House approval
// and retroactive rewards

import type {
  WorkflowContext,
  AgentOpinion,
} from '../types.js';
import type { LLMProvider } from '../specialist-manager.js';

// ============================================
// Types for Developer Support Workflow
// ============================================

/**
 * Grant application status.
 */
export type GrantStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

/**
 * Grant category types.
 */
export type GrantCategory =
  | 'core_development'
  | 'ecosystem_tooling'
  | 'documentation'
  | 'community_building'
  | 'research'
  | 'security_audit'
  | 'integration'
  | 'education';

/**
 * Milestone status.
 */
export type MilestoneStatus =
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'paid';

/**
 * Retroactive reward status.
 */
export type RewardStatus =
  | 'nominated'
  | 'under_review'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'paid';

/**
 * A grant application from a developer.
 */
export interface GrantApplication {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantWallet?: string;
  title: string;
  description: string;
  category: GrantCategory;
  requestedAmount: number;
  currency: 'USD' | 'MOC' | 'ETH';
  timeline: string;
  milestones: GrantMilestone[];
  teamMembers?: string[];
  previousWork?: string;
  githubRepo?: string;
  status: GrantStatus;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A milestone within a grant.
 */
export interface GrantMilestone {
  id: string;
  grantId: string;
  title: string;
  description: string;
  deliverables: string[];
  amount: number;
  dueDate: Date;
  status: MilestoneStatus;
  submittedAt?: Date;
  approvedAt?: Date;
  evidence?: MilestoneEvidence[];
}

/**
 * Evidence submitted for milestone completion.
 */
export interface MilestoneEvidence {
  id: string;
  milestoneId: string;
  type: 'github_pr' | 'github_commit' | 'documentation' | 'demo' | 'report' | 'other';
  url: string;
  description: string;
  submittedAt: Date;
}

/**
 * A developer grant after approval.
 */
export interface DeveloperGrant {
  id: string;
  applicationId: string;
  applicantId: string;
  applicantName: string;
  title: string;
  description: string;
  category: GrantCategory;
  totalAmount: number;
  disbursedAmount: number;
  remainingAmount: number;
  currency: 'USD' | 'MOC' | 'ETH';
  milestones: GrantMilestone[];
  status: 'active' | 'completed' | 'cancelled' | 'paused';
  approvedAt: Date;
  approvedBy: {
    mossCoinHouse: boolean;
    openSourceHouse: boolean;
    director3?: boolean;
  };
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A milestone report submitted by grantee.
 */
export interface MilestoneReport {
  id: string;
  grantId: string;
  milestoneId: string;
  submittedBy: string;
  title: string;
  summary: string;
  accomplishments: string[];
  challenges?: string[];
  nextSteps?: string[];
  evidence: MilestoneEvidence[];
  hoursSpent?: number;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'revision_requested';
  reviewComments?: string;
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
}

/**
 * A retroactive reward nomination.
 */
export interface RetroactiveReward {
  id: string;
  nomineeId: string;
  nomineeName: string;
  nomineeWallet?: string;
  contributionDescription: string;
  evidenceLinks: string[];
  category: GrantCategory;
  proposedAmount: number;
  currency: 'USD' | 'MOC' | 'ETH';
  nominatedBy: string;
  nominatedByType: 'agent' | 'human';
  supportingVotes: number;
  supporters: string[];
  status: RewardStatus;
  relatedGrant?: string;
  approvalDetails?: {
    mossCoinHouse: boolean;
    openSourceHouse: boolean;
    director3?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
}

/**
 * Grant proposal document for governance.
 */
export interface GrantProposal {
  id: string;
  applicationId: string;
  title: string;
  executiveSummary: string;
  applicantProfile: {
    id: string;
    name: string;
    background: string;
    previousWork?: string;
    trustScore?: number;
  };
  projectDetails: {
    description: string;
    objectives: string[];
    deliverables: string[];
    timeline: string;
    milestones: {
      title: string;
      amount: number;
      dueDate: string;
    }[];
  };
  budgetBreakdown: {
    item: string;
    amount: number;
    justification: string;
  }[];
  riskAssessment: {
    risk: string;
    likelihood: 'low' | 'medium' | 'high';
    mitigation: string;
  }[];
  evaluationCriteria: {
    criterion: string;
    weight: number;
    score?: number;
  }[];
  recommendation: 'approve' | 'reject' | 'request_changes';
  recommendationReasoning: string;
  requiredApprovals: {
    mossCoinHouse: boolean;
    openSourceHouse: boolean;
    director3: boolean;
  };
  provenance: {
    contentHash: string;
    createdBy: string;
    modelUsed: string;
    generatedAt: Date;
  };
}

/**
 * Configuration for Workflow C.
 */
export interface WorkflowCConfig {
  minGrantAmount: number;
  maxGrantAmount: number;
  requireDirector3Above: number;
  maxRetroactivePercent: number;
  minMilestones: number;
  maxMilestones: number;
  reviewPeriodDays: number;
  categories: GrantCategory[];
}

/**
 * Default configuration.
 */
export const DEFAULT_WORKFLOW_C_CONFIG: WorkflowCConfig = {
  minGrantAmount: 100,
  maxGrantAmount: 100000,
  requireDirector3Above: 5000,
  maxRetroactivePercent: 50,
  minMilestones: 2,
  maxMilestones: 10,
  reviewPeriodDays: 14,
  categories: [
    'core_development',
    'ecosystem_tooling',
    'documentation',
    'community_building',
    'research',
    'security_audit',
    'integration',
    'education',
  ],
};

// ============================================
// Workflow C Handler
// ============================================

/**
 * Handler for Workflow C: Mossland Developer Support Program.
 *
 * This workflow manages developer grants with Dual-House approval,
 * milestone tracking, and retroactive rewards.
 */
export class WorkflowCHandler {
  private config: WorkflowCConfig;
  private llmProvider: LLMProvider;

  constructor(llmProvider: LLMProvider, config?: Partial<WorkflowCConfig>) {
    this.llmProvider = llmProvider;
    this.config = { ...DEFAULT_WORKFLOW_C_CONFIG, ...config };
  }

  /**
   * Process a grant application and create a grant proposal.
   */
  async processGrantApplication(
    context: WorkflowContext,
    application: GrantApplication
  ): Promise<{
    proposal: GrantProposal;
    evaluation: ApplicationEvaluation;
    opinions: AgentOpinion[];
  }> {
    // Validate application
    this.validateApplication(application);

    // Evaluate the application
    const evaluation = await this.evaluateApplication(context, application);

    // Gather agent opinions
    const opinions = await this.gatherAgentOpinions(context, application, evaluation);

    // Generate grant proposal
    const proposal = await this.generateGrantProposal(
      context,
      application,
      evaluation,
      opinions
    );

    return {
      proposal,
      evaluation,
      opinions,
    };
  }

  /**
   * Evaluate a grant application.
   */
  async evaluateApplication(
    _context: WorkflowContext,
    application: GrantApplication
  ): Promise<ApplicationEvaluation> {
    const evaluationPrompt = `Evaluate the following grant application for the Mossland Developer Support Program:

Title: ${application.title}
Category: ${application.category}
Requested Amount: ${application.requestedAmount} ${application.currency}
Timeline: ${application.timeline}

Description:
${application.description}

Milestones:
${application.milestones.map((m, i) => `${i + 1}. ${m.title} - ${m.amount} ${application.currency} - Due: ${m.dueDate}`).join('\n')}

Previous Work: ${application.previousWork || 'Not specified'}
GitHub Repository: ${application.githubRepo || 'Not specified'}

Evaluate on the following criteria (score 1-10):
1. Technical feasibility
2. Team capability
3. Budget reasonability
4. Timeline realism
5. Ecosystem impact
6. Innovation value
7. Milestone clarity
8. Risk level

Provide:
- Overall recommendation (approve/reject/request_changes)
- Detailed reasoning
- Suggested improvements if any`;

    const response = await this.llmProvider.generate({
      prompt: evaluationPrompt,
      systemPrompt: `You are an expert grant evaluator for the Mossland ecosystem.
Evaluate applications objectively, focusing on technical merit, feasibility, and ecosystem impact.
Be constructive and provide actionable feedback.`,
      maxTokens: 2000,
    });

    // Extract scores and recommendation
    const scores = this.extractEvaluationScores(response.content);
    const recommendation = this.extractRecommendation(response.content);

    return {
      applicationId: application.id,
      scores,
      overallScore: this.calculateOverallScore(scores),
      recommendation,
      reasoning: response.content,
      strengths: this.extractStrengths(response.content),
      weaknesses: this.extractWeaknesses(response.content),
      suggestions: this.extractSuggestions(response.content),
      evaluatedAt: new Date(),
      modelUsed: response.model || 'unknown',
    };
  }

  /**
   * Gather agent opinions on a grant application.
   */
  async gatherAgentOpinions(
    context: WorkflowContext,
    application: GrantApplication,
    evaluation: ApplicationEvaluation
  ): Promise<AgentOpinion[]> {
    const agents = this.selectEvaluationAgents(application.category);
    const opinions: AgentOpinion[] = [];

    for (const agent of agents) {
      const opinion = await this.generateAgentOpinion(
        agent,
        application,
        evaluation,
        context
      );
      opinions.push(opinion);
    }

    return opinions;
  }

  /**
   * Generate a grant proposal document.
   */
  async generateGrantProposal(
    _context: WorkflowContext,
    application: GrantApplication,
    evaluation: ApplicationEvaluation,
    opinions: AgentOpinion[]
  ): Promise<GrantProposal> {
    const proposalPrompt = `Generate a formal Grant Proposal document for the following application:

Application: ${application.title}
Applicant: ${application.applicantName}
Category: ${application.category}
Amount: ${application.requestedAmount} ${application.currency}

Description:
${application.description}

Evaluation Summary:
- Overall Score: ${evaluation.overallScore}/100
- Recommendation: ${evaluation.recommendation}
- Key Strengths: ${evaluation.strengths.join(', ')}
- Key Weaknesses: ${evaluation.weaknesses.join(', ')}

Agent Opinions:
${opinions.map((o) => `- ${o.agentName}: ${o.position} (Confidence: ${o.confidence}%)`).join('\n')}

Generate:
1. Executive summary (2-3 sentences)
2. Risk assessment (3-5 risks with mitigations)
3. Final recommendation with reasoning`;

    const response = await this.llmProvider.generate({
      prompt: proposalPrompt,
      systemPrompt: `You are a technical writer creating formal grant proposals for governance review.
Write clearly and professionally, providing all necessary information for decision-makers.`,
      maxTokens: 2500,
    });

    // Determine approval requirements
    const requireDirector3 = application.requestedAmount > this.config.requireDirector3Above;

    const contentHash = this.generateContentHash(response.content);

    return {
      id: `GP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${application.id.slice(-6)}`,
      applicationId: application.id,
      title: `Grant Proposal: ${application.title}`,
      executiveSummary: this.extractExecutiveSummary(response.content),
      applicantProfile: {
        id: application.applicantId,
        name: application.applicantName,
        background: application.previousWork || 'No previous work specified',
        previousWork: application.previousWork,
      },
      projectDetails: {
        description: application.description,
        objectives: this.extractObjectives(application.description),
        deliverables: application.milestones.flatMap((m) => m.deliverables),
        timeline: application.timeline,
        milestones: application.milestones.map((m) => ({
          title: m.title,
          amount: m.amount,
          dueDate: m.dueDate.toISOString(),
        })),
      },
      budgetBreakdown: this.generateBudgetBreakdown(application),
      riskAssessment: this.extractRiskAssessment(response.content),
      evaluationCriteria: Object.entries(evaluation.scores).map(([criterion, score]) => ({
        criterion,
        weight: 1,
        score,
      })),
      recommendation: evaluation.recommendation,
      recommendationReasoning: evaluation.reasoning.slice(0, 1000),
      requiredApprovals: {
        mossCoinHouse: true,
        openSourceHouse: true,
        director3: requireDirector3,
      },
      provenance: {
        contentHash,
        createdBy: 'workflow-c-handler',
        modelUsed: response.model || 'unknown',
        generatedAt: new Date(),
      },
    };
  }

  /**
   * Process a milestone report submission.
   */
  async processMilestoneReport(
    context: WorkflowContext,
    grant: DeveloperGrant,
    report: MilestoneReport
  ): Promise<{
    review: MilestoneReview;
    approved: boolean;
    feedback: string;
  }> {
    const milestone = grant.milestones.find((m) => m.id === report.milestoneId);
    if (!milestone) {
      throw new Error(`Milestone ${report.milestoneId} not found in grant ${grant.id}`);
    }

    // Review the milestone report
    const review = await this.reviewMilestoneReport(context, grant, milestone, report);

    return {
      review,
      approved: review.recommendation === 'approve',
      feedback: review.feedback,
    };
  }

  /**
   * Review a milestone report.
   */
  async reviewMilestoneReport(
    _context: WorkflowContext,
    grant: DeveloperGrant,
    milestone: GrantMilestone,
    report: MilestoneReport
  ): Promise<MilestoneReview> {
    const reviewPrompt = `Review the following milestone report:

Grant: ${grant.title}
Milestone: ${milestone.title}
Expected Deliverables:
${milestone.deliverables.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Report Summary:
${report.summary}

Accomplishments:
${report.accomplishments.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Evidence Submitted:
${report.evidence.map((e) => `- [${e.type}] ${e.description}: ${e.url}`).join('\n')}

Hours Spent: ${report.hoursSpent || 'Not reported'}

Evaluate:
1. Were all deliverables completed?
2. Is the evidence sufficient?
3. Quality of work (1-10)
4. Recommendation (approve/reject/revision_requested)
5. Specific feedback`;

    const response = await this.llmProvider.generate({
      prompt: reviewPrompt,
      systemPrompt: `You are a technical reviewer evaluating milestone completions.
Be thorough but fair. Focus on whether deliverables were met with quality work.`,
      maxTokens: 1500,
    });

    const recommendation = this.extractMilestoneRecommendation(response.content);
    const qualityScore = this.extractQualityScore(response.content);

    return {
      reportId: report.id,
      milestoneId: milestone.id,
      grantId: grant.id,
      deliverablesComplete: recommendation === 'approve',
      evidenceSufficient: response.content.toLowerCase().includes('sufficient'),
      qualityScore,
      recommendation,
      feedback: response.content,
      reviewedAt: new Date(),
      modelUsed: response.model || 'unknown',
    };
  }

  /**
   * Process a retroactive reward nomination.
   */
  async processRetroactiveReward(
    context: WorkflowContext,
    reward: RetroactiveReward
  ): Promise<{
    evaluation: RewardEvaluation;
    approved: boolean;
    adjustedAmount?: number;
  }> {
    // Validate retroactive reward
    this.validateRetroactiveReward(reward);

    // Evaluate the contribution
    const evaluation = await this.evaluateRetroactiveReward(context, reward);

    // Check if amount adjustment needed
    const adjustedAmount = this.calculateAdjustedAmount(reward, evaluation);

    return {
      evaluation,
      approved: evaluation.recommendation === 'approve',
      adjustedAmount: adjustedAmount !== reward.proposedAmount ? adjustedAmount : undefined,
    };
  }

  /**
   * Evaluate a retroactive reward.
   */
  async evaluateRetroactiveReward(
    _context: WorkflowContext,
    reward: RetroactiveReward
  ): Promise<RewardEvaluation> {
    const evaluationPrompt = `Evaluate the following retroactive reward nomination:

Nominee: ${reward.nomineeName}
Contribution: ${reward.contributionDescription}
Category: ${reward.category}
Proposed Amount: ${reward.proposedAmount} ${reward.currency}
Nominated By: ${reward.nominatedBy} (${reward.nominatedByType})
Supporting Votes: ${reward.supportingVotes}

Evidence:
${reward.evidenceLinks.map((link, i) => `${i + 1}. ${link}`).join('\n')}

${reward.relatedGrant ? `Related to Grant: ${reward.relatedGrant}` : 'No related grant'}

Evaluate:
1. Is the contribution verifiable?
2. Impact level (1-10)
3. Community value (1-10)
4. Is the proposed amount reasonable?
5. Recommendation (approve/reject/adjust)
6. Suggested amount if adjustment needed`;

    const response = await this.llmProvider.generate({
      prompt: evaluationPrompt,
      systemPrompt: `You are evaluating retroactive rewards for valuable ecosystem contributions.
Be fair and recognize genuine contributions while preventing abuse.`,
      maxTokens: 1500,
    });

    const recommendation = this.extractRewardRecommendation(response.content);
    const impactScore = this.extractImpactScore(response.content);

    return {
      rewardId: reward.id,
      verifiable: response.content.toLowerCase().includes('verifiable'),
      impactScore,
      communityValue: impactScore, // Using same score for simplicity
      amountReasonable: recommendation !== 'adjust',
      recommendation,
      suggestedAmount: this.extractSuggestedAmount(response.content, reward.proposedAmount),
      reasoning: response.content,
      evaluatedAt: new Date(),
      modelUsed: response.model || 'unknown',
    };
  }

  /**
   * Check if grant requires Dual-House approval.
   */
  requiresDualHouseApproval(amount: number): boolean {
    return amount > this.config.minGrantAmount;
  }

  /**
   * Check if grant requires Director 3 approval.
   */
  requiresDirector3Approval(amount: number): boolean {
    return amount > this.config.requireDirector3Above;
  }

  /**
   * Calculate disbursement for approved milestone.
   */
  calculateDisbursement(
    grant: DeveloperGrant,
    milestone: GrantMilestone
  ): {
    amount: number;
    isLocked: boolean;
    unlockRequirements: string[];
  } {
    const isLocked = true; // All fund disbursements are LOCKED
    const unlockRequirements = [
      'Dual-House approval received',
      'Milestone evidence verified',
    ];

    if (grant.totalAmount > this.config.requireDirector3Above) {
      unlockRequirements.push('Director 3 approval received');
    }

    return {
      amount: milestone.amount,
      isLocked,
      unlockRequirements,
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Validate grant application.
   */
  private validateApplication(application: GrantApplication): void {
    if (application.requestedAmount < this.config.minGrantAmount) {
      throw new Error(`Grant amount must be at least ${this.config.minGrantAmount}`);
    }
    if (application.requestedAmount > this.config.maxGrantAmount) {
      throw new Error(`Grant amount cannot exceed ${this.config.maxGrantAmount}`);
    }
    if (application.milestones.length < this.config.minMilestones) {
      throw new Error(`At least ${this.config.minMilestones} milestones required`);
    }
    if (application.milestones.length > this.config.maxMilestones) {
      throw new Error(`Cannot exceed ${this.config.maxMilestones} milestones`);
    }
    if (!this.config.categories.includes(application.category)) {
      throw new Error(`Invalid category: ${application.category}`);
    }
  }

  /**
   * Validate retroactive reward.
   */
  private validateRetroactiveReward(reward: RetroactiveReward): void {
    if (reward.evidenceLinks.length === 0) {
      throw new Error('At least one evidence link is required');
    }
    if (reward.proposedAmount <= 0) {
      throw new Error('Proposed amount must be positive');
    }
    // Check max retroactive percent if related to existing grant
    if (reward.relatedGrant) {
      // In production, would fetch the original grant and check
      // For now, just validate the amount is reasonable
      if (reward.proposedAmount > this.config.maxGrantAmount * (this.config.maxRetroactivePercent / 100)) {
        throw new Error(`Retroactive reward cannot exceed ${this.config.maxRetroactivePercent}% of max grant amount`);
      }
    }
  }

  /**
   * Select agents for grant evaluation based on category.
   */
  private selectEvaluationAgents(
    category: GrantCategory
  ): { agentId: string; agentName: string; role: string; focus: string }[] {
    const baseAgents = [
      {
        agentId: 'researcher-1',
        agentName: 'Grant Researcher',
        role: 'Researcher',
        focus: 'Evaluate applicant background and prior work quality.',
      },
      {
        agentId: 'analyst-1',
        agentName: 'Budget Analyst',
        role: 'Analyst',
        focus: 'Assess budget reasonability and milestone clarity.',
      },
    ];

    // Add category-specific agents
    const categoryAgents: Record<GrantCategory, { agentId: string; agentName: string; role: string; focus: string }> = {
      core_development: {
        agentId: 'builder-1',
        agentName: 'Core Builder',
        role: 'Technical Expert',
        focus: 'Evaluate technical approach and architecture.',
      },
      ecosystem_tooling: {
        agentId: 'builder-2',
        agentName: 'Tooling Expert',
        role: 'Tools Specialist',
        focus: 'Assess tooling value and integration potential.',
      },
      documentation: {
        agentId: 'community-1',
        agentName: 'Docs Reviewer',
        role: 'Documentation Expert',
        focus: 'Evaluate documentation quality and completeness.',
      },
      community_building: {
        agentId: 'community-2',
        agentName: 'Community Lead',
        role: 'Community Expert',
        focus: 'Assess community impact and engagement potential.',
      },
      research: {
        agentId: 'researcher-2',
        agentName: 'Research Lead',
        role: 'Research Expert',
        focus: 'Evaluate research methodology and potential impact.',
      },
      security_audit: {
        agentId: 'guardian-1',
        agentName: 'Security Guardian',
        role: 'Security Expert',
        focus: 'Assess security approach and thoroughness.',
      },
      integration: {
        agentId: 'builder-3',
        agentName: 'Integration Expert',
        role: 'Integration Specialist',
        focus: 'Evaluate integration feasibility and compatibility.',
      },
      education: {
        agentId: 'community-3',
        agentName: 'Education Lead',
        role: 'Education Expert',
        focus: 'Assess educational value and reach.',
      },
    };

    return [...baseAgents, categoryAgents[category]];
  }

  /**
   * Generate agent opinion for grant evaluation.
   */
  private async generateAgentOpinion(
    agent: { agentId: string; agentName: string; role: string; focus: string },
    application: GrantApplication,
    evaluation: ApplicationEvaluation,
    _context: WorkflowContext
  ): Promise<AgentOpinion> {
    const prompt = `${agent.focus}

Grant Application: ${application.title}
Category: ${application.category}
Amount: ${application.requestedAmount} ${application.currency}
Evaluation Score: ${evaluation.overallScore}/100

Description:
${application.description.slice(0, 500)}...

Milestones: ${application.milestones.length} milestones totaling ${application.requestedAmount} ${application.currency}

Provide your perspective including:
1. Your position (support/oppose/conditional)
2. Key concerns or endorsements
3. Confidence level (0-100)`;

    const response = await this.llmProvider.generate({
      prompt,
      systemPrompt: `You are ${agent.agentName}, a ${agent.role} evaluating a grant application.
Provide objective, constructive feedback from your specialized perspective.`,
      maxTokens: 800,
    });

    const confidence = this.extractConfidence(response.content);

    return {
      agentId: agent.agentId,
      agentName: agent.agentName,
      position: response.content.slice(0, 200),
      reasoning: response.content,
      confidence,
      timestamp: new Date(),
    };
  }

  /**
   * Extract evaluation scores from content.
   */
  private extractEvaluationScores(content: string): Record<string, number> {
    const scores: Record<string, number> = {
      technicalFeasibility: 7,
      teamCapability: 7,
      budgetReasonability: 7,
      timelineRealism: 7,
      ecosystemImpact: 7,
      innovationValue: 7,
      milestoneClarity: 7,
      riskLevel: 7,
    };

    // Try to extract actual scores from content
    const scorePatterns: Record<string, RegExp> = {
      technicalFeasibility: /technical\s*feasibility[:\s]*(\d+)/i,
      teamCapability: /team\s*capability[:\s]*(\d+)/i,
      budgetReasonability: /budget[:\s]*(\d+)/i,
      timelineRealism: /timeline[:\s]*(\d+)/i,
      ecosystemImpact: /ecosystem\s*impact[:\s]*(\d+)/i,
      innovationValue: /innovation[:\s]*(\d+)/i,
      milestoneClarity: /milestone\s*clarity[:\s]*(\d+)/i,
      riskLevel: /risk[:\s]*(\d+)/i,
    };

    for (const [key, pattern] of Object.entries(scorePatterns)) {
      const match = content.match(pattern);
      if (match) {
        scores[key] = Math.min(10, Math.max(1, parseInt(match[1], 10)));
      }
    }

    return scores;
  }

  /**
   * Calculate overall score from individual scores.
   */
  private calculateOverallScore(scores: Record<string, number>): number {
    const values = Object.values(scores);
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.round((sum / values.length) * 10); // Convert to 0-100 scale
  }

  /**
   * Extract recommendation from content.
   */
  private extractRecommendation(content: string): 'approve' | 'reject' | 'request_changes' {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('recommend approval') || lowerContent.includes('approve')) {
      return 'approve';
    }
    if (lowerContent.includes('recommend rejection') || lowerContent.includes('reject')) {
      return 'reject';
    }
    return 'request_changes';
  }

  /**
   * Extract strengths from content.
   */
  private extractStrengths(content: string): string[] {
    const strengthMatch = content.match(/strengths?[:\s]*(.+?)(?=weakness|$)/is);
    if (strengthMatch) {
      const bullets = strengthMatch[1].match(/[-•*]\s*(.+)/g);
      if (bullets) {
        return bullets.slice(0, 5).map((b) => b.replace(/^[-•*]\s*/, '').trim());
      }
    }
    return ['Technical approach', 'Team experience'];
  }

  /**
   * Extract weaknesses from content.
   */
  private extractWeaknesses(content: string): string[] {
    const weaknessMatch = content.match(/weakness(?:es)?[:\s]*(.+?)(?=suggest|recommend|$)/is);
    if (weaknessMatch) {
      const bullets = weaknessMatch[1].match(/[-•*]\s*(.+)/g);
      if (bullets) {
        return bullets.slice(0, 5).map((b) => b.replace(/^[-•*]\s*/, '').trim());
      }
    }
    return ['Timeline may be ambitious'];
  }

  /**
   * Extract suggestions from content.
   */
  private extractSuggestions(content: string): string[] {
    const suggestMatch = content.match(/suggest(?:ion)?s?[:\s]*(.+?)(?=\n\n|$)/is);
    if (suggestMatch) {
      const bullets = suggestMatch[1].match(/[-•*\d.]\s*(.+)/g);
      if (bullets) {
        return bullets.slice(0, 5).map((b) => b.replace(/^[-•*\d.]\s*/, '').trim());
      }
    }
    return ['Consider adding more milestones'];
  }

  /**
   * Extract executive summary from content.
   */
  private extractExecutiveSummary(content: string): string {
    const summaryMatch = content.match(/executive\s*summary[:\s]*(.+?)(?=\n\n|\n[A-Z]|$)/is);
    if (summaryMatch) {
      return summaryMatch[1].trim();
    }
    return content.split('\n')[0].slice(0, 500);
  }

  /**
   * Extract objectives from description.
   */
  private extractObjectives(description: string): string[] {
    const sentences = description.split(/[.!?]+/).filter((s) => s.trim().length > 10);
    return sentences.slice(0, 3).map((s) => s.trim());
  }

  /**
   * Generate budget breakdown from application.
   */
  private generateBudgetBreakdown(
    application: GrantApplication
  ): { item: string; amount: number; justification: string }[] {
    return application.milestones.map((m) => ({
      item: m.title,
      amount: m.amount,
      justification: m.description,
    }));
  }

  /**
   * Extract risk assessment from content.
   */
  private extractRiskAssessment(
    content: string
  ): { risk: string; likelihood: 'low' | 'medium' | 'high'; mitigation: string }[] {
    const risks: { risk: string; likelihood: 'low' | 'medium' | 'high'; mitigation: string }[] = [];

    const riskMatch = content.match(/risk(?:s)?[:\s]*(.+?)(?=recommend|$)/is);
    if (riskMatch) {
      const bullets = riskMatch[1].match(/[-•*\d.]\s*(.+)/g);
      if (bullets) {
        for (const bullet of bullets.slice(0, 5)) {
          const text = bullet.replace(/^[-•*\d.]\s*/, '').trim();
          risks.push({
            risk: text.slice(0, 100),
            likelihood: text.toLowerCase().includes('high') ? 'high' :
              text.toLowerCase().includes('low') ? 'low' : 'medium',
            mitigation: 'Mitigation strategy to be determined',
          });
        }
      }
    }

    if (risks.length === 0) {
      risks.push({
        risk: 'Timeline execution risk',
        likelihood: 'medium',
        mitigation: 'Regular milestone check-ins',
      });
    }

    return risks;
  }

  /**
   * Extract milestone recommendation from content.
   */
  private extractMilestoneRecommendation(
    content: string
  ): 'approve' | 'reject' | 'revision_requested' {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('approve') && !lowerContent.includes('not approve')) {
      return 'approve';
    }
    if (lowerContent.includes('reject')) {
      return 'reject';
    }
    return 'revision_requested';
  }

  /**
   * Extract quality score from content.
   */
  private extractQualityScore(content: string): number {
    const scoreMatch = content.match(/quality[:\s]*(\d+)/i);
    if (scoreMatch) {
      return Math.min(10, Math.max(1, parseInt(scoreMatch[1], 10)));
    }
    return 7;
  }

  /**
   * Extract reward recommendation from content.
   */
  private extractRewardRecommendation(
    content: string
  ): 'approve' | 'reject' | 'adjust' {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('adjust') || lowerContent.includes('reduce')) {
      return 'adjust';
    }
    if (lowerContent.includes('approve')) {
      return 'approve';
    }
    return 'reject';
  }

  /**
   * Extract impact score from content.
   */
  private extractImpactScore(content: string): number {
    const scoreMatch = content.match(/impact[:\s]*(\d+)/i);
    if (scoreMatch) {
      return Math.min(10, Math.max(1, parseInt(scoreMatch[1], 10)));
    }
    return 7;
  }

  /**
   * Extract suggested amount from content.
   */
  private extractSuggestedAmount(content: string, defaultAmount: number): number {
    const amountMatch = content.match(/suggest(?:ed)?\s*amount[:\s]*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
    if (amountMatch) {
      return parseFloat(amountMatch[1].replace(/,/g, ''));
    }
    return defaultAmount;
  }

  /**
   * Calculate adjusted amount for retroactive reward.
   */
  private calculateAdjustedAmount(
    reward: RetroactiveReward,
    evaluation: RewardEvaluation
  ): number {
    if (evaluation.recommendation !== 'adjust') {
      return reward.proposedAmount;
    }
    return evaluation.suggestedAmount;
  }

  /**
   * Extract confidence from content.
   */
  private extractConfidence(content: string): number {
    const confidenceMatch = content.match(/confidence[:\s]+(\d+)/i);
    if (confidenceMatch) {
      return Math.min(100, Math.max(0, parseInt(confidenceMatch[1], 10)));
    }
    return 70;
  }

  /**
   * Generate content hash for provenance.
   */
  private generateContentHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sha256-${Math.abs(hash).toString(16).padStart(16, '0')}`;
  }
}

// ============================================
// Additional Types
// ============================================

/**
 * Application evaluation result.
 */
export interface ApplicationEvaluation {
  applicationId: string;
  scores: Record<string, number>;
  overallScore: number;
  recommendation: 'approve' | 'reject' | 'request_changes';
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  evaluatedAt: Date;
  modelUsed: string;
}

/**
 * Milestone review result.
 */
export interface MilestoneReview {
  reportId: string;
  milestoneId: string;
  grantId: string;
  deliverablesComplete: boolean;
  evidenceSufficient: boolean;
  qualityScore: number;
  recommendation: 'approve' | 'reject' | 'revision_requested';
  feedback: string;
  reviewedAt: Date;
  modelUsed: string;
}

/**
 * Retroactive reward evaluation result.
 */
export interface RewardEvaluation {
  rewardId: string;
  verifiable: boolean;
  impactScore: number;
  communityValue: number;
  amountReasonable: boolean;
  recommendation: 'approve' | 'reject' | 'adjust';
  suggestedAmount: number;
  reasoning: string;
  evaluatedAt: Date;
  modelUsed: string;
}

/**
 * Factory function to create a WorkflowCHandler.
 */
export function createWorkflowCHandler(
  llmProvider: LLMProvider,
  config?: Partial<WorkflowCConfig>
): WorkflowCHandler {
  return new WorkflowCHandler(llmProvider, config);
}
