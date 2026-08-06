/**
 * One place that decides whether this process talks to a real chain.
 *
 * The setting was previously read ad hoc in two services, under names that three
 * documents disagreed about: the code read ETHEREUM_RPC_URL, .env.example
 * documented MOC_RPC_URL, and ALGORA_PROJECT_SPEC.md documented RPC_URL. An
 * operator following either document configured nothing the code could see and
 * stayed on fabricated balances with no error — the mock/real decision was gated
 * on the RPC string alone, so even a correct MOC_TOKEN_ADDRESS gave false
 * assurance the integration was live.
 *
 * Aliases are accepted here so following any of those documents works, and a
 * half-configured process refuses to start rather than reporting a number nobody
 * can distinguish from a chain read.
 */

/** Values that mean "someone pasted the template and never filled it in". */
const PLACEHOLDER_MARKERS = [
  'your-project-id',
  'your_',
  'YOUR_',
  '<',
  'example.com',
];

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function firstConfigured(
  ...names: string[]
): { name: string; value: string } | null {
  for (const name of names) {
    const raw = process.env[name];
    if (!raw) continue;
    const value = raw.trim();
    if (!value) continue;
    if (PLACEHOLDER_MARKERS.some(marker => value.includes(marker))) continue;
    return { name, value };
  }
  return null;
}

export interface ChainConfig {
  /** True when balances must come from the chain and fabrication is forbidden. */
  live: boolean;
  rpcUrl: string | null;
  contractAddress: string | null;
  chainId: number;
  /** Which env var each value came from, for startup logging. */
  source: { rpcUrl?: string; contractAddress?: string };
}

export class ChainConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChainConfigError';
  }
}

/**
 * Resolve chain configuration.
 *
 * Either both the RPC and the token address are configured (live), or neither is
 * (mock, for development). Exactly one is a misconfiguration and throws: an RPC
 * without a token address binds the contract to the zero address and returns 0
 * for every holder, and a token address without an RPC silently keeps
 * fabricating — both look like working configuration from the outside.
 */
export function resolveChainConfig(env = process.env): ChainConfig {
  const previous = process.env;
  if (env !== previous) process.env = env as NodeJS.ProcessEnv;
  try {
    const rpc = firstConfigured('ETHEREUM_RPC_URL', 'MOC_RPC_URL', 'RPC_URL');
    const contract = firstConfigured(
      'MOC_TOKEN_ADDRESS',
      'MOC_CONTRACT_ADDRESS'
    );
    const chainId = Number(process.env.CHAIN_ID || '1');

    if (rpc && !contract) {
      throw new ChainConfigError(
        `${rpc.name} is set but no token address is. Set MOC_TOKEN_ADDRESS, or unset ${rpc.name} to run on mock balances.`
      );
    }
    if (contract && !rpc) {
      throw new ChainConfigError(
        `${contract.name} is set but no RPC URL is. Set ETHEREUM_RPC_URL, or unset ${contract.name} to run on mock balances.`
      );
    }
    if (contract && contract.value.toLowerCase() === ZERO_ADDRESS) {
      throw new ChainConfigError(
        `${contract.name} is the zero address; balanceOf would revert for every holder.`
      );
    }
    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw new ChainConfigError(
        `CHAIN_ID must be a positive integer, got ${process.env.CHAIN_ID}`
      );
    }

    return {
      live: Boolean(rpc && contract),
      rpcUrl: rpc?.value ?? null,
      contractAddress: contract?.value ?? null,
      chainId,
      source: { rpcUrl: rpc?.name, contractAddress: contract?.name },
    };
  } finally {
    if (env !== previous) process.env = previous;
  }
}

/**
 * Provider options.
 *
 * staticNetwork matters more than it looks: without it ethers probes the endpoint
 * for its chain id before every fresh connection and retries that probe every
 * second, forever, when the endpoint answers with anything unexpected. A flaky
 * free RPC then wedges wallet registration instead of failing it. Measured
 * against public endpoints, skipping the probe also makes several of them usable
 * that otherwise fail outright.
 */
export function providerOptions(chainId: number) {
  return { staticNetwork: true, batchMaxCount: 1, chainId };
}
