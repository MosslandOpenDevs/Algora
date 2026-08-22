/**
 * `generateRoundSummary` costs an LLM call, so every call must use the result.
 *
 * It is a pure function: it reads the round's messages, asks the model for a
 * summary, parses it, and returns it. No storage, no event, not even a log line
 * on success. Three round-advance paths nonetheless called it and discarded
 * what came back — one assigned to an unread `_summary`, two as a bare `await`.
 *
 * That is not a rounding error. On 2026-08-22 production advanced 73 rounds,
 * every one via `consensus_reached`, and **not one** went through a timeout
 * path — the only paths that consume a summary. So all 73 calls that day
 * produced nothing, each asking a shared Ollama host for up to 600 tokens.
 *
 * The failures were visible and still told nobody anything: two
 * `[Orchestrator] Summary generation failed: SyntaxError` in the same day,
 * reporting that output nobody wanted could not be parsed.
 *
 * A source-level guard rather than a behavioural one, because the defect is
 * the *shape* of the call. Mocking a round advance would prove a summary was
 * not requested on that path today; this states the rule that made it wrong.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const AGORA_SOURCE = join(__dirname, 'agora.ts');

/** Every line invoking generateRoundSummary, excluding its own declaration. */
function callSites(): { line: number; text: string }[] {
  return readFileSync(AGORA_SOURCE, 'utf-8')
    .split('\n')
    .map((text, i) => ({ line: i + 1, text: text.trim() }))
    .filter(
      ({ text }) =>
        text.includes('generateRoundSummary(') &&
        !text.startsWith('*') &&
        !text.startsWith('//') &&
        !/\basync\s+generateRoundSummary\s*\(/.test(text),
    );
}

describe('generateRoundSummary call sites', () => {
  it('still finds call sites to check', () => {
    // If the method were renamed, an empty list would pass the rule below
    // while checking nothing.
    expect(callSites().length).toBeGreaterThan(0);
  });

  it('binds the result at every call', () => {
    const discarding = callSites().filter(({ text }) => !/^(const|let|return)\b/.test(text));

    expect(
      discarding.map(({ line, text }) => `agora.ts:${line}: ${text}`),
      'generateRoundSummary costs an LLM call — use the result or do not make it',
    ).toEqual([]);
  });
});
