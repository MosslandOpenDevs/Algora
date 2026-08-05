import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { ethers } from 'ethers';
import { recordActivity } from '../../activity';

type TreasuryActivityType =
  | 'TREASURY_ALLOCATION_APPROVED'
  | 'TREASURY_DISBURSED'
  | 'TREASURY_TRANSACTION';

export interface TreasuryBalance {
  tokenAddress: string;
  tokenSymbol: string;
  balance: string;
  balanceFormatted: number;
  usdValue?: number;
}

export interface TreasuryTransaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'transfer' | 'allocation';
  tokenAddress: string;
  tokenSymbol: string;
  amount: string;
  fromAddress?: string;
  toAddress?: string;
  proposalId?: string;
  txHash?: string;
  status: 'pending' | 'confirmed' | 'failed';
  description: string;
  createdAt: string;
  confirmedAt?: string;
}

export interface BudgetAllocation {
  id: string;
  proposalId: string;
  category: string;
  tokenAddress: string;
  tokenSymbol: string;
  amount: string;
  recipient: string;
  status: 'pending' | 'approved' | 'disbursed' | 'cancelled';
  description: string;
  createdAt: string;
  approvedAt?: string;
  disbursedAt?: string;
}

export interface TreasuryConfig {
  treasuryAddress: string;
  rpcUrl: string;
  chainId: number;
  supportedTokens: { address: string; symbol: string; decimals: number }[];
}

export class TreasuryService {
  private db: Database.Database;
  private io: SocketServer;
  private provider: ethers.JsonRpcProvider | null = null;
  private config: TreasuryConfig;

  constructor(db: Database.Database, io: SocketServer, config?: Partial<TreasuryConfig>) {
    this.db = db;
    this.io = io;
    this.config = {
      treasuryAddress: process.env.TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000',
      rpcUrl: process.env.ETHEREUM_RPC_URL || '',
      chainId: parseInt(process.env.CHAIN_ID || '1'),
      supportedTokens: [
        { address: process.env.MOC_TOKEN_ADDRESS || '0x0', symbol: 'MOC', decimals: 18 },
        { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18 },
      ],
      ...config,
    };

    this.initializeTables();
    this.initializeProvider();
    console.log('[Treasury] Service initialized');
  }

  private initializeTables(): void {
    // Treasury transactions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS treasury_transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        token_address TEXT NOT NULL,
        token_symbol TEXT NOT NULL,
        amount TEXT NOT NULL,
        from_address TEXT,
        to_address TEXT,
        proposal_id TEXT,
        tx_hash TEXT,
        status TEXT DEFAULT 'pending',
        description TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        confirmed_at TEXT
      )
    `);

    // Budget allocations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS budget_allocations (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        category TEXT NOT NULL,
        token_address TEXT NOT NULL,
        token_symbol TEXT NOT NULL,
        amount TEXT NOT NULL,
        recipient TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        description TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        approved_at TEXT,
        disbursed_at TEXT
      )
    `);

    // Treasury balances cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS treasury_balances (
        token_address TEXT PRIMARY KEY,
        token_symbol TEXT NOT NULL,
        balance TEXT NOT NULL,
        balance_formatted REAL,
        usd_value REAL,
        last_updated TEXT DEFAULT (datetime('now'))
      )
    `);

    // Treasury spending limits
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS treasury_spending_limits (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        token_address TEXT NOT NULL,
        daily_limit TEXT,
        weekly_limit TEXT,
        monthly_limit TEXT,
        requires_proposal INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_treasury_tx_proposal ON treasury_transactions(proposal_id);
      CREATE INDEX IF NOT EXISTS idx_treasury_tx_status ON treasury_transactions(status);
      CREATE INDEX IF NOT EXISTS idx_budget_alloc_proposal ON budget_allocations(proposal_id);
      CREATE INDEX IF NOT EXISTS idx_budget_alloc_status ON budget_allocations(status);
    `);
  }

  private initializeProvider(): void {
    try {
      if (this.config.rpcUrl && !this.config.rpcUrl.includes('your-project-id')) {
        this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
        console.log('[Treasury] Provider initialized');
      } else {
        console.log('[Treasury] Running in mock mode (no RPC URL configured)');
      }
    } catch (error) {
      console.error('[Treasury] Failed to initialize provider:', error);
    }
  }

  // === Balance Management ===

  async getBalance(tokenAddress: string): Promise<TreasuryBalance | null> {
    const token = this.config.supportedTokens.find(
      t => t.address.toLowerCase() === tokenAddress.toLowerCase()
    );

    if (!token) {
      return null;
    }

    let balance = '0';

    if (this.provider) {
      try {
        if (tokenAddress === '0x0000000000000000000000000000000000000000') {
          // Native ETH
          const ethBalance = await this.provider.getBalance(this.config.treasuryAddress);
          balance = ethBalance.toString();
        } else {
          // ERC-20
          const contract = new ethers.Contract(
            tokenAddress,
            ['function balanceOf(address) view returns (uint256)'],
            this.provider
          );
          balance = (await contract.balanceOf(this.config.treasuryAddress)).toString();
        }
      } catch (error) {
        console.error('[Treasury] Failed to get balance:', error);
        // Use cached balance
        const cached = this.db.prepare(`
          SELECT * FROM treasury_balances WHERE token_address = ?
        `).get(tokenAddress.toLowerCase()) as any;
        if (cached) {
          balance = cached.balance;
        }
      }
    } else {
      // Mock mode - return cached or mock balance
      const cached = this.db.prepare(`
        SELECT * FROM treasury_balances WHERE token_address = ?
      `).get(tokenAddress.toLowerCase()) as any;

      if (cached) {
        balance = cached.balance;
      } else {
        // Generate mock balance
        balance = (BigInt(1000000) * BigInt(10 ** token.decimals)).toString();
      }
    }

    const balanceFormatted = Number(BigInt(balance) / BigInt(10 ** token.decimals));

    // Update cache
    this.db.prepare(`
      INSERT OR REPLACE INTO treasury_balances (token_address, token_symbol, balance, balance_formatted, last_updated)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(tokenAddress.toLowerCase(), token.symbol, balance, balanceFormatted);

    return {
      tokenAddress: tokenAddress.toLowerCase(),
      tokenSymbol: token.symbol,
      balance,
      balanceFormatted,
    };
  }

  async getAllBalances(): Promise<TreasuryBalance[]> {
    const balances: TreasuryBalance[] = [];

    for (const token of this.config.supportedTokens) {
      const balance = await this.getBalance(token.address);
      if (balance) {
        balances.push(balance);
      }
    }

    return balances;
  }

  // === Budget Allocations ===

  createAllocation(
    proposalId: string,
    options: {
      category: string;
      tokenAddress: string;
      amount: string;
      recipient: string;
      description?: string;
    }
  ): BudgetAllocation {
    const token = this.config.supportedTokens.find(
      t => t.address.toLowerCase() === options.tokenAddress.toLowerCase()
    );

    if (!token) {
      throw new Error('Unsupported token');
    }

    const id = `alloc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.db.prepare(`
      INSERT INTO budget_allocations
        (id, proposal_id, category, token_address, token_symbol, amount, recipient, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      proposalId,
      options.category,
      options.tokenAddress.toLowerCase(),
      token.symbol,
      options.amount,
      options.recipient.toLowerCase(),
      options.description || ''
    );

    const allocation = this.getAllocation(id)!;

    this.io.emit('treasury:allocation_created', allocation);

    return allocation;
  }

  getAllocation(allocationId: string): BudgetAllocation | null {
    const row = this.db.prepare(`
      SELECT * FROM budget_allocations WHERE id = ?
    `).get(allocationId) as any;

    return row ? this.mapAllocation(row) : null;
  }

  approveAllocation(allocationId: string): BudgetAllocation {
    const allocation = this.getAllocation(allocationId);
    if (!allocation) {
      throw new Error('Allocation not found');
    }

    if (allocation.status !== 'pending') {
      throw new Error(`Cannot approve allocation in ${allocation.status} status`);
    }

    this.db.prepare(`
      UPDATE budget_allocations
      SET status = 'approved', approved_at = datetime('now')
      WHERE id = ?
    `).run(allocationId);

    const updated = this.getAllocation(allocationId)!;

    this.io.emit('treasury:allocation_approved', updated);
    this.logActivity('TREASURY_ALLOCATION_APPROVED', `Allocation ${allocationId} approved`, { allocationId });

    return updated;
  }

  async disburseAllocation(allocationId: string, txHash?: string): Promise<BudgetAllocation> {
    const allocation = this.getAllocation(allocationId);
    if (!allocation) {
      throw new Error('Allocation not found');
    }

    if (allocation.status !== 'approved') {
      throw new Error(`Cannot disburse allocation in ${allocation.status} status`);
    }

    // Create transaction record
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.db.prepare(`
      INSERT INTO treasury_transactions
        (id, type, token_address, token_symbol, amount, from_address, to_address, proposal_id, tx_hash, status, description)
      VALUES (?, 'transfer', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      txId,
      allocation.tokenAddress,
      allocation.tokenSymbol,
      allocation.amount,
      this.config.treasuryAddress,
      allocation.recipient,
      allocation.proposalId,
      txHash || null,
      txHash ? 'confirmed' : 'pending',
      `Disbursement for allocation ${allocationId}`
    );

    // Update allocation status
    this.db.prepare(`
      UPDATE budget_allocations
      SET status = 'disbursed', disbursed_at = datetime('now')
      WHERE id = ?
    `).run(allocationId);

    const updated = this.getAllocation(allocationId)!;

    this.io.emit('treasury:allocation_disbursed', { allocation: updated, transactionId: txId });
    this.logActivity('TREASURY_DISBURSED', `Allocation ${allocationId} disbursed`, { allocationId, txId });

    return updated;
  }

  cancelAllocation(allocationId: string): BudgetAllocation {
    const allocation = this.getAllocation(allocationId);
    if (!allocation) {
      throw new Error('Allocation not found');
    }

    if (allocation.status === 'disbursed') {
      throw new Error('Cannot cancel disbursed allocation');
    }

    this.db.prepare(`
      UPDATE budget_allocations SET status = 'cancelled' WHERE id = ?
    `).run(allocationId);

    const updated = this.getAllocation(allocationId)!;

    this.io.emit('treasury:allocation_cancelled', updated);

    return updated;
  }

  listAllocations(options: {
    proposalId?: string;
    status?: string;
    category?: string;
    limit?: number;
    offset?: number;
  } = {}): BudgetAllocation[] {
    const { proposalId, status, category, limit = 50, offset = 0 } = options;

    let query = 'SELECT * FROM budget_allocations WHERE 1=1';
    const params: any[] = [];

    if (proposalId) {
      query += ' AND proposal_id = ?';
      params.push(proposalId);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.mapAllocation(row));
  }

  // === Transactions ===

  recordTransaction(
    type: 'deposit' | 'withdrawal' | 'transfer' | 'allocation',
    options: {
      tokenAddress: string;
      amount: string;
      fromAddress?: string;
      toAddress?: string;
      proposalId?: string;
      txHash?: string;
      description?: string;
    }
  ): TreasuryTransaction {
    const token = this.config.supportedTokens.find(
      t => t.address.toLowerCase() === options.tokenAddress.toLowerCase()
    );

    const id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.db.prepare(`
      INSERT INTO treasury_transactions
        (id, type, token_address, token_symbol, amount, from_address, to_address, proposal_id, tx_hash, status, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      type,
      options.tokenAddress.toLowerCase(),
      token?.symbol || 'UNKNOWN',
      options.amount,
      options.fromAddress?.toLowerCase(),
      options.toAddress?.toLowerCase(),
      options.proposalId,
      options.txHash,
      options.txHash ? 'confirmed' : 'pending',
      options.description || ''
    );

    const tx = this.getTransaction(id)!;

    this.io.emit('treasury:transaction', tx);
    this.logActivity('TREASURY_TRANSACTION', `${type} transaction recorded`, { transactionId: id, type });

    return tx;
  }

  getTransaction(transactionId: string): TreasuryTransaction | null {
    const row = this.db.prepare(`
      SELECT * FROM treasury_transactions WHERE id = ?
    `).get(transactionId) as any;

    return row ? this.mapTransaction(row) : null;
  }

  confirmTransaction(transactionId: string, txHash: string): TreasuryTransaction {
    const tx = this.getTransaction(transactionId);
    if (!tx) {
      throw new Error('Transaction not found');
    }

    this.db.prepare(`
      UPDATE treasury_transactions
      SET status = 'confirmed', tx_hash = ?, confirmed_at = datetime('now')
      WHERE id = ?
    `).run(txHash, transactionId);

    const updated = this.getTransaction(transactionId)!;

    this.io.emit('treasury:transaction_confirmed', updated);

    return updated;
  }

  listTransactions(options: {
    type?: string;
    status?: string;
    proposalId?: string;
    limit?: number;
    offset?: number;
  } = {}): TreasuryTransaction[] {
    const { type, status, proposalId, limit = 50, offset = 0 } = options;

    let query = 'SELECT * FROM treasury_transactions WHERE 1=1';
    const params: any[] = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (proposalId) {
      query += ' AND proposal_id = ?';
      params.push(proposalId);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.mapTransaction(row));
  }

  // === Spending Limits ===

  setSpendingLimit(
    category: string,
    tokenAddress: string,
    limits: {
      dailyLimit?: string;
      weeklyLimit?: string;
      monthlyLimit?: string;
      requiresProposal?: boolean;
    }
  ): void {
    const id = `limit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.db.prepare(`
      INSERT OR REPLACE INTO treasury_spending_limits
        (id, category, token_address, daily_limit, weekly_limit, monthly_limit, requires_proposal, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      category,
      tokenAddress.toLowerCase(),
      limits.dailyLimit,
      limits.weeklyLimit,
      limits.monthlyLimit,
      limits.requiresProposal !== false ? 1 : 0
    );
  }

  getSpendingLimits(): any[] {
    return this.db.prepare(`
      SELECT * FROM treasury_spending_limits ORDER BY category
    `).all() as any[];
  }

  checkSpendingLimit(category: string, tokenAddress: string, amount: string): boolean {
    const limit = this.db.prepare(`
      SELECT * FROM treasury_spending_limits
      WHERE category = ? AND token_address = ?
    `).get(category, tokenAddress.toLowerCase()) as any;

    if (!limit) {
      return true; // No limit set
    }

    const amountBigInt = BigInt(amount);

    // Check daily spending
    if (limit.daily_limit) {
      const dailySpent = this.getSpentInPeriod(category, tokenAddress, 'day');
      if (BigInt(dailySpent) + amountBigInt > BigInt(limit.daily_limit)) {
        return false;
      }
    }

    // Check weekly spending
    if (limit.weekly_limit) {
      const weeklySpent = this.getSpentInPeriod(category, tokenAddress, 'week');
      if (BigInt(weeklySpent) + amountBigInt > BigInt(limit.weekly_limit)) {
        return false;
      }
    }

    // Check monthly spending
    if (limit.monthly_limit) {
      const monthlySpent = this.getSpentInPeriod(category, tokenAddress, 'month');
      if (BigInt(monthlySpent) + amountBigInt > BigInt(limit.monthly_limit)) {
        return false;
      }
    }

    return true;
  }

  private getSpentInPeriod(category: string, tokenAddress: string, period: 'day' | 'week' | 'month'): string {
    let dateClause: string;
    switch (period) {
      case 'day':
        dateClause = "datetime('now', '-1 day')";
        break;
      case 'week':
        dateClause = "datetime('now', '-7 days')";
        break;
      case 'month':
        dateClause = "datetime('now', '-30 days')";
        break;
    }

    const result = this.db.prepare(`
      SELECT COALESCE(SUM(CAST(amount AS INTEGER)), 0) as total
      FROM budget_allocations
      WHERE category = ? AND token_address = ? AND status = 'disbursed'
        AND disbursed_at > ${dateClause}
    `).get(category, tokenAddress.toLowerCase()) as { total: number };

    return result.total.toString();
  }

  // === Stats ===

  getStats(): any {
    const allocations = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'disbursed' THEN 1 END) as disbursed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
      FROM budget_allocations
    `).get() as any;

    const transactions = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN type = 'deposit' THEN 1 END) as deposits,
        COUNT(CASE WHEN type = 'withdrawal' THEN 1 END) as withdrawals,
        COUNT(CASE WHEN type = 'transfer' THEN 1 END) as transfers
      FROM treasury_transactions
    `).get() as any;

    const disbursedByCategory = this.db.prepare(`
      SELECT category, token_symbol, SUM(CAST(amount AS INTEGER)) as total_amount
      FROM budget_allocations
      WHERE status = 'disbursed'
      GROUP BY category, token_symbol
    `).all() as any[];

    return {
      allocations: {
        total: allocations.total || 0,
        pending: allocations.pending || 0,
        approved: allocations.approved || 0,
        disbursed: allocations.disbursed || 0,
        cancelled: allocations.cancelled || 0,
      },
      transactions: {
        total: transactions.total || 0,
        deposits: transactions.deposits || 0,
        withdrawals: transactions.withdrawals || 0,
        transfers: transactions.transfers || 0,
      },
      disbursedByCategory,
      config: {
        treasuryAddress: this.config.treasuryAddress,
        chainId: this.config.chainId,
        supportedTokens: this.config.supportedTokens.length,
        mockMode: !this.provider,
      },
    };
  }

  // === Helpers ===

  private logActivity(type: TreasuryActivityType, message: string, metadata: any): void {
    try {
      recordActivity(this.db, { type, severity: 'info', message, metadata });
    } catch (error) {
      console.error('[Treasury] Failed to log activity:', error);
    }
  }

  private mapAllocation(row: any): BudgetAllocation {
    return {
      id: row.id,
      proposalId: row.proposal_id,
      category: row.category,
      tokenAddress: row.token_address,
      tokenSymbol: row.token_symbol,
      amount: row.amount,
      recipient: row.recipient,
      status: row.status,
      description: row.description,
      createdAt: row.created_at,
      approvedAt: row.approved_at,
      disbursedAt: row.disbursed_at,
    };
  }

  private mapTransaction(row: any): TreasuryTransaction {
    return {
      id: row.id,
      type: row.type,
      tokenAddress: row.token_address,
      tokenSymbol: row.token_symbol,
      amount: row.amount,
      fromAddress: row.from_address,
      toAddress: row.to_address,
      proposalId: row.proposal_id,
      txHash: row.tx_hash,
      status: row.status,
      description: row.description,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
    };
  }
}
