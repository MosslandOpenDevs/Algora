import { Router } from 'express';
import type { GovernanceService } from '../services/governance';
import type { SignatureService } from '../services/signature';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { writeLimiter, llmLimiter } from '../middleware/rate-limit';

export const proposalsRouter: Router = Router();

// ========================================
// Proposal Endpoints
// ========================================

// GET /api/proposals - List proposals
proposalsRouter.get('/', (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { status, category, limit = '50', offset = '0' } = req.query;

  try {
    const proposals = governance.proposals.getAll({
      status: status as any,
      category: category as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json({ proposals });
  } catch (error) {
    console.error('Failed to fetch proposals:', error);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// GET /api/proposals/active - Get active proposals
proposalsRouter.get('/active', (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;

  try {
    const proposals = governance.proposals.getActive();
    res.json({ proposals });
  } catch (error) {
    console.error('Failed to fetch active proposals:', error);
    res.status(500).json({ error: 'Failed to fetch active proposals' });
  }
});

// GET /api/proposals/stats - Get proposal statistics
proposalsRouter.get('/stats', (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;

  try {
    const stats = governance.getGovernanceStats();
    res.json({ stats });
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /api/proposals/:id - Get single proposal with details
proposalsRouter.get('/:id', async (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;

  try {
    const result = await governance.getProposalWithDetails(id);

    if (!result) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Failed to fetch proposal:', error);
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

// POST /api/proposals - Create proposal
proposalsRouter.post('/', writeLimiter, requireAuth, (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const {
    title,
    description,
    proposer,
    category,
    priority,
    issueId,
    votingDurationHours,
    // v2 extended fields
    proposalType,
    coProposers,
    executionDate,
    content,
    budget,
    relatedLinks,
  } = req.body;

  if (!title || !description || !proposer) {
    res.status(400).json({ error: 'title, description, and proposer are required' });
    return;
  }

  try {
    const proposal = governance.proposals.create({
      title,
      description,
      proposer,
      category: category || 'general',
      priority,
      issueId,
      votingDurationHours,
      // v2 extended fields
      proposalType,
      coProposers,
      executionDate,
      content,
      budget,
      relatedLinks,
    });

    res.status(201).json({ proposal });
  } catch (error) {
    console.error('Failed to create proposal:', error);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

// POST /api/proposals/from-issue/:issueId - Create proposal from issue
proposalsRouter.post('/from-issue/:issueId', writeLimiter, requireAuth, (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { issueId } = req.params;
  const { proposer } = req.body;

  if (!proposer) {
    res.status(400).json({ error: 'proposer is required' });
    return;
  }

  try {
    const proposal = governance.proposals.createFromIssue(issueId, proposer);
    res.status(201).json({ proposal });
  } catch (error: any) {
    console.error('Failed to create proposal from issue:', error);
    res.status(400).json({ error: error.message || 'Failed to create proposal' });
  }
});

// ========================================
// Proposal Workflow Endpoints
// ========================================

// POST /api/proposals/:id/submit - Submit for review
proposalsRouter.post('/:id/submit', requireAuth, (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;
  const { submittedBy } = req.body;

  try {
    const proposal = governance.proposals.submit(id, submittedBy || 'anonymous');
    res.json({ proposal });
  } catch (error: any) {
    console.error('Failed to submit proposal:', error);
    res.status(400).json({ error: error.message || 'Failed to submit proposal' });
  }
});

// POST /api/proposals/:id/start-discussion - Start discussion phase
proposalsRouter.post('/:id/start-discussion', requireAdmin, (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;
  const { approvedBy } = req.body;

  try {
    const proposal = governance.proposals.startDiscussion(id, approvedBy || 'system');
    res.json({ proposal });
  } catch (error: any) {
    console.error('Failed to start discussion:', error);
    res.status(400).json({ error: error.message || 'Failed to start discussion' });
  }
});

// POST /api/proposals/:id/start-voting - Start voting period
proposalsRouter.post('/:id/start-voting', requireAdmin, (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;

  try {
    const proposal = governance.proposals.startVoting(id);
    res.json({ proposal });
  } catch (error: any) {
    console.error('Failed to start voting:', error);
    res.status(400).json({ error: error.message || 'Failed to start voting' });
  }
});

// POST /api/proposals/:id/cancel - Cancel proposal
proposalsRouter.post('/:id/cancel', requireAuth, (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;
  const { cancelledBy, reason } = req.body;

  try {
    const proposal = governance.proposals.cancel(id, cancelledBy || 'anonymous', reason || 'No reason provided');
    res.json({ proposal });
  } catch (error: any) {
    console.error('Failed to cancel proposal:', error);
    res.status(400).json({ error: error.message || 'Failed to cancel proposal' });
  }
});

// ========================================
// Voting Endpoints
// ========================================

// POST /api/proposals/:id/vote - Cast vote
proposalsRouter.post('/:id/vote', writeLimiter, requireAuth, (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const signatureService: SignatureService | undefined = req.app.locals.signatureService;
  const { id } = req.params;
  const { voter, voterType = 'human', choice, reason, signature, nonce, issuedAt } = req.body;

  if (!voter || !choice) {
    res.status(400).json({ error: 'voter and choice are required' });
    return;
  }

  if (!['for', 'against', 'abstain'].includes(choice)) {
    res.status(400).json({ error: 'choice must be "for", "against", or "abstain"' });
    return;
  }

  // EIP-712 verification layer.
  // - If a signature is provided, it must verify (always enforced once present).
  // - If enforcement is on and no signature, reject.
  // - If enforcement is off and no signature, allow (dev / agent votes).
  if (signatureService) {
    if (signature) {
      if (!nonce || typeof issuedAt !== 'number') {
        res.status(400).json({ error: 'nonce and issuedAt required when signature is provided' });
        return;
      }
      const result = signatureService.verify(
        { proposalId: id, choice, voter, nonce, issuedAt },
        signature
      );
      if (!result.ok) {
        res.status(401).json({ error: `Signature verification failed: ${result.reason}` });
        return;
      }
    } else if (signatureService.isEnforced() && voterType === 'human') {
      res.status(401).json({ error: 'Vote signature required. Include signature, nonce, issuedAt.' });
      return;
    }
  }

  try {
    const vote = governance.voting.castVote(id, voter, voterType, choice, reason);
    const tally = governance.voting.calculateTally(id);
    res.json({ vote, tally });
  } catch (error: any) {
    console.error('Failed to cast vote:', error);
    res.status(400).json({ error: error.message || 'Failed to cast vote' });
  }
});

// GET /api/proposals/:id/vote/typed-data - Return EIP-712 typed data to sign.
// Frontend calls this, signs the result with the wallet, then POSTs /vote.
proposalsRouter.get('/:id/vote/typed-data', (req, res) => {
  const signatureService: SignatureService | undefined = req.app.locals.signatureService;
  if (!signatureService) {
    res.status(503).json({ error: 'Signature service unavailable' });
    return;
  }
  const { id } = req.params;
  const { voter, choice, nonce } = req.query;
  if (typeof voter !== 'string' || typeof choice !== 'string' || typeof nonce !== 'string') {
    res.status(400).json({ error: 'voter, choice, nonce query params required' });
    return;
  }
  if (!['for', 'against', 'abstain'].includes(choice)) {
    res.status(400).json({ error: 'choice must be "for", "against", or "abstain"' });
    return;
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  res.json(signatureService.buildTypedData({
    proposalId: id,
    choice: choice as 'for' | 'against' | 'abstain',
    voter,
    nonce,
    issuedAt,
  }));
});

// GET /api/proposals/:id/votes - Get votes for proposal
proposalsRouter.get('/:id/votes', (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;

  try {
    const votes = governance.voting.getVotesForProposal(id);
    const tally = governance.voting.calculateTally(id);
    res.json({ votes, tally });
  } catch (error) {
    console.error('Failed to get votes:', error);
    res.status(500).json({ error: 'Failed to get votes' });
  }
});

// POST /api/proposals/:id/finalize - Finalize voting
proposalsRouter.post('/:id/finalize', requireAdmin, (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;

  try {
    const tally = governance.voting.finalizeVoting(id);
    const proposal = governance.proposals.getById(id);
    res.json({ proposal, tally });
  } catch (error: any) {
    console.error('Failed to finalize voting:', error);
    res.status(400).json({ error: error.message || 'Failed to finalize voting' });
  }
});

// ========================================
// Comments & Endorsements
// ========================================

// POST /api/proposals/:id/comments - Add comment
proposalsRouter.post('/:id/comments', writeLimiter, requireAuth, (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;
  const { authorId, authorType = 'human', content, parentId } = req.body;

  if (!authorId || !content) {
    res.status(400).json({ error: 'authorId and content are required' });
    return;
  }

  try {
    const comment = governance.proposals.addComment(id, authorId, authorType, content, parentId);
    res.status(201).json({ comment });
  } catch (error) {
    console.error('Failed to add comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// GET /api/proposals/:id/comments - Get comments
proposalsRouter.get('/:id/comments', (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;

  try {
    const comments = governance.proposals.getComments(id);
    res.json({ comments });
  } catch (error) {
    console.error('Failed to get comments:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

// POST /api/proposals/:id/endorse - Add agent endorsement
proposalsRouter.post('/:id/endorse', requireAuth, (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;
  const { agentId, stance, confidence = 0.5, reasoning } = req.body;

  if (!agentId || !stance) {
    res.status(400).json({ error: 'agentId and stance are required' });
    return;
  }

  if (!['support', 'oppose', 'neutral'].includes(stance)) {
    res.status(400).json({ error: 'stance must be "support", "oppose", or "neutral"' });
    return;
  }

  try {
    const endorsement = governance.proposals.addEndorsement(id, agentId, stance, confidence, reasoning);
    res.status(201).json({ endorsement });
  } catch (error) {
    console.error('Failed to add endorsement:', error);
    res.status(500).json({ error: 'Failed to add endorsement' });
  }
});

// GET /api/proposals/:id/endorsements - Get endorsements
proposalsRouter.get('/:id/endorsements', (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;

  try {
    const endorsements = governance.proposals.getEndorsements(id);
    res.json({ endorsements });
  } catch (error) {
    console.error('Failed to get endorsements:', error);
    res.status(500).json({ error: 'Failed to get endorsements' });
  }
});

// GET /api/proposals/:id/history - Get proposal history
proposalsRouter.get('/:id/history', (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;

  try {
    const history = governance.proposals.getHistory(id);
    res.json({ history });
  } catch (error) {
    console.error('Failed to get proposal history:', error);
    res.status(500).json({ error: 'Failed to get proposal history' });
  }
});

// ========================================
// Decision Packet Endpoints
// ========================================

// GET /api/proposals/:id/decision-packet - Get decision packet
proposalsRouter.get('/:id/decision-packet', (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;
  const { version } = req.query;

  try {
    const packet = governance.decisionPackets.getPacket(id, version ? parseInt(version as string) : undefined);
    if (!packet) {
      res.status(404).json({ error: 'Decision packet not found' });
      return;
    }
    res.json({ packet });
  } catch (error) {
    console.error('Failed to get decision packet:', error);
    res.status(500).json({ error: 'Failed to get decision packet' });
  }
});

// POST /api/proposals/:id/decision-packet/generate - Generate decision packet
proposalsRouter.post('/:id/decision-packet/generate', llmLimiter, requireAdmin, async (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;
  const { requestedBy = 'anonymous' } = req.body;

  try {
    const packet = await governance.decisionPackets.generatePacket(id, requestedBy);
    res.status(201).json({ packet });
  } catch (error: any) {
    console.error('Failed to generate decision packet:', error);
    res.status(400).json({ error: error.message || 'Failed to generate decision packet' });
  }
});

// GET /api/proposals/:id/decision-packet/versions - Get all versions
proposalsRouter.get('/:id/decision-packet/versions', (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { id } = req.params;

  try {
    const versions = governance.decisionPackets.getPacketVersions(id);
    res.json({ versions });
  } catch (error) {
    console.error('Failed to get versions:', error);
    res.status(500).json({ error: 'Failed to get versions' });
  }
});

// ========================================
// Delegation Endpoints
// ========================================

// GET /api/proposals/delegation/typed-data - EIP-712 data to sign a delegation
// create/revoke. Declared BEFORE /delegation/:address so it is not captured by
// the :address param route. The frontend signs the result with the delegator's
// wallet, then POSTs/DELETEs with the signature.
proposalsRouter.get('/delegation/typed-data', writeLimiter, (req, res) => {
  const signatureService: SignatureService | undefined = req.app.locals.signatureService;
  if (!signatureService) {
    res.status(503).json({ error: 'Signature service unavailable' });
    return;
  }
  const { delegator, delegate, action, delegationId = '', nonce } = req.query;
  if (
    typeof delegator !== 'string' ||
    typeof delegate !== 'string' ||
    typeof nonce !== 'string' ||
    (action !== 'create' && action !== 'revoke')
  ) {
    res.status(400).json({ error: 'delegator, delegate, action(create|revoke), nonce are required' });
    return;
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  res.json(
    signatureService.buildDelegationTypedData({
      delegator,
      delegate,
      action,
      delegationId: typeof delegationId === 'string' ? delegationId : '',
      nonce,
      issuedAt,
    })
  );
});

// POST /api/proposals/delegation - Create delegation (wallet-signed)
proposalsRouter.post('/delegation', writeLimiter, (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const signatureService: SignatureService | undefined = req.app.locals.signatureService;
  const { delegator, delegate, categories, expiresAt, signature, nonce, issuedAt } = req.body;

  if (!delegator || !delegate) {
    res.status(400).json({ error: 'delegator and delegate are required' });
    return;
  }

  // Require an EIP-712 signature from the delegator so a delegation cannot be
  // forged for someone else's wallet (voting power is simulated; the signature
  // only proves control of the delegator address).
  if (signatureService) {
    if (!signature || !nonce || typeof issuedAt !== 'number') {
      res.status(401).json({ error: 'Delegation signature required. Include signature, nonce, issuedAt.' });
      return;
    }
    const result = signatureService.verifyDelegation(
      { delegator, delegate, action: 'create', delegationId: '', nonce, issuedAt },
      signature
    );
    if (!result.ok) {
      res.status(401).json({ error: `Signature verification failed: ${result.reason}` });
      return;
    }
  }

  try {
    const delegation = governance.voting.createDelegation(delegator, delegate, categories, expiresAt);
    res.status(201).json({ delegation });
  } catch (error) {
    console.error('Failed to create delegation:', error);
    res.status(500).json({ error: 'Failed to create delegation' });
  }
});

// DELETE /api/proposals/delegation/:id - Revoke delegation (signed by the delegator)
proposalsRouter.delete('/delegation/:id', writeLimiter, (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const signatureService: SignatureService | undefined = req.app.locals.signatureService;
  const { id } = req.params;
  const { delegator, signature, nonce, issuedAt } = req.body;

  const existing = governance.voting.getDelegationById(id);
  if (!existing || !existing.is_active) {
    res.status(404).json({ error: 'Delegation not found' });
    return;
  }

  // Only the delegator, proven via signature, may revoke their delegation.
  if (signatureService) {
    if (!signature || !nonce || typeof issuedAt !== 'number' || !delegator) {
      res.status(401).json({ error: 'Delegation signature required. Include delegator, signature, nonce, issuedAt.' });
      return;
    }
    if (existing.delegator.toLowerCase() !== String(delegator).toLowerCase()) {
      res.status(403).json({ error: 'Only the delegator can revoke this delegation' });
      return;
    }
    const result = signatureService.verifyDelegation(
      { delegator, delegate: existing.delegate, action: 'revoke', delegationId: id, nonce, issuedAt },
      signature
    );
    if (!result.ok) {
      res.status(401).json({ error: `Signature verification failed: ${result.reason}` });
      return;
    }
  }

  try {
    governance.voting.revokeDelegation(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to revoke delegation:', error);
    res.status(500).json({ error: 'Failed to revoke delegation' });
  }
});

// GET /api/proposals/delegation/:address - Get delegations for address
proposalsRouter.get('/delegation/:address', (req, res) => {
  const governance: GovernanceService = req.app.locals.governance;
  const { address } = req.params;

  try {
    const delegations = governance.voting.getDelegations(address);
    res.json(delegations);
  } catch (error) {
    console.error('Failed to get delegations:', error);
    res.status(500).json({ error: 'Failed to get delegations' });
  }
});
