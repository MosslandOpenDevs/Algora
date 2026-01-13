import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { ProposalService } from './proposal';
import { VotingService } from './voting';
import { DecisionPacketService } from './decision-packet';
import type { GovernanceOSBridge } from '../governance-os-bridge';

export class GovernanceService {
  public readonly proposals: ProposalService;
  public readonly voting: VotingService;
  public readonly decisionPackets: DecisionPacketService;
  private io: SocketServer;
  private governanceOSBridge: GovernanceOSBridge | null = null;

  constructor(db: Database.Database, io: SocketServer) {
    this.io = io;
    this.proposals = new ProposalService(db, io);
    this.voting = new VotingService(db, io);
    this.decisionPackets = new DecisionPacketService(db, io);

    console.log('[Governance] Service initialized');
  }

  /**
   * Set the GovernanceOS Bridge for document and voting integration
   */
  setGovernanceOSBridge(bridge: GovernanceOSBridge): void {
    this.governanceOSBridge = bridge;
    console.info('[Governance] GovernanceOS Bridge connected');
  }

  // === Convenience Methods ===

  async createProposalFromIssue(issueId: string, proposer: string): Promise<any> {
    const proposal = this.proposals.createFromIssue(issueId, proposer);

    // Create a GP (Governance Proposal) document
    await this.createProposalDocument(proposal);

    return proposal;
  }

  async submitForVoting(proposalId: string, submittedBy: string): Promise<any> {
    // Move through workflow stages
    let proposal = this.proposals.submit(proposalId, submittedBy);
    proposal = this.proposals.startDiscussion(proposalId, 'system');
    proposal = this.proposals.startVoting(proposalId);

    // Generate decision packet
    await this.decisionPackets.generatePacket(proposalId, 'system');

    // Create dual-house voting session
    await this.createDualHouseVotingSession(proposal);

    return proposal;
  }

  /**
   * Create a governance document from a proposal
   */
  private async createProposalDocument(proposal: any): Promise<void> {
    if (!this.governanceOSBridge || !proposal) {
      return;
    }

    try {
      const docRegistry = this.governanceOSBridge.getGovernanceOS().getDocumentRegistry();

      const doc = await docRegistry.documents.create({
        type: 'GP', // Governance Proposal
        title: `Proposal: ${proposal.title}`,
        summary: proposal.description?.substring(0, 500) || proposal.title,
        content: JSON.stringify({
          proposalId: proposal.id,
          title: proposal.title,
          description: proposal.description,
          category: proposal.category,
          status: proposal.status,
          proposedBy: proposal.proposed_by,
          issueId: proposal.issue_id,
          createdAt: proposal.created_at,
        }),
        createdBy: proposal.proposed_by || 'governance-service',
      });

      console.log(`[Governance] Created GP document ${doc.id} for proposal ${proposal.id.slice(0, 8)}`);

      this.io.emit('governance:document:created', {
        id: doc.id,
        type: 'GP',
        title: doc.title,
        state: doc.state,
        proposalId: proposal.id,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error(`[Governance] Failed to create document for proposal:`, error);
    }
  }

  /**
   * Create a dual-house voting session for a proposal
   */
  private async createDualHouseVotingSession(proposal: any): Promise<void> {
    if (!this.governanceOSBridge || !proposal) {
      return;
    }

    try {
      // Classify risk level based on proposal category
      const riskLevel = this.governanceOSBridge.classifyRisk(proposal.category || 'general');

      const voting = await this.governanceOSBridge.createDualHouseVoting({
        proposalId: proposal.id,
        title: proposal.title,
        summary: proposal.description?.substring(0, 500) || proposal.title,
        riskLevel,
        category: proposal.category || 'general',
        createdBy: proposal.proposed_by || 'governance-service',
      });

      console.log(`[Governance] Created dual-house voting ${voting.id} for proposal ${proposal.id.slice(0, 8)}`);

      this.io.emit('governance:voting:created', {
        id: voting.id,
        proposalId: proposal.id,
        title: voting.title,
        status: voting.status,
        riskLevel,
        timestamp: new Date().toISOString(),
      });

      // If HIGH risk, create a lock approval requirement
      if (riskLevel === 'HIGH') {
        await this.createHighRiskLock(proposal, voting.id);
      }

    } catch (error) {
      console.error(`[Governance] Failed to create voting session for proposal:`, error);
    }
  }

  /**
   * Create a high-risk lock for proposals requiring Director 3 approval
   */
  private async createHighRiskLock(proposal: any, votingId: string): Promise<void> {
    if (!this.governanceOSBridge) {
      return;
    }

    try {
      const approval = await this.governanceOSBridge.createHighRiskApproval({
        proposalId: proposal.id,
        votingId,
        actionDescription: `High-risk proposal requires Director 3 approval: ${proposal.title}`,
        actionType: proposal.category || 'general',
      });

      console.log(`[Governance] Created high-risk lock ${approval.id} for proposal ${proposal.id.slice(0, 8)}`);

      this.io.emit('governance:action:locked', {
        approvalId: approval.id,
        proposalId: proposal.id,
        votingId,
        riskLevel: 'HIGH',
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error(`[Governance] Failed to create lock for proposal:`, error);
    }
  }

  async getProposalWithDetails(proposalId: string): Promise<any> {
    const proposal = this.proposals.getById(proposalId);
    if (!proposal) return null;

    const votes = this.voting.getVotesForProposal(proposalId);
    const tally = this.voting.calculateTally(proposalId);
    const endorsements = this.proposals.getEndorsements(proposalId);
    const comments = this.proposals.getComments(proposalId);
    const decisionPacket = this.decisionPackets.getPacket(proposalId);

    return {
      proposal,
      votes,
      tally,
      endorsements,
      comments,
      decisionPacket,
    };
  }

  getGovernanceStats(): any {
    const proposalStats = this.proposals.getStats();
    const votingStats = this.voting.getVotingStats();

    return {
      proposals: proposalStats,
      voting: votingStats,
    };
  }
}

export { ProposalService } from './proposal';
export { VotingService } from './voting';
export { DecisionPacketService } from './decision-packet';
export type { ProposalStatus, Proposal, ProposalCreateInput } from './proposal';
export type { Vote, VoteChoice, VoteTally, Delegation } from './voting';
export type { DecisionPacket, DecisionOption, AgentAnalysis, RiskAssessment } from './decision-packet';
