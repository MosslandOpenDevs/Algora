// ===========================================
// Workflow E: Working Groups
// ===========================================
// Form and manage official Working Groups with publishing authority

import type {
  WorkflowContext,
  AgentOpinion,
} from '../types.js';
import type { LLMProvider } from '../specialist-manager.js';

// ============================================
// Types for Working Groups Workflow
// ============================================

/**
 * Working Group status values.
 */
export type WorkingGroupStatus =
  | 'proposed'
  | 'under_review'
  | 'approved'
  | 'active'
  | 'suspended'
  | 'dissolved';

/**
 * Charter duration options.
 */
export type CharterDuration = '3m' | '6m' | '1y' | 'indefinite';

/**
 * Document types that WGs can publish.
 */
export type WGDocumentType =
  | 'research_digest'
  | 'technology_assessment'
  | 'debate_summary'
  | 'grant_proposal'
  | 'ecosystem_report'
  | 'wg_report'
  | 'status_update';

/**
 * WG proposal origin.
 */
export type WGProposalOrigin =
  | 'orchestrator'  // Auto-proposed based on issue patterns
  | 'community'     // Community member proposal
  | 'existing_wg'   // Proposed by another WG
  | 'director';     // Director-initiated

/**
 * Working Group proposal.
 */
export interface WorkingGroupProposal {
  id: string;
  name: string;
  purpose: string;
  scope: string[];

  // Leadership
  chairAgent: string;
  memberAgents: string[];
  humanLiaison?: string;

  // Charter settings
  charterDuration: CharterDuration;
  publishingAuthority: WGDocumentType[];

  // Resources
  budget?: number;
  budgetCurrency?: string;

  // Origin tracking
  origin: WGProposalOrigin;
  originDetails?: string;

  // Status
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';

  // Approvals
  requiredApprovals: {
    mossCoinHouse: boolean;
    openSourceHouse: boolean;
    director3: boolean;
  };
  approvalStatus: {
    mossCoinHouse?: boolean;
    openSourceHouse?: boolean;
    director3?: boolean;
  };

  // Metadata
  proposedBy: string;
  proposedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Working Group Charter - official formation document.
 */
export interface WorkingGroupCharter {
  id: string;
  proposalId: string;

  // Basic info
  name: string;
  purpose: string;
  scope: string[];

  // Leadership
  chair: {
    agentId: string;
    name: string;
  };
  members: {
    agentId: string;
    name: string;
    role: string;
  }[];
  humanLiaison?: {
    id: string;
    name: string;
  };

  // Authority
  publishingAuthority: WGDocumentType[];
  publishingRules: WGPublishingRules;

  // Duration
  duration: CharterDuration;
  effectiveDate: Date;
  expirationDate?: Date;

  // Budget
  allocatedBudget?: number;
  budgetCurrency?: string;
  disbursedBudget?: number;

  // Status
  status: WorkingGroupStatus;

  // Amendments
  amendments: CharterAmendment[];

  // Provenance
  approvedAt: Date;
  approvedBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * WG publishing rules.
 */
export interface WGPublishingRules {
  allowedDocTypes: WGDocumentType[];
  requiresWGConsensus: boolean;
  minimumApprovals: number;
  requiresHumanReview: boolean;
  cooldownBetweenDocs: string; // e.g., '24h'
  maxDocsPerWeek: number;
}

/**
 * Charter amendment record.
 */
export interface CharterAmendment {
  id: string;
  charterId: string;
  type: 'scope_change' | 'member_change' | 'authority_change' | 'budget_change' | 'extension';
  description: string;
  previousValue: unknown;
  newValue: unknown;
  proposedBy: string;
  approvedBy: string[];
  approvedAt: Date;
}

/**
 * Working Group - active group entity.
 */
export interface WorkingGroup {
  id: string;
  charterId: string;

  // Basic info
  name: string;
  purpose: string;

  // Members
  chair: string;
  members: string[];

  // Activity
  status: WorkingGroupStatus;
  documentsPublished: number;
  lastActivityAt: Date;

  // Metrics
  metrics: {
    meetingsHeld: number;
    decisionsReached: number;
    documentsProduced: number;
    activeIssues: number;
  };

  // Metadata
  activatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * WG Status Report.
 */
export interface WGStatusReport {
  id: string;
  workingGroupId: string;
  reportPeriod: {
    start: Date;
    end: Date;
  };

  // Summary
  executiveSummary: string;

  // Accomplishments
  accomplishments: string[];
  documentsPublished: {
    id: string;
    type: WGDocumentType;
    title: string;
    publishedAt: Date;
  }[];

  // Challenges
  challenges: string[];
  blockers: string[];

  // Plans
  upcomingActivities: string[];
  resourceNeeds: string[];

  // Metrics
  metrics: {
    meetingsHeld: number;
    decisionsReached: number;
    memberParticipation: number; // 0-100
    documentsProduced: number;
  };

  // Provenance
  generatedBy: string;
  generatedAt: Date;
}

/**
 * WG dissolution request.
 */
export interface WGDissolutionRequest {
  id: string;
  workingGroupId: string;

  // Reason
  reason: string;
  requestedBy: string;
  requestType: 'voluntary' | 'inactivity' | 'charter_expired' | 'governance_decision';

  // Handover plan
  handoverPlan?: {
    openIssues: string[];
    assignedTo: string;
    documentsArchived: boolean;
  };

  // Status
  status: 'pending' | 'approved' | 'rejected' | 'completed';

  // Approvals
  approvedBy?: string[];

  // Metadata
  requestedAt: Date;
  processedAt?: Date;
}

/**
 * Pattern detection for auto-proposal.
 */
export interface IssuePattern {
  category: string;
  frequency: number;
  timeWindow: string;
  sampleIssueIds: string[];
}

/**
 * Workflow E configuration.
 */
export interface WorkflowEConfig {
  // Charter settings
  defaultChairTermMonths: number;
  maxMembersPerWG: number;
  minMembersPerWG: number;

  // Publishing settings
  defaultPublishingCooldown: string;
  defaultMaxDocsPerWeek: number;

  // Auto-proposal settings
  autoProposalEnabled: boolean;
  autoProposalThreshold: number; // Min similar issues to trigger
  autoProposalTimeWindow: string;

  // Approval thresholds
  budgetThresholdForDirector3: number;

  // Inactivity settings
  inactivityThresholdDays: number;
  warningBeforeDissolutionDays: number;
}

/**
 * Default configuration for Workflow E.
 */
export const DEFAULT_WORKFLOW_E_CONFIG: WorkflowEConfig = {
  defaultChairTermMonths: 6,
  maxMembersPerWG: 10,
  minMembersPerWG: 3,
  defaultPublishingCooldown: '24h',
  defaultMaxDocsPerWeek: 5,
  autoProposalEnabled: true,
  autoProposalThreshold: 5,
  autoProposalTimeWindow: '30d',
  budgetThresholdForDirector3: 5000,
  inactivityThresholdDays: 30,
  warningBeforeDissolutionDays: 7,
};

// ============================================
// Workflow E Handler
// ============================================

/**
 * Handler for Workflow E: Working Groups.
 */
export class WorkflowEHandler {
  private llmProvider: LLMProvider;
  private config: WorkflowEConfig;
  private workingGroups: Map<string, WorkingGroup> = new Map();
  private charters: Map<string, WorkingGroupCharter> = new Map();

  constructor(llmProvider: LLMProvider, config: WorkflowEConfig = DEFAULT_WORKFLOW_E_CONFIG) {
    this.llmProvider = llmProvider;
    this.config = config;
  }

  /**
   * Process a WG formation proposal.
   */
  async processWGProposal(
    context: WorkflowContext,
    proposal: Omit<WorkingGroupProposal, 'id' | 'status' | 'approvalStatus' | 'createdAt' | 'updatedAt'>
  ): Promise<{
    proposal: WorkingGroupProposal;
    evaluation: WGProposalEvaluation;
    opinions: AgentOpinion[];
  }> {
    // Validate proposal
    this.validateProposal(proposal);

    // Create full proposal record
    const fullProposal: WorkingGroupProposal = {
      ...proposal,
      id: `WGP-${Date.now()}`,
      status: 'submitted',
      approvalStatus: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Evaluate the proposal
    const evaluation = await this.evaluateProposal(context, fullProposal);

    // Gather agent opinions
    const opinions = await this.gatherAgentOpinions(context, fullProposal, evaluation);

    // Update status based on evaluation
    if (evaluation.overallScore >= 70 && evaluation.recommendation === 'approve') {
      fullProposal.status = 'under_review';
    }
    fullProposal.updatedAt = new Date();

    return {
      proposal: fullProposal,
      evaluation,
      opinions,
    };
  }

  /**
   * Evaluate a WG proposal.
   */
  async evaluateProposal(
    context: WorkflowContext,
    proposal: WorkingGroupProposal
  ): Promise<WGProposalEvaluation> {
    const prompt = `You are evaluating a Working Group formation proposal for Mossland governance.

Working Group Proposal:
- Name: ${proposal.name}
- Purpose: ${proposal.purpose}
- Scope: ${proposal.scope.join(', ')}
- Chair Agent: ${proposal.chairAgent}
- Members: ${proposal.memberAgents.join(', ')}
- Charter Duration: ${proposal.charterDuration}
- Publishing Authority: ${proposal.publishingAuthority.join(', ')}
${proposal.budget ? `- Budget: $${proposal.budget}` : ''}

Issue Context:
- Issue Title: ${context.issue.title}
- Issue Description: ${context.issue.description}

Please evaluate this proposal on the following dimensions (score 0-100 each):
1. Purpose Clarity: Is the WG's purpose well-defined?
2. Scope Appropriateness: Is the scope neither too broad nor too narrow?
3. Team Composition: Is the team capable of fulfilling the mission?
4. Resource Adequacy: Are the proposed resources sufficient?
5. Governance Fit: Does this WG fit the overall governance structure?
6. Overlap Check: Does this overlap with existing WGs?

Also provide:
- Recommendation (approve/reject/modify)
- Key strengths
- Key concerns
- Suggested modifications (if any)

Format your response with clear sections.`;

    const response = await this.llmProvider.generate({
      prompt,
      maxTokens: 1500,
    });

    const scores = this.parseEvaluationScores(response.content);
    const analysis = this.parseEvaluationAnalysis(response.content);

    const overallScore = Math.round(
      (scores.purposeClarity +
        scores.scopeAppropriateness +
        scores.teamComposition +
        scores.resourceAdequacy +
        scores.governanceFit +
        (100 - scores.overlapRisk)) / 6
    );

    return {
      id: `WGE-${Date.now()}`,
      proposalId: proposal.id,
      scores,
      overallScore,
      recommendation: analysis.recommendation,
      strengths: analysis.strengths,
      concerns: analysis.concerns,
      suggestedModifications: analysis.modifications,
      evaluatedBy: 'workflow-e-handler',
      modelUsed: response.model,
      evaluatedAt: new Date(),
    };
  }

  /**
   * Create a WG charter from an approved proposal.
   */
  createCharter(
    proposal: WorkingGroupProposal
  ): WorkingGroupCharter {
    // Verify all required approvals
    const missingApprovals: string[] = [];
    if (proposal.requiredApprovals.mossCoinHouse && !proposal.approvalStatus.mossCoinHouse) {
      missingApprovals.push('MossCoin House');
    }
    if (proposal.requiredApprovals.openSourceHouse && !proposal.approvalStatus.openSourceHouse) {
      missingApprovals.push('OpenSource House');
    }
    if (proposal.requiredApprovals.director3 && !proposal.approvalStatus.director3) {
      missingApprovals.push('Director 3');
    }

    if (missingApprovals.length > 0) {
      throw new Error(`Missing required approvals: ${missingApprovals.join(', ')}`);
    }

    // Calculate expiration date
    const effectiveDate = new Date();
    let expirationDate: Date | undefined;
    if (proposal.charterDuration !== 'indefinite') {
      const months = proposal.charterDuration === '3m' ? 3 :
                     proposal.charterDuration === '6m' ? 6 : 12;
      expirationDate = new Date(effectiveDate);
      expirationDate.setMonth(expirationDate.getMonth() + months);
    }

    const charter: WorkingGroupCharter = {
      id: `WGC-${Date.now()}`,
      proposalId: proposal.id,
      name: proposal.name,
      purpose: proposal.purpose,
      scope: proposal.scope,
      chair: {
        agentId: proposal.chairAgent,
        name: proposal.chairAgent,
      },
      members: proposal.memberAgents.map(id => ({
        agentId: id,
        name: id,
        role: 'member',
      })),
      humanLiaison: proposal.humanLiaison ? {
        id: proposal.humanLiaison,
        name: proposal.humanLiaison,
      } : undefined,
      publishingAuthority: proposal.publishingAuthority,
      publishingRules: {
        allowedDocTypes: proposal.publishingAuthority,
        requiresWGConsensus: true,
        minimumApprovals: Math.ceil(proposal.memberAgents.length / 2),
        requiresHumanReview: false,
        cooldownBetweenDocs: this.config.defaultPublishingCooldown,
        maxDocsPerWeek: this.config.defaultMaxDocsPerWeek,
      },
      duration: proposal.charterDuration,
      effectiveDate,
      expirationDate,
      allocatedBudget: proposal.budget,
      budgetCurrency: proposal.budgetCurrency || 'USD',
      disbursedBudget: 0,
      status: 'approved',
      amendments: [],
      approvedAt: new Date(),
      approvedBy: this.getApprovers(proposal),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.charters.set(charter.id, charter);
    return charter;
  }

  /**
   * Activate a Working Group from an approved charter.
   */
  activateWorkingGroup(charter: WorkingGroupCharter): WorkingGroup {
    if (charter.status !== 'approved') {
      throw new Error(`Charter must be approved to activate WG. Current status: ${charter.status}`);
    }

    const wg: WorkingGroup = {
      id: `WG-${Date.now()}`,
      charterId: charter.id,
      name: charter.name,
      purpose: charter.purpose,
      chair: charter.chair.agentId,
      members: charter.members.map(m => m.agentId),
      status: 'active',
      documentsPublished: 0,
      lastActivityAt: new Date(),
      metrics: {
        meetingsHeld: 0,
        decisionsReached: 0,
        documentsProduced: 0,
        activeIssues: 0,
      },
      activatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Update charter status
    charter.status = 'active';
    charter.updatedAt = new Date();

    this.workingGroups.set(wg.id, wg);
    return wg;
  }

  /**
   * Check if a WG can publish a document type.
   */
  canPublishDocument(
    workingGroupId: string,
    documentType: WGDocumentType
  ): { allowed: boolean; reason?: string } {
    const wg = this.workingGroups.get(workingGroupId);
    if (!wg) {
      return { allowed: false, reason: 'Working group not found' };
    }

    const charter = this.charters.get(wg.charterId);
    if (!charter) {
      return { allowed: false, reason: 'Charter not found' };
    }

    if (wg.status !== 'active') {
      return { allowed: false, reason: `WG is ${wg.status}, not active` };
    }

    if (!charter.publishingAuthority.includes(documentType)) {
      return { allowed: false, reason: `Document type ${documentType} not in publishing authority` };
    }

    return { allowed: true };
  }

  /**
   * Record document publication by a WG.
   */
  recordPublication(
    workingGroupId: string,
    _documentId: string,
    _documentType: WGDocumentType
  ): void {
    const wg = this.workingGroups.get(workingGroupId);
    if (!wg) {
      throw new Error('Working group not found');
    }

    wg.documentsPublished++;
    wg.metrics.documentsProduced++;
    wg.lastActivityAt = new Date();
    wg.updatedAt = new Date();
  }

  /**
   * Generate a WG status report.
   */
  async generateStatusReport(
    _context: WorkflowContext,
    workingGroupId: string,
    periodStart: Date,
    periodEnd: Date,
    publishedDocs: { id: string; type: WGDocumentType; title: string; publishedAt: Date }[]
  ): Promise<WGStatusReport> {
    const wg = this.workingGroups.get(workingGroupId);
    if (!wg) {
      throw new Error('Working group not found');
    }

    const prompt = `Generate a status report for the Working Group "${wg.name}".

Period: ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}
Purpose: ${wg.purpose}
Members: ${wg.members.length}
Documents Published: ${publishedDocs.length}

Please provide:
1. Executive Summary (2-3 sentences)
2. Key Accomplishments (3-5 bullet points)
3. Challenges Faced (2-3 bullet points)
4. Upcoming Activities (2-3 bullet points)
5. Resource Needs (if any)

Be concise and factual.`;

    const response = await this.llmProvider.generate({
      prompt,
      maxTokens: 1000,
    });

    const reportContent = this.parseReportContent(response.content);

    return {
      id: `WGSR-${Date.now()}`,
      workingGroupId,
      reportPeriod: { start: periodStart, end: periodEnd },
      executiveSummary: reportContent.summary,
      accomplishments: reportContent.accomplishments,
      documentsPublished: publishedDocs,
      challenges: reportContent.challenges,
      blockers: reportContent.blockers,
      upcomingActivities: reportContent.upcoming,
      resourceNeeds: reportContent.resources,
      metrics: {
        meetingsHeld: wg.metrics.meetingsHeld,
        decisionsReached: wg.metrics.decisionsReached,
        memberParticipation: 85, // Could be calculated from activity logs
        documentsProduced: publishedDocs.length,
      },
      generatedBy: 'workflow-e-handler',
      generatedAt: new Date(),
    };
  }

  /**
   * Process a WG dissolution request.
   */
  async processDissolulutionRequest(
    _context: WorkflowContext,
    request: Omit<WGDissolutionRequest, 'id' | 'status' | 'requestedAt'>
  ): Promise<{
    request: WGDissolutionRequest;
    approved: boolean;
    reason: string;
  }> {
    const wg = this.workingGroups.get(request.workingGroupId);
    if (!wg) {
      throw new Error('Working group not found');
    }

    const fullRequest: WGDissolutionRequest = {
      ...request,
      id: `WGDR-${Date.now()}`,
      status: 'pending',
      requestedAt: new Date(),
    };

    // Auto-approve certain dissolution types
    let approved = false;
    let reason = '';

    switch (request.requestType) {
      case 'charter_expired':
        approved = true;
        reason = 'Charter has expired';
        break;
      case 'voluntary':
        approved = request.handoverPlan?.documentsArchived ?? false;
        reason = approved
          ? 'Voluntary dissolution with complete handover'
          : 'Handover plan incomplete';
        break;
      case 'inactivity':
        const daysSinceActivity = Math.floor(
          (Date.now() - wg.lastActivityAt.getTime()) / (24 * 60 * 60 * 1000)
        );
        approved = daysSinceActivity > this.config.inactivityThresholdDays;
        reason = approved
          ? `Inactive for ${daysSinceActivity} days`
          : 'Activity threshold not met';
        break;
      case 'governance_decision':
        approved = false;
        reason = 'Requires governance vote';
        break;
    }

    fullRequest.status = approved ? 'approved' : 'pending';
    if (approved) {
      fullRequest.processedAt = new Date();
      fullRequest.approvedBy = ['workflow-e-handler'];

      // Dissolve the WG
      wg.status = 'dissolved';
      wg.updatedAt = new Date();

      const charter = this.charters.get(wg.charterId);
      if (charter) {
        charter.status = 'dissolved';
        charter.updatedAt = new Date();
      }
    }

    return {
      request: fullRequest,
      approved,
      reason,
    };
  }

  /**
   * Detect issue patterns for auto-proposal.
   */
  detectPatterns(issues: { category: string; createdAt: Date }[]): IssuePattern[] {
    if (!this.config.autoProposalEnabled) {
      return [];
    }

    const categoryCount = new Map<string, string[]>();
    const windowMs = this.parseTimeWindow(this.config.autoProposalTimeWindow);
    const cutoff = new Date(Date.now() - windowMs);

    // Count issues by category within time window
    for (const issue of issues) {
      if (issue.createdAt >= cutoff) {
        const ids = categoryCount.get(issue.category) || [];
        ids.push(issue.category); // Using category as ID for simplicity
        categoryCount.set(issue.category, ids);
      }
    }

    // Find categories that exceed threshold
    const patterns: IssuePattern[] = [];
    for (const [category, ids] of categoryCount) {
      if (ids.length >= this.config.autoProposalThreshold) {
        patterns.push({
          category,
          frequency: ids.length,
          timeWindow: this.config.autoProposalTimeWindow,
          sampleIssueIds: ids.slice(0, 5),
        });
      }
    }

    return patterns;
  }

  /**
   * Generate an auto-proposal for a detected pattern.
   */
  async generateAutoProposal(
    pattern: IssuePattern
  ): Promise<Omit<WorkingGroupProposal, 'id' | 'status' | 'approvalStatus' | 'createdAt' | 'updatedAt'>> {
    const prompt = `A pattern has been detected in governance issues that suggests a Working Group should be formed.

Pattern Details:
- Category: ${pattern.category}
- Frequency: ${pattern.frequency} issues in ${pattern.timeWindow}

Please suggest a Working Group to address this pattern:
1. Name (short, descriptive)
2. Purpose (1-2 sentences)
3. Scope (3-5 key areas)
4. Required publishing authority
5. Suggested charter duration

Format clearly with sections.`;

    const response = await this.llmProvider.generate({
      prompt,
      maxTokens: 800,
    });

    const details = this.parseAutoProposalDetails(response.content, pattern);

    return {
      name: details.name,
      purpose: details.purpose,
      scope: details.scope,
      chairAgent: 'orchestrator-suggested',
      memberAgents: ['analyst-agent', 'researcher-agent', 'drafter-agent'],
      charterDuration: details.duration,
      publishingAuthority: details.publishingAuthority,
      origin: 'orchestrator',
      originDetails: `Auto-detected pattern: ${pattern.frequency} ${pattern.category} issues in ${pattern.timeWindow}`,
      requiredApprovals: {
        mossCoinHouse: true,
        openSourceHouse: true,
        director3: false,
      },
      proposedBy: 'workflow-e-handler',
      proposedAt: new Date(),
    };
  }

  /**
   * Check if WG formation requires dual-house approval.
   */
  requiresDualHouseApproval(): boolean {
    // All WG formations require dual-house approval by default
    return true;
  }

  /**
   * Check if WG formation requires Director 3 approval.
   */
  requiresDirector3Approval(budget?: number): boolean {
    if (!budget) return false;
    return budget >= this.config.budgetThresholdForDirector3;
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private validateProposal(
    proposal: Omit<WorkingGroupProposal, 'id' | 'status' | 'approvalStatus' | 'createdAt' | 'updatedAt'>
  ): void {
    if (!proposal.name || proposal.name.length < 3) {
      throw new Error('WG name must be at least 3 characters');
    }

    if (!proposal.purpose || proposal.purpose.length < 10) {
      throw new Error('WG purpose must be at least 10 characters');
    }

    if (proposal.scope.length < 1) {
      throw new Error('WG must have at least 1 scope item');
    }

    if (proposal.memberAgents.length < this.config.minMembersPerWG) {
      throw new Error(`WG must have at least ${this.config.minMembersPerWG} members`);
    }

    if (proposal.memberAgents.length > this.config.maxMembersPerWG) {
      throw new Error(`WG cannot have more than ${this.config.maxMembersPerWG} members`);
    }

    if (proposal.publishingAuthority.length < 1) {
      throw new Error('WG must have at least 1 document type in publishing authority');
    }
  }

  private getApprovers(proposal: WorkingGroupProposal): string[] {
    const approvers: string[] = [];
    if (proposal.approvalStatus.mossCoinHouse) approvers.push('MossCoin House');
    if (proposal.approvalStatus.openSourceHouse) approvers.push('OpenSource House');
    if (proposal.approvalStatus.director3) approvers.push('Director 3');
    return approvers;
  }

  private parseEvaluationScores(content: string): WGProposalEvaluation['scores'] {
    const defaults = {
      purposeClarity: 75,
      scopeAppropriateness: 70,
      teamComposition: 75,
      resourceAdequacy: 70,
      governanceFit: 75,
      overlapRisk: 20,
    };

    const patterns: Record<string, RegExp> = {
      purposeClarity: /purpose\s*clarity[:\s]*(\d+)/i,
      scopeAppropriateness: /scope\s*appropriateness[:\s]*(\d+)/i,
      teamComposition: /team\s*composition[:\s]*(\d+)/i,
      resourceAdequacy: /resource\s*adequacy[:\s]*(\d+)/i,
      governanceFit: /governance\s*fit[:\s]*(\d+)/i,
      overlapRisk: /overlap[:\s]*(\d+)/i,
    };

    const scores = { ...defaults };
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = content.match(pattern);
      if (match) {
        scores[key as keyof typeof scores] = Math.min(100, Math.max(0, parseInt(match[1], 10)));
      }
    }

    return scores;
  }

  private parseEvaluationAnalysis(content: string): {
    recommendation: 'approve' | 'reject' | 'modify';
    strengths: string[];
    concerns: string[];
    modifications: string[];
  } {
    let recommendation: 'approve' | 'reject' | 'modify' = 'modify';
    if (/approve|approved|recommend.*approval/i.test(content)) recommendation = 'approve';
    else if (/reject|denied|recommend.*rejection/i.test(content)) recommendation = 'reject';

    const extractBullets = (section: string): string[] => {
      const match = content.match(new RegExp(`${section}[:\\s]*([\\s\\S]*?)(?=(?:concern|modif|$))`, 'i'));
      if (!match) return [];
      return match[1]
        .split(/[-•\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .slice(0, 4);
    };

    return {
      recommendation,
      strengths: extractBullets('strength'),
      concerns: extractBullets('concern'),
      modifications: extractBullets('modif'),
    };
  }

  private parseReportContent(content: string): {
    summary: string;
    accomplishments: string[];
    challenges: string[];
    blockers: string[];
    upcoming: string[];
    resources: string[];
  } {
    const summaryMatch = content.match(/summary[:\s]*([\s\S]*?)(?=accomplishment|$)/i);
    const summary = summaryMatch ? summaryMatch[1].trim().substring(0, 300) : 'Status report generated.';

    const extractBullets = (section: string): string[] => {
      const match = content.match(new RegExp(`${section}[s]?[:\\s]*([\\s\\S]*?)(?=(?:challenge|block|upcoming|resource|$))`, 'i'));
      if (!match) return [];
      return match[1]
        .split(/[-•\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .slice(0, 5);
    };

    return {
      summary,
      accomplishments: extractBullets('accomplishment'),
      challenges: extractBullets('challenge'),
      blockers: extractBullets('blocker'),
      upcoming: extractBullets('upcoming'),
      resources: extractBullets('resource'),
    };
  }

  private parseAutoProposalDetails(content: string, pattern: IssuePattern): {
    name: string;
    purpose: string;
    scope: string[];
    duration: CharterDuration;
    publishingAuthority: WGDocumentType[];
  } {
    const nameMatch = content.match(/name[:\s]*([^\n]+)/i);
    const name = nameMatch ? nameMatch[1].trim() : `${pattern.category} Working Group`;

    const purposeMatch = content.match(/purpose[:\s]*([\s\S]*?)(?=scope|$)/i);
    const purpose = purposeMatch ? purposeMatch[1].trim().substring(0, 200) : `Address ${pattern.category} related issues.`;

    const scopeMatch = content.match(/scope[:\s]*([\s\S]*?)(?=publish|duration|$)/i);
    const scope = scopeMatch
      ? scopeMatch[1].split(/[-•\n]/).map(s => s.trim()).filter(s => s.length > 0).slice(0, 5)
      : [pattern.category, 'Research', 'Documentation'];

    let duration: CharterDuration = '6m';
    if (/3\s*month/i.test(content)) duration = '3m';
    else if (/1\s*year|12\s*month/i.test(content)) duration = '1y';
    else if (/indefinite|permanent/i.test(content)) duration = 'indefinite';

    const publishingAuthority: WGDocumentType[] = ['wg_report', 'status_update'];
    if (/research/i.test(content)) publishingAuthority.push('research_digest');
    if (/technology|tech/i.test(content)) publishingAuthority.push('technology_assessment');

    return { name, purpose, scope, duration, publishingAuthority };
  }

  private parseTimeWindow(window: string): number {
    const match = window.match(/(\d+)([dhm])/);
    if (!match) return 30 * 24 * 60 * 60 * 1000; // Default 30 days

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 30 * 24 * 60 * 60 * 1000;
    }
  }

  private async gatherAgentOpinions(
    _context: WorkflowContext,
    proposal: WorkingGroupProposal,
    evaluation: WGProposalEvaluation
  ): Promise<AgentOpinion[]> {
    const agentRoles = ['governance_expert', 'resource_analyst', 'community_liaison'];
    const opinions: AgentOpinion[] = [];

    for (const role of agentRoles) {
      const prompt = `As a ${role}, provide your opinion on this Working Group proposal.

Proposal: ${proposal.name}
Purpose: ${proposal.purpose}
Evaluation Score: ${evaluation.overallScore}/100
Recommendation: ${evaluation.recommendation}

Provide:
1. Your position (support/oppose/neutral)
2. Confidence level (0-100)
3. Brief reasoning (2-3 sentences)`;

      const response = await this.llmProvider.generate({
        prompt,
        maxTokens: 500,
      });

      const parsed = this.parseAgentOpinion(response.content, role);
      opinions.push({
        agentId: `${role}-agent`,
        agentName: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
        position: parsed.position,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        timestamp: new Date(),
      });
    }

    return opinions;
  }

  private parseAgentOpinion(content: string, role: string): {
    position: string;
    confidence: number;
    reasoning: string;
  } {
    let position = 'neutral';
    if (/support|favor|approve/i.test(content)) position = 'support';
    else if (/oppose|against|reject/i.test(content)) position = 'oppose';

    const confidenceMatch = content.match(/confidence[:\s]*(\d+)/i);
    const confidence = confidenceMatch ? Math.min(100, Math.max(0, parseInt(confidenceMatch[1], 10))) : 70;

    const reasoningMatch = content.match(/reason(?:ing)?[:\s]*([^.]+\..*?(?:\.|$))/i);
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : `Assessment from ${role} perspective.`;

    return { position, confidence, reasoning };
  }
}

/**
 * WG proposal evaluation result.
 */
export interface WGProposalEvaluation {
  id: string;
  proposalId: string;
  scores: {
    purposeClarity: number;
    scopeAppropriateness: number;
    teamComposition: number;
    resourceAdequacy: number;
    governanceFit: number;
    overlapRisk: number;
  };
  overallScore: number;
  recommendation: 'approve' | 'reject' | 'modify';
  strengths: string[];
  concerns: string[];
  suggestedModifications: string[];
  evaluatedBy: string;
  modelUsed: string;
  evaluatedAt: Date;
}

/**
 * Factory function to create a WorkflowEHandler.
 */
export function createWorkflowEHandler(
  llmProvider: LLMProvider,
  config?: Partial<WorkflowEConfig>
): WorkflowEHandler {
  const fullConfig = config
    ? { ...DEFAULT_WORKFLOW_E_CONFIG, ...config }
    : DEFAULT_WORKFLOW_E_CONFIG;
  return new WorkflowEHandler(llmProvider, fullConfig);
}
