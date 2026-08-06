/**
 * Chain configuration.
 *
 * Whether balances are real or fabricated was decided by a substring test against
 * one hardcoded placeholder, under a variable name no document mentioned: the
 * code read ETHEREUM_RPC_URL while .env.example documented MOC_RPC_URL and the
 * project spec documented RPC_URL. Following either document configured nothing
 * the code could see, and the service kept minting ~2,000-4,000 MOC of voting
 * power per address with no error — the token address being correct made it look
 * configured.
 *
 * Half-configured is the other trap: an RPC without a token address bound the
 * contract to the zero address, so balanceOf reverted and every holder read 0.
 */

import { describe, it, expect } from 'vitest';

import {
  resolveChainConfig,
  ChainConfigError,
  providerOptions,
} from './chain-config';

const RPC = 'https://ethereum-rpc.publicnode.com';
const MOC = '0x8bbfe65e31b348cd823c62e02ad8c19a84dd0dab';

/** resolveChainConfig reads process.env; give it an isolated one. */
function resolve(env: Record<string, string>) {
  return resolveChainConfig({ ...env } as NodeJS.ProcessEnv);
}

describe('resolveChainConfig', () => {
  it('is not live when nothing is configured', () => {
    const config = resolve({});

    expect(config.live).toBe(false);
    expect(config.rpcUrl).toBeNull();
    expect(config.contractAddress).toBeNull();
  });

  it('is live when both the RPC and the token address are set', () => {
    const config = resolve({ ETHEREUM_RPC_URL: RPC, MOC_TOKEN_ADDRESS: MOC });

    expect(config.live).toBe(true);
    expect(config.rpcUrl).toBe(RPC);
    expect(config.contractAddress).toBe(MOC);
  });

  it('accepts the RPC name .env.example documents', () => {
    const config = resolve({ MOC_RPC_URL: RPC, MOC_TOKEN_ADDRESS: MOC });

    expect(config.live).toBe(true);
    expect(config.source.rpcUrl).toBe('MOC_RPC_URL');
  });

  it('accepts the RPC name the project spec documents', () => {
    const config = resolve({ RPC_URL: RPC, MOC_TOKEN_ADDRESS: MOC });

    expect(config.live).toBe(true);
    expect(config.source.rpcUrl).toBe('RPC_URL');
  });

  it('accepts the token address name .env.example documents', () => {
    const config = resolve({
      ETHEREUM_RPC_URL: RPC,
      MOC_CONTRACT_ADDRESS: MOC,
    });

    expect(config.live).toBe(true);
    expect(config.source.contractAddress).toBe('MOC_CONTRACT_ADDRESS');
  });

  it('treats an unfilled template value as unconfigured', () => {
    const config = resolve({
      ETHEREUM_RPC_URL: 'https://mainnet.infura.io/v3/your-project-id',
    });

    expect(config.live).toBe(false);
  });

  it('refuses an RPC without a token address', () => {
    expect(() => resolve({ ETHEREUM_RPC_URL: RPC })).toThrow(ChainConfigError);
    expect(() => resolve({ ETHEREUM_RPC_URL: RPC })).toThrow(
      /no token address/
    );
  });

  it('refuses a token address without an RPC', () => {
    expect(() => resolve({ MOC_TOKEN_ADDRESS: MOC })).toThrow(/no RPC URL/);
  });

  it('refuses the zero address, which would revert for every holder', () => {
    expect(() =>
      resolve({
        ETHEREUM_RPC_URL: RPC,
        MOC_TOKEN_ADDRESS: '0x0000000000000000000000000000000000000000',
      })
    ).toThrow(/zero address/);
  });

  it('refuses a nonsense chain id', () => {
    expect(() =>
      resolve({
        ETHEREUM_RPC_URL: RPC,
        MOC_TOKEN_ADDRESS: MOC,
        CHAIN_ID: 'mainnet',
      })
    ).toThrow(/CHAIN_ID/);
  });

  it('defaults to chain 1', () => {
    expect(
      resolve({ ETHEREUM_RPC_URL: RPC, MOC_TOKEN_ADDRESS: MOC }).chainId
    ).toBe(1);
  });
});

describe('providerOptions', () => {
  it('pins the network so a flaky endpoint cannot wedge on chain-id detection', () => {
    // Without staticNetwork, ethers probes for the chain id and retries that probe
    // every second indefinitely when the endpoint answers unexpectedly — which
    // hangs wallet registration rather than failing it.
    expect(providerOptions(1)).toMatchObject({
      staticNetwork: true,
      chainId: 1,
    });
  });
});
