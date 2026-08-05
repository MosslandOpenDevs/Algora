import { describe, it, expect } from 'vitest';
import { clampTitle, clampSummary } from '../format';
import { DocumentManager } from '../document';
import { DEFAULT_DOCUMENT_REGISTRY_CONFIG } from '../types';

const { minTitleLength, maxTitleLength, minSummaryLength, maxSummaryLength } =
  DEFAULT_DOCUMENT_REGISTRY_CONFIG;

// The point of these helpers is that create() stops rejecting fields built
// from LLM output, so the strongest assertion is that a clamped field
// actually survives the real validator.
const documents = new DocumentManager({ config: DEFAULT_DOCUMENT_REGISTRY_CONFIG });

async function createsOk(title: string, summary: string): Promise<boolean> {
  try {
    await documents.create({ type: 'DP', title, summary, content: '{}', createdBy: 'test' });
    return true;
  } catch {
    return false;
  }
}

describe('clampSummary', () => {
  it('truncates an over-long LLM recommendation to within the limit', async () => {
    // The production failure: a recommendation past 500 characters made
    // document creation throw, which aborted the whole governance
    // integration and lost the proposal that should have followed.
    const recommendation = 'Based on strong consensus, recommend proceeding with the described mitigation. '.repeat(20);
    expect(recommendation.length).toBeGreaterThan(maxSummaryLength);

    const out = clampSummary(recommendation, 'fallback context sentence for this decision packet document.');
    expect(out.length).toBeLessThanOrEqual(maxSummaryLength);
    expect(await createsOk(clampTitle('Decision Packet: test session'), out)).toBe(true);
  });

  it('raises a too-short summary above the minimum using the context', async () => {
    // 'Detected issue in category ai with low priority' is 46 chars — under
    // minSummaryLength, so it failed validation just as a long one did.
    const short = 'Detected issue in category ai with low priority';
    expect(short.length).toBeLessThan(minSummaryLength);

    const out = clampSummary(short, 'Auto-detected by the anomaly pattern from collected signals (issue abc12345).');
    expect(out.length).toBeGreaterThanOrEqual(minSummaryLength);
    expect(out).toContain('Detected issue in category ai');
    expect(await createsOk(clampTitle('Issue Report: something'), out)).toBe(true);
  });

  it('falls back to context when the summary is empty or missing', () => {
    const context = 'Decision packet for Agora session abc12345 on "Some deliberation topic".';
    expect(clampSummary('', context)).toContain('Decision packet for Agora session');
    expect(clampSummary(null, context)).toContain('Decision packet for Agora session');
    expect(clampSummary(undefined, context).length).toBeGreaterThanOrEqual(minSummaryLength);
  });

  it('pads to the minimum even with no usable context', () => {
    const out = clampSummary('too short', '');
    expect(out.length).toBeGreaterThanOrEqual(minSummaryLength);
    expect(out.startsWith('too short')).toBe(true);
  });

  it('collapses newlines so the stored length matches what was measured', () => {
    const out = clampSummary(`line one\n\n   line two\ttabbed`, 'context sentence that is long enough to satisfy the minimum length.');
    expect(out).not.toMatch(/[\n\t]/);
    expect(out).toContain('line one line two tabbed');
  });

  it('prefers a word boundary but never returns more than the limit', () => {
    const wordy = 'alpha beta gamma delta epsilon '.repeat(40);
    const out = clampSummary(wordy);
    expect(out.length).toBeLessThanOrEqual(maxSummaryLength);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/); // no dangling space before the ellipsis
  });

  it('still respects the limit when the text is one unbroken token', () => {
    const out = clampSummary('x'.repeat(2000));
    expect(out.length).toBeLessThanOrEqual(maxSummaryLength);
    expect(out.length).toBeGreaterThanOrEqual(minSummaryLength);
  });
});

describe('clampTitle', () => {
  it('truncates a long generated title into the limit', async () => {
    const title = `Decision Packet: ${'[Auto] [Security Breach Alert] a very long incident headline '.repeat(6)}`;
    expect(title.length).toBeGreaterThan(maxTitleLength);

    const out = clampTitle(title, 'abc12345');
    expect(out.length).toBeLessThanOrEqual(maxTitleLength);
    expect(out.startsWith('Decision Packet:')).toBe(true);
    expect(await createsOk(out, clampSummary('', 'A sufficiently long summary sentence for this document record.'))).toBe(true);
  });

  it('pads a too-short title with the supplied context', () => {
    const out = clampTitle('Short', 'session abc12345');
    expect(out.length).toBeGreaterThanOrEqual(minTitleLength);
    expect(out).toContain('Short');
  });

  it('pads to the minimum even without context', () => {
    const out = clampTitle('Tiny', '');
    expect(out.length).toBeGreaterThanOrEqual(minTitleLength);
  });

  it('leaves an already-valid title untouched', () => {
    const good = 'Decision Packet: Treasury allocation review';
    expect(clampTitle(good, 'abc12345')).toBe(good);
  });
});

describe('surrogate pairs and config-bound clamping', () => {
  it('never leaves a split surrogate pair at the truncation point', () => {
    // A cut landing inside an emoji used to emit a lone high surrogate, which
    // renders as U+FFFD once the document is written out as UTF-8.
    for (let pad = 190; pad <= 205; pad++) {
      const out = clampTitle('a'.repeat(pad) + '\u{1F6A8}' + 'bbbb');
      expect(out.length).toBeLessThanOrEqual(maxTitleLength);
      expect((out as unknown as { isWellFormed?: () => boolean }).isWellFormed?.() ?? true).toBe(true);
      expect(out).not.toMatch(/[\uD800-\uDBFF]$/);
    }
    const summary = clampSummary('\u{1F600}'.repeat(400));
    expect(summary.length).toBeLessThanOrEqual(maxSummaryLength);
    expect((summary as unknown as { isWellFormed?: () => boolean }).isWellFormed?.() ?? true).toBe(true);
  });

  it('clamps Hangul text (no ASCII spaces to fall back on) within bounds', () => {
    const korean = '거버넌스숙의결과요약'.repeat(80);
    const out = clampSummary(korean, '한국어 요약 문맥 문장입니다.');
    expect(out.length).toBeLessThanOrEqual(maxSummaryLength);
    expect(out.length).toBeGreaterThanOrEqual(minSummaryLength);
  });

  it('clamps against the MANAGER\'s config, not the defaults', async () => {
    // The free functions assume default bounds; the bound methods read the
    // config the validator actually uses, so a non-default registry cannot
    // drift back into DocumentValidationError.
    const strict = new DocumentManager({
      config: { ...DEFAULT_DOCUMENT_REGISTRY_CONFIG, maxSummaryLength: 300, maxTitleLength: 120 },
    });
    const longSummary = 'word '.repeat(200);
    const longTitle = 'Decision Packet: ' + 'x'.repeat(300);

    expect(clampSummary(longSummary).length).toBeGreaterThan(300); // free fn: default bounds
    expect(strict.clampSummary(longSummary).length).toBeLessThanOrEqual(300);
    expect(strict.clampTitle(longTitle).length).toBeLessThanOrEqual(120);

    const doc = await strict.create({
      type: 'DP',
      title: strict.clampTitle(longTitle),
      summary: strict.clampSummary(longSummary),
      content: '{}',
      createdBy: 'test',
    });
    expect(doc.id).toMatch(/^DOC-DP-/);
  });
});
