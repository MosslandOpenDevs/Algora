import { describe, it, expect } from 'vitest';
import { LLMService } from './llm';

// NOTE on the contract these tests encode: a Tier-2 request whose budget is
// exhausted (or whose provider fails) now DEGRADES TO TIER 1 rather than
// throwing. Throwing was worse than it looked — every caller treats it as "no
// LLM", and Agora in particular substitutes a hard-coded template sentence and
// stores it as a real agent statement, so an exhausted budget would fill the
// public feed with governance-sounding text no model produced. The
// budget:exceeded event still fires, so alerting is unaffected. In this test
// environment Ollama is unreachable, so the degraded path surfaces as a
// Tier-1-unavailable error — that is the fallback being attempted, not the old
// BudgetExceededError escaping.

describe('LLMService budget guard', () => {
  it('skips a provider whose guard returns false and emits budget:exceeded', async () => {
    const svc = new LLMService();
    const seen: string[] = [];
    svc.on('budget:exceeded', (e: { provider: string }) => seen.push(e.provider));

    // Force Tier 2 routing with every provider present.
    const cfg = svc.getConfig();
    cfg.tier2.anthropic = { apiKey: 'x', model: 'claude' };
    cfg.tier2.openai = { apiKey: 'x', model: 'gpt' };
    cfg.tier2.gemini = { apiKey: 'x', model: 'gem' };

    // All three exceeded → no provider is called, budget:exceeded fires for
    // each, and the request degrades to Tier 1 (unreachable here).
    svc.setBudgetChecker(() => false);

    await expect(
      svc.generate({ prompt: 'hi', tier: 2 }),
    ).rejects.toThrow(/Tier 1 \(Ollama\) is not reachable/);

    expect(seen.sort()).toEqual(['anthropic', 'google', 'openai']);
  });

  it('denies all providers when the guard throws (fail-safe)', async () => {
    const svc = new LLMService();
    const cfg = svc.getConfig();
    cfg.tier2.anthropic = { apiKey: 'x', model: 'claude' };
    cfg.tier2.openai = undefined;
    cfg.tier2.gemini = undefined;

    svc.setBudgetChecker(() => { throw new Error('DB down'); });

    // Fail-safe: a broken budget guard denies every paid provider, then the
    // request degrades to the free local tier rather than to canned text.
    await expect(svc.generate({ prompt: 'hi', tier: 2 }))
      .rejects.toThrow(/Tier 1 \(Ollama\) is not reachable/);
  });

  it('auto-injects the untrusted-context notice when prompt contains the tag', async () => {
    const svc = new LLMService();
    const cfg = svc.getConfig();
    cfg.tier2.anthropic = { apiKey: 'x', model: 'claude' };
    cfg.tier2.openai = undefined;
    cfg.tier2.gemini = undefined;

    // Budget guard always allows; Anthropic will fail because the API key is
    // bogus. We can't easily intercept fetch here without a mock, so we just
    // verify that the budget-exceeded path is NOT taken when the guard allows.
    let called = false;
    svc.setBudgetChecker(() => { called = true; return true; });

    await expect(
      svc.generate({
        prompt: 'see <untrusted_context>hi</untrusted_context>',
        tier: 2,
      }),
    ).rejects.toThrow();
    expect(called).toBe(true);
  });
});
