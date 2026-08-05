import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { ethers } from 'ethers';
import { isoNow } from '../../utils/time';

// MOC Token ERC-20 ABI (minimal for balance checking)
const MOC_TOKEN_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

export interface TokenHolder {
  id: string;
  walletAddress: string;
  userId?: string;
  balance: string;
  votingPower: number;
  verifiedAt: string;
  lastBalanceCheck: string;
  isVerified: boolean;
}

export interface TokenSnapshot {
  id: string;
  blockNumber: number;
  totalSupply: string;
  holderCount: number;
  createdAt: string;
  proposalId?: string;
}

export interface TokenConfig {
  contractAddress: string;
  rpcUrl: string;
  chainId: number;
  minBalanceForVoting: string;
  snapshotBlockDelay: number;
}

export class TokenService {
  private db: Database.Database;
  private io: SocketServer;
  private provider: ethers.JsonRpcProvider | null = null;
  private tokenContract: ethers.Contract | null = null;
  private config: TokenConfig;

  constructor(db: Database.Database, io: SocketServer, config?: Partial<TokenConfig>) {
    this.db = db;
    this.io = io;
    this.config = {
      contractAddress: process.env.MOC_TOKEN_ADDRESS || '0x0000000000000000000000000000000000000000',
      rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/your-project-id',
      chainId: parseInt(process.env.CHAIN_ID || '1'),
      minBalanceForVoting: process.env.MIN_BALANCE_FOR_VOTING || '1000000000000000000', // 1 token
      snapshotBlockDelay: parseInt(process.env.SNAPSHOT_BLOCK_DELAY || '10'),
      ...config,
    };

    this.initializeTables();
    this.initializeProvider();
    console.log('[TokenService] Service initialized');
  }

  private initializeTables(): void {
    // Token holders table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_holders (
        id TEXT PRIMARY KEY,
        wallet_address TEXT UNIQUE NOT NULL,
        user_id TEXT,
        balance TEXT DEFAULT '0',
        voting_power INTEGER DEFAULT 0,
        verified_at TEXT,
        last_balance_check TEXT,
        is_verified INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Token snapshots table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_snapshots (
        id TEXT PRIMARY KEY,
        block_number INTEGER NOT NULL,
        total_supply TEXT NOT NULL,
        holder_count INTEGER DEFAULT 0,
        proposal_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Snapshot balances table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshot_balances (
        id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        balance TEXT NOT NULL,
        voting_power INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (snapshot_id) REFERENCES token_snapshots(id)
      )
    `);

    // Wallet verification requests
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS wallet_verifications (
        id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        user_id TEXT,
        nonce TEXT NOT NULL,
        signature TEXT,
        status TEXT DEFAULT 'pending',
        expires_at TEXT NOT NULL,
        verified_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_token_holders_wallet ON token_holders(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_token_holders_user ON token_holders(user_id);
      CREATE INDEX IF NOT EXISTS idx_snapshot_balances_snapshot ON snapshot_balances(snapshot_id);
      CREATE INDEX IF NOT EXISTS idx_wallet_verifications_wallet ON wallet_verifications(wallet_address);
    `);
  }

  private initializeProvider(): void {
    try {
      if (this.config.rpcUrl && !this.config.rpcUrl.includes('your-project-id')) {
        this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
        this.tokenContract = new ethers.Contract(
          this.config.contractAddress,
          MOC_TOKEN_ABI,
          this.provider
        );
        console.log('[TokenService] Provider initialized');
      } else {
        console.log('[TokenService] Running in mock mode (no RPC URL configured)');
      }
    } catch (error) {
      console.error('[TokenService] Failed to initialize provider:', error);
    }
  }

  // === Wallet Verification ===

  createVerificationRequest(walletAddress: string, userId?: string): { nonce: string; message: string; expiresAt: string } {
    const normalizedAddress = walletAddress.toLowerCase();
    const nonce = this.generateNonce();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
    const id = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const message = this.createSignatureMessage(normalizedAddress, nonce);

    this.db.prepare(`
      INSERT INTO wallet_verifications (id, wallet_address, user_id, nonce, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, normalizedAddress, userId, nonce, expiresAt);

    return { nonce, message, expiresAt };
  }

  async verifyWalletSignature(
    walletAddress: string,
    signature: string,
    nonce: string
  ): Promise<TokenHolder | null> {
    const normalizedAddress = walletAddress.toLowerCase();

    // Get pending verification
    // expires_at is ISO-'T' (see utils/time.ts): compared against
    // datetime('now') the nonce's 15-minute window silently stretched to the
    // end of the UTC day, widening the signature-replay window.
    const verification = this.db.prepare(`
      SELECT * FROM wallet_verifications
      WHERE wallet_address = ? AND nonce = ? AND status = 'pending'
        AND expires_at > ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(normalizedAddress, nonce, isoNow()) as any;

    if (!verification) {
      throw new Error('Invalid or expired verification request');
    }

    // Verify signature
    const message = this.createSignatureMessage(normalizedAddress, nonce);
    const recoveredAddress = ethers.verifyMessage(message, signature).toLowerCase();

    if (recoveredAddress !== normalizedAddress) {
      throw new Error('Signature verification failed');
    }

    // Update verification status
    this.db.prepare(`
      UPDATE wallet_verifications
      SET status = 'verified', signature = ?, verified_at = datetime('now')
      WHERE id = ?
    `).run(signature, verification.id);

    // Create or update token holder
    const holder = await this.registerHolder(normalizedAddress, verification.user_id);

    this.io.emit('wallet:verified', { walletAddress: normalizedAddress, holder });

    return holder;
  }

  private createSignatureMessage(walletAddress: string, nonce: string): string {
    return `Sign this message to verify your wallet ownership for Algora governance.\n\nWallet: ${walletAddress}\nNonce: ${nonce}\n\nThis signature will not cost any gas.`;
  }

  private generateNonce(): string {
    return `algora_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  // === Token Holder Management ===

  async registerHolder(walletAddress: string, userId?: string): Promise<TokenHolder> {
    const normalizedAddress = walletAddress.toLowerCase();
    const id = `holder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check token balance
    const balance = await this.getTokenBalance(normalizedAddress);
    const votingPower = this.calculateVotingPower(balance);

    const existing = this.db.prepare(`
      SELECT * FROM token_holders WHERE wallet_address = ?
    `).get(normalizedAddress) as any;

    if (existing) {
      // Update existing holder
      this.db.prepare(`
        UPDATE token_holders
        SET balance = ?, voting_power = ?, user_id = COALESCE(?, user_id),
            is_verified = 1, verified_at = datetime('now'),
            last_balance_check = datetime('now'), updated_at = datetime('now')
        WHERE wallet_address = ?
      `).run(balance, votingPower, userId, normalizedAddress);

      return this.getHolder(existing.id)!;
    }

    // Create new holder
    this.db.prepare(`
      INSERT INTO token_holders (id, wallet_address, user_id, balance, voting_power, is_verified, verified_at, last_balance_check)
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(id, normalizedAddress, userId, balance, votingPower);

    const holder = this.getHolder(id)!;
    this.io.emit('token:holder_registered', holder);

    return holder;
  }

  getHolder(holderId: string): TokenHolder | null {
    const row = this.db.prepare(`
      SELECT * FROM token_holders WHERE id = ?
    `).get(holderId) as any;

    return row ? this.mapHolder(row) : null;
  }

  getHolderByWallet(walletAddress: string): TokenHolder | null {
    const row = this.db.prepare(`
      SELECT * FROM token_holders WHERE wallet_address = ?
    `).get(walletAddress.toLowerCase()) as any;

    return row ? this.mapHolder(row) : null;
  }

  getHolderByUserId(userId: string): TokenHolder | null {
    const row = this.db.prepare(`
      SELECT * FROM token_holders WHERE user_id = ?
    `).get(userId) as any;

    return row ? this.mapHolder(row) : null;
  }

  async refreshHolderBalance(holderId: string): Promise<TokenHolder> {
    const holder = this.getHolder(holderId);
    if (!holder) {
      throw new Error('Holder not found');
    }

    const balance = await this.getTokenBalance(holder.walletAddress);
    const votingPower = this.calculateVotingPower(balance);

    this.db.prepare(`
      UPDATE token_holders
      SET balance = ?, voting_power = ?, last_balance_check = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(balance, votingPower, holderId);

    const updated = this.getHolder(holderId)!;
    this.io.emit('token:balance_updated', updated);

    return updated;
  }

  listHolders(options: { limit?: number; offset?: number; minBalance?: string } = {}): TokenHolder[] {
    const { limit = 100, offset = 0, minBalance } = options;

    let query = 'SELECT * FROM token_holders WHERE is_verified = 1';
    const params: any[] = [];

    if (minBalance) {
      query += ' AND CAST(balance AS INTEGER) >= ?';
      params.push(minBalance);
    }

    query += ' ORDER BY CAST(balance AS INTEGER) DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.mapHolder(row));
  }

  // === Token Balance ===

  async getTokenBalance(walletAddress: string): Promise<string> {
    if (!this.tokenContract) {
      // Mock mode: return random balance for testing
      return this.getMockBalance(walletAddress);
    }

    try {
      const balance = await this.tokenContract.balanceOf(walletAddress);
      return balance.toString();
    } catch (error) {
      console.error('[TokenService] Failed to get balance:', error);
      return '0';
    }
  }

  private getMockBalance(walletAddress: string): string {
    // Generate deterministic mock balance based on address
    const hash = walletAddress.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const baseBalance = BigInt(hash * 1000000000000000000); // 1 token = 10^18
    return baseBalance.toString();
  }

  calculateVotingPower(balance: string): number {
    // Voting power is proportional to token holdings
    // 1 token = 1 voting power (scaled for display)
    try {
      const balanceBigInt = BigInt(balance);
      const decimals = BigInt(10 ** 18); // Assuming 18 decimals
      return Number(balanceBigInt / decimals);
    } catch {
      return 0;
    }
  }

  isEligibleToVote(walletAddress: string): boolean {
    const holder = this.getHolderByWallet(walletAddress);
    if (!holder || !holder.isVerified) return false;

    try {
      return BigInt(holder.balance) >= BigInt(this.config.minBalanceForVoting);
    } catch {
      return false;
    }
  }

  // === Token Snapshots ===

  async createSnapshot(proposalId?: string): Promise<TokenSnapshot> {
    const id = `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let blockNumber = 0;
    let totalSupply = '0';

    if (this.provider && this.tokenContract) {
      try {
        blockNumber = await this.provider.getBlockNumber();
        totalSupply = (await this.tokenContract.totalSupply()).toString();
      } catch (error) {
        console.error('[TokenService] Failed to get block info:', error);
      }
    } else {
      // Mock mode
      blockNumber = Math.floor(Date.now() / 1000);
      totalSupply = '1000000000000000000000000'; // 1M tokens
    }

    // Get all verified holders
    const holders = this.listHolders({ limit: 10000 });

    this.db.prepare(`
      INSERT INTO token_snapshots (id, block_number, total_supply, holder_count, proposal_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, blockNumber, totalSupply, holders.length, proposalId);

    // Store snapshot balances
    const insertBalance = this.db.prepare(`
      INSERT INTO snapshot_balances (id, snapshot_id, wallet_address, balance, voting_power)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const holder of holders) {
      const balanceId = `bal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      insertBalance.run(balanceId, id, holder.walletAddress, holder.balance, holder.votingPower);
    }

    const snapshot = this.getSnapshot(id)!;
    this.io.emit('token:snapshot_created', snapshot);

    return snapshot;
  }

  getSnapshot(snapshotId: string): TokenSnapshot | null {
    const row = this.db.prepare(`
      SELECT * FROM token_snapshots WHERE id = ?
    `).get(snapshotId) as any;

    return row ? this.mapSnapshot(row) : null;
  }

  getSnapshotForProposal(proposalId: string): TokenSnapshot | null {
    const row = this.db.prepare(`
      SELECT * FROM token_snapshots WHERE proposal_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(proposalId) as any;

    return row ? this.mapSnapshot(row) : null;
  }

  getSnapshotBalance(snapshotId: string, walletAddress: string): { balance: string; votingPower: number } | null {
    const row = this.db.prepare(`
      SELECT balance, voting_power FROM snapshot_balances
      WHERE snapshot_id = ? AND wallet_address = ?
    `).get(snapshotId, walletAddress.toLowerCase()) as any;

    return row ? { balance: row.balance, votingPower: row.voting_power } : null;
  }

  listSnapshots(limit: number = 20): TokenSnapshot[] {
    const rows = this.db.prepare(`
      SELECT * FROM token_snapshots ORDER BY created_at DESC LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => this.mapSnapshot(row));
  }

  // === Token Info ===

  async getTokenInfo(): Promise<any> {
    if (!this.tokenContract) {
      return {
        address: this.config.contractAddress,
        name: 'Mossland MOC',
        symbol: 'MOC',
        decimals: 18,
        totalSupply: '1000000000000000000000000',
        chainId: this.config.chainId,
        mockMode: true,
      };
    }

    try {
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        this.tokenContract.name(),
        this.tokenContract.symbol(),
        this.tokenContract.decimals(),
        this.tokenContract.totalSupply(),
      ]);

      return {
        address: this.config.contractAddress,
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: totalSupply.toString(),
        chainId: this.config.chainId,
        mockMode: false,
      };
    } catch (error) {
      console.error('[TokenService] Failed to get token info:', error);
      return null;
    }
  }

  // === Stats ===

  getStats(): any {
    const holders = this.db.prepare(`
      SELECT
        COUNT(*) as total_holders,
        COUNT(CASE WHEN is_verified = 1 THEN 1 END) as verified_holders,
        SUM(CAST(balance AS INTEGER)) as total_balance,
        SUM(voting_power) as total_voting_power,
        AVG(voting_power) as avg_voting_power
      FROM token_holders
    `).get() as any;

    const snapshots = this.db.prepare(`
      SELECT COUNT(*) as count FROM token_snapshots
    `).get() as { count: number };

    const verifications = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
      FROM wallet_verifications
    `).get() as any;

    return {
      holders: {
        total: holders.total_holders || 0,
        verified: holders.verified_holders || 0,
        totalBalance: holders.total_balance?.toString() || '0',
        totalVotingPower: holders.total_voting_power || 0,
        avgVotingPower: holders.avg_voting_power || 0,
      },
      snapshots: snapshots.count,
      verifications: {
        total: verifications.total || 0,
        verified: verifications.verified || 0,
        pending: verifications.pending || 0,
      },
      config: {
        contractAddress: this.config.contractAddress,
        chainId: this.config.chainId,
        minBalanceForVoting: this.config.minBalanceForVoting,
        mockMode: !this.tokenContract,
      },
    };
  }

  // === Mappers ===

  private mapHolder(row: any): TokenHolder {
    return {
      id: row.id,
      walletAddress: row.wallet_address,
      userId: row.user_id,
      balance: row.balance,
      votingPower: row.voting_power,
      verifiedAt: row.verified_at,
      lastBalanceCheck: row.last_balance_check,
      isVerified: Boolean(row.is_verified),
    };
  }

  private mapSnapshot(row: any): TokenSnapshot {
    return {
      id: row.id,
      blockNumber: row.block_number,
      totalSupply: row.total_supply,
      holderCount: row.holder_count,
      createdAt: row.created_at,
      proposalId: row.proposal_id,
    };
  }
}
