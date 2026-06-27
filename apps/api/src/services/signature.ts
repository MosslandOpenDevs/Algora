import { ethers, type TypedDataDomain, type TypedDataField } from 'ethers';
import type Database from 'better-sqlite3';

export interface VoteSignaturePayload {
  proposalId: string;
  choice: 'for' | 'against' | 'abstain';
  voter: string;
  nonce: string;
  issuedAt: number; // unix seconds
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

// EIP-712 domain — keep chainId/verifyingContract stable across deploys.
// verifyingContract is a placeholder until the on-chain Voting contract
// is deployed; for now we bind it to a project-specific sentinel so replay
// across other dApps using Algora domain name isn't trivial.
const DOMAIN: TypedDataDomain = {
  name: 'Algora',
  version: '1',
  chainId: 1,
  verifyingContract: '0x0000000000000000000000000000000000000001',
};

const TYPES: Record<string, TypedDataField[]> = {
  Vote: [
    { name: 'proposalId', type: 'string' },
    { name: 'choice', type: 'string' },
    { name: 'voter', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'issuedAt', type: 'uint256' },
  ],
};

// Dual-house vote struct — distinct from the simple Vote so a signature
// valid for one flow can't be replayed into the other.
const DUAL_HOUSE_TYPES: Record<string, TypedDataField[]> = {
  DualHouseVote: [
    { name: 'votingId', type: 'string' },
    { name: 'house', type: 'string' },
    { name: 'choice', type: 'string' },
    { name: 'voter', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'issuedAt', type: 'uint256' },
  ],
};

export interface DualHouseSignaturePayload {
  votingId: string;
  house: 'mosscoin' | 'opensource';
  choice: 'for' | 'against' | 'abstain';
  voter: string;
  nonce: string;
  issuedAt: number;
}

// Delegation struct — a delegator signs to create or revoke a delegation of
// their voting power. Distinct from the vote structs so a signature for one
// flow can't be replayed into another.
const DELEGATION_TYPES: Record<string, TypedDataField[]> = {
  Delegation: [
    { name: 'delegator', type: 'address' },
    { name: 'delegate', type: 'address' },
    { name: 'action', type: 'string' },
    { name: 'delegationId', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'issuedAt', type: 'uint256' },
  ],
};

export interface DelegationSignaturePayload {
  delegator: string;
  delegate: string;
  action: 'create' | 'revoke';
  delegationId: string; // '' for create, the delegation id for revoke
  nonce: string;
  issuedAt: number;
}

const MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutes either direction

export class SignatureService {
  private db: Database.Database;
  private enforced: boolean;

  constructor(db: Database.Database, enforced: boolean) {
    this.db = db;
    this.enforced = enforced;
    this.initTable();
  }

  private initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vote_nonces (
        nonce TEXT PRIMARY KEY,
        voter TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_vote_nonces_voter ON vote_nonces(voter);
    `);
  }

  /**
   * When enforcement is on, votes without a valid signature are rejected.
   * When off, unsigned votes are allowed (dev / pre-wallet-integration mode)
   * but signed votes are still verified so the signature layer can be tested.
   */
  isEnforced(): boolean {
    return this.enforced;
  }

  buildTypedData(payload: VoteSignaturePayload): {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    primaryType: string;
    message: VoteSignaturePayload;
  } {
    return { domain: DOMAIN, types: TYPES, primaryType: 'Vote', message: payload };
  }

  buildDualHouseTypedData(payload: DualHouseSignaturePayload): {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    primaryType: string;
    message: DualHouseSignaturePayload;
  } {
    return {
      domain: DOMAIN,
      types: DUAL_HOUSE_TYPES,
      primaryType: 'DualHouseVote',
      message: payload,
    };
  }

  buildDelegationTypedData(payload: DelegationSignaturePayload): {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    primaryType: string;
    message: DelegationSignaturePayload;
  } {
    return {
      domain: DOMAIN,
      types: DELEGATION_TYPES,
      primaryType: 'Delegation',
      message: payload,
    };
  }

  verify(payload: VoteSignaturePayload, signature: string): VerifyResult {
    return this.verifyGeneric(TYPES, payload as unknown as Record<string, unknown>, signature, {
      voter: payload.voter,
      nonce: payload.nonce,
      issuedAt: payload.issuedAt,
      subject: payload.proposalId,
    });
  }

  verifyDualHouse(payload: DualHouseSignaturePayload, signature: string): VerifyResult {
    return this.verifyGeneric(DUAL_HOUSE_TYPES, payload as unknown as Record<string, unknown>, signature, {
      voter: payload.voter,
      nonce: payload.nonce,
      issuedAt: payload.issuedAt,
      subject: payload.votingId,
    });
  }

  verifyDelegation(payload: DelegationSignaturePayload, signature: string): VerifyResult {
    return this.verifyGeneric(DELEGATION_TYPES, payload as unknown as Record<string, unknown>, signature, {
      voter: payload.delegator,
      nonce: payload.nonce,
      issuedAt: payload.issuedAt,
      subject: `delegation:${payload.action}:${payload.delegationId}`,
    });
  }

  private verifyGeneric(
    types: Record<string, TypedDataField[]>,
    payload: Record<string, unknown>,
    signature: string,
    meta: { voter: string; nonce: string; issuedAt: number; subject: string },
  ): VerifyResult {
    try {
      const recovered = ethers.verifyTypedData(DOMAIN, types, payload, signature);
      if (recovered.toLowerCase() !== meta.voter.toLowerCase()) {
        return { ok: false, reason: 'signer does not match voter' };
      }
    } catch (err) {
      return { ok: false, reason: `invalid signature: ${(err as Error).message}` };
    }

    const now = Date.now();
    if (Math.abs(now - meta.issuedAt * 1000) > MAX_SKEW_MS) {
      return { ok: false, reason: 'signature expired or clock skewed' };
    }

    const existing = this.db.prepare(
      'SELECT nonce FROM vote_nonces WHERE nonce = ?'
    ).get(meta.nonce);
    if (existing) {
      return { ok: false, reason: 'nonce already used' };
    }

    this.db.prepare(
      'INSERT INTO vote_nonces (nonce, voter, proposal_id, used_at) VALUES (?, ?, ?, ?)'
    ).run(meta.nonce, meta.voter.toLowerCase(), meta.subject, new Date().toISOString());

    return { ok: true };
  }
}
