import { describe, it, expect } from 'vitest';
import {
  IssueDetectionService,
  type DetectionPattern,
  type PatternCondition,
  type Signal,
} from './issue-detection';
import { GitHubCollectorService, isBotActor } from './collectors/github';

// matchPattern/evaluateCondition are private but self-contained, so exercise
// them through the prototype without constructing the service (the real
// constructor wires up Agora and the global LLM queue).
const proto = IssueDetectionService.prototype as any;
const host = { evaluateCondition: proto.evaluateCondition };

function evaluate(condition: PatternCondition, signal: Signal): boolean {
  return proto.evaluateCondition.call(host, condition, signal);
}

function match(pattern: DetectionPattern, signals: Signal[]): Signal[] {
  return proto.matchPattern.call(host, pattern, signals);
}

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig-1',
    original_id: 'github:event:1',
    source: 'github:ethereum/EIPs',
    timestamp: new Date().toISOString(),
    category: 'protocol',
    severity: 'low',
    value: 1,
    unit: 'event',
    description: 'eth-bot performed IssueCommentEvent',
    metadata: null,
    ...overrides,
  };
}

const governancePattern = IssueDetectionService.PATTERNS.find(
  p => p.id === 'governance-proposal'
)!;
const fearPattern = IssueDetectionService.PATTERNS.find(p => p.id === 'fear-extreme')!;

describe('evaluateCondition — keyword', () => {
  const keyword: PatternCondition = {
    type: 'keyword',
    operator: 'contains',
    value: 'proposal|vote|governance|EIP',
  };

  it('matches keywords in the signal description (case-insensitive)', () => {
    expect(evaluate(keyword, makeSignal({ description: 'New PROPOSAL: fee switch' }))).toBe(true);
    expect(evaluate(keyword, makeSignal({ description: 'Community vote opened' }))).toBe(true);
  });

  it('does NOT match keywords appearing only in the source name', () => {
    // Regression: the haystack used to be `description + source`, so
    // github:ethereum/EIPs satisfied 'EIP' on every event it emitted.
    const signal = makeSignal({
      source: 'github:ethereum/EIPs',
      description: 'eth-bot performed IssueCommentEvent',
    });
    expect(evaluate(keyword, signal)).toBe(false);

    // Same exposure for keyword-named social sources seen on prod.
    const social = makeSignal({
      source: 'social:reddit:Uniswap Governance',
      description: 'What are your favorite pizza toppings?',
    });
    expect(evaluate(keyword, social)).toBe(false);
  });
});

describe('evaluateCondition — source', () => {
  it("matches the source string via the dedicated 'source' condition type", () => {
    const condition: PatternCondition = {
      type: 'source',
      operator: 'contains',
      value: 'Fear & Greed',
    };
    expect(evaluate(condition, makeSignal({ source: 'market:Fear & Greed Index' }))).toBe(true);
    expect(evaluate(condition, makeSignal({ source: 'github:ethereum/EIPs' }))).toBe(false);
  });
});

describe('governance-proposal pattern', () => {
  it('no longer matches EIPs bot housekeeping events on source name alone', () => {
    const botComment = makeSignal({
      source: 'github:ethereum/EIPs',
      category: 'protocol',
      description: 'eth-bot performed IssueCommentEvent',
    });
    const botAction = makeSignal({
      id: 'sig-2',
      description: 'github-actions[bot] performed IssueCommentEvent',
    });
    expect(match(governancePattern, [botComment, botAction])).toEqual([]);
  });

  it('still matches signals whose content is actually about governance', () => {
    const eipIssue = makeSignal({
      description: '[Issue] Add EIP-7999: calldata gas repricing',
      category: 'protocol',
    });
    const daoVote = makeSignal({
      id: 'sig-2',
      source: 'github:MakerDAO/community',
      category: 'governance',
      description: 'Governance vote opened on stability fee adjustment',
    });
    expect(match(governancePattern, [eipIssue, daoVote])).toHaveLength(2);
  });

  it('ignores keyword-bearing content outside governance/protocol categories', () => {
    const offCategory = makeSignal({
      category: 'ai',
      description: 'Proposal for a new fine-tuning benchmark',
    });
    expect(match(governancePattern, [offCategory])).toEqual([]);
  });

  it('filters a mixed batch down to the true positives', () => {
    const noise = makeSignal({ description: 'eth-bot performed IssueCommentEvent' });
    const real = makeSignal({
      id: 'sig-2',
      description: '[PR] Update EIP-4844: clarify blob gas accounting',
    });
    expect(match(governancePattern, [noise, real])).toEqual([real]);
  });
});

describe('fear-extreme pattern', () => {
  it('still combines a source condition with a description keyword', () => {
    const extreme = makeSignal({
      source: 'market:Fear & Greed Index',
      category: 'market',
      description: 'Fear & Greed Index: 12 (Extreme Fear)',
    });
    const neutral = makeSignal({
      id: 'sig-2',
      source: 'market:Fear & Greed Index',
      category: 'market',
      description: 'Fear & Greed Index: 55 (Neutral)',
    });
    expect(match(fearPattern, [extreme, neutral])).toEqual([extreme]);
  });
});

describe('GitHub collector bot handling', () => {
  const ghProto = GitHubCollectorService.prototype as any;
  const formatEvent = (event: any) => ghProto.formatEvent.call(undefined, event);

  it('recognizes bot actors by [bot] suffix and known machine accounts', () => {
    expect(isBotActor('github-actions[bot]')).toBe(true);
    expect(isBotActor('dependabot[bot]')).toBe(true);
    expect(isBotActor('eth-bot')).toBe(true);
    expect(isBotActor('vbuterin')).toBe(false);
    expect(isBotActor('SamWilsn')).toBe(false);
  });

  it('floors bot event severity to low', () => {
    const release = (login: string) => ({
      id: '1',
      type: 'ReleaseEvent',
      actor: { login },
      repo: { name: 'ethereum/EIPs' },
      payload: { release: { name: 'v1.2.3' } },
      created_at: new Date().toISOString(),
    });
    expect(formatEvent(release('human-maintainer')).severity).toBe('high');
    expect(formatEvent(release('github-actions[bot]')).severity).toBe('low');

    const push = {
      id: '2',
      type: 'PushEvent',
      actor: { login: 'eth-bot' },
      repo: { name: 'ethereum/EIPs' },
      payload: { ref: 'refs/heads/master', commits: new Array(10).fill({}) },
      created_at: new Date().toISOString(),
    };
    expect(formatEvent(push).severity).toBe('low');
  });
});
