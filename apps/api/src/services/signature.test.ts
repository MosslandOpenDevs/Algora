import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ethers } from 'ethers';
import { SignatureService, type VoteSignaturePayload } from './signature';

type SigningWallet = ReturnType<typeof ethers.Wallet.createRandom>;

async function sign(wallet: SigningWallet, svc: SignatureService, payload: VoteSignaturePayload): Promise<string> {
  const td = svc.buildTypedData(payload);
  return wallet.signTypedData(td.domain, td.types, td.message);
}

function freshPayload(voter: string, overrides: Partial<VoteSignaturePayload> = {}): VoteSignaturePayload {
  return {
    proposalId: 'prop-1',
    choice: 'for',
    voter,
    nonce: `n-${Math.random().toString(36).slice(2)}`,
    issuedAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

describe('SignatureService', () => {
  let svc: SignatureService;
  let wallet: SigningWallet;

  beforeEach(() => {
    svc = new SignatureService(new Database(':memory:'), true);
    wallet = ethers.Wallet.createRandom();
  });

  it('verifies a good signature and consumes the nonce', async () => {
    const payload = freshPayload(wallet.address);
    const sig = await sign(wallet, svc, payload);
    expect(svc.verify(payload, sig)).toEqual({ ok: true });
  });

  it('rejects a replayed nonce', async () => {
    const payload = freshPayload(wallet.address);
    const sig = await sign(wallet, svc, payload);
    expect(svc.verify(payload, sig).ok).toBe(true);

    // Same payload (including nonce), same signature — must be rejected.
    const second = svc.verify(payload, sig);
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/nonce/);
  });

  it('rejects when signer does not match voter', async () => {
    const attacker = ethers.Wallet.createRandom();
    const payload = freshPayload(wallet.address); // claims voter = wallet
    const sig = await sign(attacker, svc, payload); // but attacker signs
    const result = svc.verify(payload, sig);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/signer does not match/);
  });

  it('rejects a mutated payload (signature over original)', async () => {
    const payload = freshPayload(wallet.address);
    const sig = await sign(wallet, svc, payload);

    const tampered: VoteSignaturePayload = { ...payload, choice: 'against' };
    const result = svc.verify(tampered, sig);
    expect(result.ok).toBe(false);
  });

  it('rejects stale issuedAt (clock skew)', async () => {
    const payload = freshPayload(wallet.address, {
      issuedAt: Math.floor(Date.now() / 1000) - 10 * 60, // 10 min old
    });
    const sig = await sign(wallet, svc, payload);
    const result = svc.verify(payload, sig);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/expired|skew/);
  });

  it('rejects a malformed signature', () => {
    const payload = freshPayload(wallet.address);
    const result = svc.verify(payload, '0xdeadbeef');
    expect(result.ok).toBe(false);
  });
});
