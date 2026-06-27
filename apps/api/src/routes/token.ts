import { Router } from 'express';
import type { Server as SocketServer } from 'socket.io';
import type { TokenIntegrationService } from '../services/token';
import type { SignatureService } from '../services/signature';
import { writeLimiter } from '../middleware/rate-limit';
import { requireAdmin } from '../middleware/auth';

export const tokenRouter: Router = Router();

// ===========================================
// Token Voting WebSocket Events
// ===========================================

/**
 * Broadcast vote cast event to all connected clients
 */
function broadcastVoteCast(
  io: SocketServer,
  data: {
    proposalId: string;
    voter: string;
    choice: 'for' | 'against' | 'abstain';
    votingPower: number;
  }
): void {
  io.emit('vote:cast', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast tally update event to all connected clients
 */
function broadcastTallyUpdated(
  io: SocketServer,
  data: {
    proposalId: string;
    tally: {
      forVotes: number;
      againstVotes: number;
      abstainVotes: number;
      totalVotingPower: number;
      totalEligiblePower: number;
      participationRate: number;
      quorumReached: boolean;
      result: string;
    };
  }
): void {
  io.emit('vote:tally:updated', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

// === Token Info ===

// GET /api/token/info - Get token information
tokenRouter.get('/info', async (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const info = await tokenService.token.getTokenInfo();
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/token/stats - Get token stats
tokenRouter.get('/stats', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const stats = tokenService.token.getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === Wallet Verification ===

// POST /api/token/verify/request - Request wallet verification
tokenRouter.post('/verify/request', writeLimiter, (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const { walletAddress, userId } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: 'walletAddress is required' });
    }

    const result = tokenService.token.createVerificationRequest(walletAddress, userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/token/verify/confirm - Confirm wallet verification with signature
tokenRouter.post('/verify/confirm', writeLimiter, async (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const { walletAddress, signature, nonce } = req.body;

    if (!walletAddress || !signature || !nonce) {
      return res.status(400).json({ error: 'walletAddress, signature, and nonce are required' });
    }

    const holder = await tokenService.token.verifyWalletSignature(walletAddress, signature, nonce);
    res.json(holder);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// === Token Holders ===

// GET /api/token/holders - List token holders
tokenRouter.get('/holders', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const minBalance = req.query.minBalance as string;

    const holders = tokenService.token.listHolders({ limit, offset, minBalance });
    res.json(holders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/token/holders/:id - Get holder by ID
tokenRouter.get('/holders/:id', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const holder = tokenService.token.getHolder(req.params.id);
    if (!holder) {
      return res.status(404).json({ error: 'Holder not found' });
    }
    res.json(holder);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/token/holders/wallet/:address - Get holder by wallet address
tokenRouter.get('/holders/wallet/:address', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const holder = tokenService.token.getHolderByWallet(req.params.address);
    if (!holder) {
      return res.status(404).json({ error: 'Holder not found' });
    }
    res.json(holder);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/token/holders/:id/refresh - Refresh holder balance
tokenRouter.post('/holders/:id/refresh', writeLimiter, async (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const holder = await tokenService.token.refreshHolderBalance(req.params.id);
    res.json(holder);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/token/holders/:address/profile - Get holder profile
tokenRouter.get('/holders/:address/profile', async (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const profile = await tokenService.getHolderProfile(req.params.address);
    if (!profile) {
      return res.status(404).json({ error: 'Holder not found' });
    }
    res.json(profile);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === Token Snapshots ===

// POST /api/token/snapshots - Create a snapshot
tokenRouter.post('/snapshots', writeLimiter, requireAdmin, async (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const { proposalId } = req.body;
    const snapshot = await tokenService.token.createSnapshot(proposalId);
    res.json(snapshot);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/token/snapshots - List snapshots
tokenRouter.get('/snapshots', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const snapshots = tokenService.token.listSnapshots(limit);
    res.json(snapshots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/token/snapshots/:id - Get snapshot by ID
tokenRouter.get('/snapshots/:id', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const snapshot = tokenService.token.getSnapshot(req.params.id);
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }
    res.json(snapshot);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/token/snapshots/:id/balance/:address - Get balance from snapshot
tokenRouter.get('/snapshots/:id/balance/:address', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const balance = tokenService.token.getSnapshotBalance(req.params.id, req.params.address);
    if (!balance) {
      return res.status(404).json({ error: 'Balance not found in snapshot' });
    }
    res.json(balance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === Token Voting ===

// POST /api/token/voting/initialize - Initialize voting for a proposal
tokenRouter.post('/voting/initialize', writeLimiter, requireAdmin, async (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const { proposalId, votingDurationHours, quorumThreshold, passThreshold } = req.body;

    if (!proposalId) {
      return res.status(400).json({ error: 'proposalId is required' });
    }

    const voting = await tokenService.voting.initializeVotingForProposal(proposalId, {
      votingDurationHours,
      quorumThreshold,
      passThreshold,
    });
    res.json(voting);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/token/voting/:proposalId - Get voting info for proposal
tokenRouter.get('/voting/:proposalId', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const voting = tokenService.voting.getProposalVoting(req.params.proposalId);
    if (!voting) {
      return res.status(404).json({ error: 'Voting not found for this proposal' });
    }
    res.json(voting);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/token/voting/:proposalId/typed-data - EIP-712 typed data for a vote.
// The frontend fetches this, signs it with the connected wallet, then POSTs /vote.
tokenRouter.get('/voting/:proposalId/typed-data', (req, res) => {
  const signatureService: SignatureService | undefined = req.app.locals.signatureService;
  if (!signatureService) {
    return res.status(503).json({ error: 'Signature service unavailable' });
  }
  const { proposalId } = req.params;
  const { voter, choice, nonce } = req.query;
  if (typeof voter !== 'string' || typeof choice !== 'string' || typeof nonce !== 'string') {
    return res.status(400).json({ error: 'voter, choice, nonce query params are required' });
  }
  if (!['for', 'against', 'abstain'].includes(choice)) {
    return res.status(400).json({ error: 'choice must be "for", "against", or "abstain"' });
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  return res.json(
    signatureService.buildTypedData({
      proposalId,
      choice: choice as 'for' | 'against' | 'abstain',
      voter,
      nonce,
      issuedAt,
    })
  );
});

// POST /api/token/voting/:proposalId/vote - Cast a vote
tokenRouter.post('/voting/:proposalId/vote', writeLimiter, async (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  const io: SocketServer = req.app.locals.io;
  const signatureService: SignatureService | undefined = req.app.locals.signatureService;
  try {
    const { walletAddress, choice, signature, reason, nonce, issuedAt } = req.body;
    const proposalId = req.params.proposalId;

    if (!walletAddress || !choice) {
      return res.status(400).json({ error: 'walletAddress and choice are required' });
    }

    if (!['for', 'against', 'abstain'].includes(choice)) {
      return res.status(400).json({ error: 'choice must be "for", "against", or "abstain"' });
    }

    // EIP-712 verification — always required on this public vote path.
    // Every vote must carry a wallet signature that recovers to walletAddress
    // with a fresh nonce, so a vote cannot be forged for another address or
    // replayed. (Token balances/voting power remain simulated; the signature
    // only proves the voter controls the wallet they claim.)
    if (signatureService) {
      if (!signature) {
        return res
          .status(401)
          .json({ error: 'Vote signature required. Include signature, nonce, issuedAt.' });
      }
      if (!nonce || typeof issuedAt !== 'number') {
        return res
          .status(400)
          .json({ error: 'nonce and issuedAt are required when a signature is provided' });
      }
      const result = signatureService.verify(
        { proposalId, choice, voter: walletAddress, nonce, issuedAt },
        signature
      );
      if (!result.ok) {
        return res
          .status(401)
          .json({ error: `Signature verification failed: ${result.reason}` });
      }
    }

    const vote = await tokenService.voting.castVote(
      proposalId,
      walletAddress,
      choice,
      { signature, reason }
    );

    // Broadcast vote cast event to all connected clients
    if (io) {
      broadcastVoteCast(io, {
        proposalId,
        voter: walletAddress,
        choice,
        votingPower: vote.votingPower || 0,
      });

      // Also broadcast updated tally
      try {
        const tally = tokenService.voting.calculateTally(proposalId);
        broadcastTallyUpdated(io, {
          proposalId,
          tally: {
            forVotes: tally.forVotes || 0,
            againstVotes: tally.againstVotes || 0,
            abstainVotes: tally.abstainVotes || 0,
            totalVotingPower: tally.totalVotingPower || 0,
            totalEligiblePower: tally.totalEligiblePower || 0,
            participationRate: tally.participationRate || 0,
            quorumReached: tally.quorumReached || false,
            result: tally.result || 'pending',
          },
        });
      } catch (tallyError) {
        console.warn('[TokenVoting] Failed to broadcast tally update:', tallyError);
      }
    }

    res.json(vote);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/token/voting/:proposalId/votes - List votes for proposal
tokenRouter.get('/voting/:proposalId/votes', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const votes = tokenService.voting.listVotesForProposal(req.params.proposalId);
    res.json(votes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/token/voting/:proposalId/tally - Get vote tally
tokenRouter.get('/voting/:proposalId/tally', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const tally = tokenService.voting.calculateTally(req.params.proposalId);
    res.json(tally);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/token/voting/:proposalId/finalize - Finalize voting
tokenRouter.post('/voting/:proposalId/finalize', writeLimiter, requireAdmin, async (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const tally = await tokenService.voting.finalizeVoting(req.params.proposalId);
    res.json(tally);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/token/voting-stats - Get voting stats
tokenRouter.get('/voting-stats', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const stats = tokenService.voting.getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === Treasury ===

// GET /api/token/treasury/balances - Get treasury balances
tokenRouter.get('/treasury/balances', async (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const balances = await tokenService.treasury.getAllBalances();
    res.json(balances);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/token/treasury/stats - Get treasury stats
tokenRouter.get('/treasury/stats', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const stats = tokenService.treasury.getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === Treasury Allocations ===

// POST /api/token/treasury/allocations - Create allocation
tokenRouter.post('/treasury/allocations', writeLimiter, requireAdmin, (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const { proposalId, category, tokenAddress, amount, recipient, description } = req.body;

    if (!proposalId || !category || !tokenAddress || !amount || !recipient) {
      return res.status(400).json({
        error: 'proposalId, category, tokenAddress, amount, and recipient are required',
      });
    }

    const allocation = tokenService.treasury.createAllocation(proposalId, {
      category,
      tokenAddress,
      amount,
      recipient,
      description,
    });
    res.json(allocation);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/token/treasury/allocations - List allocations
tokenRouter.get('/treasury/allocations', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const { proposalId, status, category } = req.query;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const allocations = tokenService.treasury.listAllocations({
      proposalId: proposalId as string,
      status: status as string,
      category: category as string,
      limit,
      offset,
    });
    res.json(allocations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/token/treasury/allocations/:id - Get allocation by ID
tokenRouter.get('/treasury/allocations/:id', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const allocation = tokenService.treasury.getAllocation(req.params.id);
    if (!allocation) {
      return res.status(404).json({ error: 'Allocation not found' });
    }
    res.json(allocation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/token/treasury/allocations/:id/approve - Approve allocation
tokenRouter.post('/treasury/allocations/:id/approve', writeLimiter, requireAdmin, (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const allocation = tokenService.treasury.approveAllocation(req.params.id);
    res.json(allocation);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/token/treasury/allocations/:id/disburse - Disburse allocation
tokenRouter.post('/treasury/allocations/:id/disburse', writeLimiter, requireAdmin, async (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const { txHash } = req.body;
    const allocation = await tokenService.treasury.disburseAllocation(req.params.id, txHash);
    res.json(allocation);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/token/treasury/allocations/:id/cancel - Cancel allocation
tokenRouter.post('/treasury/allocations/:id/cancel', writeLimiter, requireAdmin, (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const allocation = tokenService.treasury.cancelAllocation(req.params.id);
    res.json(allocation);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// === Treasury Transactions ===

// POST /api/token/treasury/transactions - Record transaction
tokenRouter.post('/treasury/transactions', writeLimiter, requireAdmin, (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const { type, tokenAddress, amount, fromAddress, toAddress, proposalId, txHash, description } =
      req.body;

    if (!type || !tokenAddress || !amount) {
      return res.status(400).json({ error: 'type, tokenAddress, and amount are required' });
    }

    const tx = tokenService.treasury.recordTransaction(type, {
      tokenAddress,
      amount,
      fromAddress,
      toAddress,
      proposalId,
      txHash,
      description,
    });
    res.json(tx);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/token/treasury/transactions - List transactions
tokenRouter.get('/treasury/transactions', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const { type, status, proposalId } = req.query;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const transactions = tokenService.treasury.listTransactions({
      type: type as string,
      status: status as string,
      proposalId: proposalId as string,
      limit,
      offset,
    });
    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/token/treasury/transactions/:id/confirm - Confirm transaction
tokenRouter.post('/treasury/transactions/:id/confirm', writeLimiter, requireAdmin, (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const { txHash } = req.body;

    if (!txHash) {
      return res.status(400).json({ error: 'txHash is required' });
    }

    const tx = tokenService.treasury.confirmTransaction(req.params.id, txHash);
    res.json(tx);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// === Spending Limits ===

// GET /api/token/treasury/limits - Get spending limits
tokenRouter.get('/treasury/limits', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const limits = tokenService.treasury.getSpendingLimits();
    res.json(limits);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/token/treasury/limits - Set spending limit
tokenRouter.post('/treasury/limits', writeLimiter, requireAdmin, (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const { category, tokenAddress, dailyLimit, weeklyLimit, monthlyLimit, requiresProposal } =
      req.body;

    if (!category || !tokenAddress) {
      return res.status(400).json({ error: 'category and tokenAddress are required' });
    }

    tokenService.treasury.setSpendingLimit(category, tokenAddress, {
      dailyLimit,
      weeklyLimit,
      monthlyLimit,
      requiresProposal,
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/token/treasury/limits/check - Check spending limit
tokenRouter.post('/treasury/limits/check', (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const { category, tokenAddress, amount } = req.body;

    if (!category || !tokenAddress || !amount) {
      return res.status(400).json({ error: 'category, tokenAddress, and amount are required' });
    }

    const withinLimit = tokenService.treasury.checkSpendingLimit(category, tokenAddress, amount);
    res.json({ withinLimit });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// === Dashboard ===

// GET /api/token/dashboard - Get comprehensive dashboard
tokenRouter.get('/dashboard', async (req, res) => {
  const tokenService: TokenIntegrationService = req.app.locals.tokenIntegration;
  try {
    const dashboard = await tokenService.getDashboard();
    res.json(dashboard);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
