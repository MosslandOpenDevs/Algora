/**
 * Field clamping for document creation.
 *
 * `DocumentManager.create()` validates title and summary against the
 * registry's configured bounds and throws `DocumentValidationError` when a
 * field falls outside them. Most callers build these fields from
 * LLM-generated text (a decision packet's recommendation, an issue title),
 * which is unbounded in both directions — so the validation fires in normal
 * operation rather than on genuine misuse.
 *
 * That is exactly what happened in production on 2026-08-05: a decision
 * packet whose recommendation ran past 500 characters made document creation
 * throw, and because the throw propagated out of the surrounding governance
 * integration, the *proposal* that should have followed was never created.
 * A cosmetic document silently killed the deliberation → proposal path.
 *
 * These helpers live in the registry package because it owns the limits.
 * Callers clamp with them instead of hand-rolling `.substring(0, 500)`,
 * which silently ignores the *minimum* lengths (`minSummaryLength` is 50 —
 * a short summary fails validation just as a long one does).
 */

import { DEFAULT_DOCUMENT_REGISTRY_CONFIG } from './types.js';
import type { DocumentRegistryConfig } from './types.js';

const ELLIPSIS = '…';

type Bounds = Pick<
  DocumentRegistryConfig,
  'minTitleLength' | 'maxTitleLength' | 'minSummaryLength' | 'maxSummaryLength'
>;

function bounds(config?: Partial<DocumentRegistryConfig>): Bounds {
  return { ...DEFAULT_DOCUMENT_REGISTRY_CONFIG, ...config };
}

/** Collapse newlines/runs of whitespace so length checks match what is stored. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Truncate to `max` characters, preferring the last word boundary so the
 * result reads as a sentence rather than a cut-off token. The ellipsis is
 * included in the budget, so the result is never longer than `max`.
 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  // slice() indexes UTF-16 code units, so a cut can land inside a surrogate
  // pair (emoji, CJK ext-B) and leave an orphaned half that renders as U+FFFD.
  let hard = text.slice(0, Math.max(0, max - ELLIPSIS.length));
  if (/[\uD800-\uDBFF]$/.test(hard)) hard = hard.slice(0, -1);
  const lastSpace = hard.lastIndexOf(' ');
  // Only honour the word boundary if it keeps most of the budget; otherwise a
  // single long token (or space-less CJK) would collapse the field to almost
  // nothing.
  const body = lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard;
  return body.trimEnd() + ELLIPSIS;
}

/**
 * Clamp a document title into the registry's configured length bounds.
 *
 * `padding` is appended (before truncation) when the title is too short —
 * pass something descriptive such as the document type or subject id. If the
 * result is still under the minimum it is padded with dots, since failing
 * validation is strictly worse than an unlovely title.
 */
export function clampTitle(
  title: string,
  padding = '',
  config?: Partial<DocumentRegistryConfig>
): string {
  const { minTitleLength, maxTitleLength } = bounds(config);
  let out = normalize(title);
  if (out.length < minTitleLength && padding) {
    out = normalize(`${out} ${padding}`);
  }
  out = truncate(out, maxTitleLength);
  if (out.length < minTitleLength) {
    out = out.padEnd(minTitleLength, '.');
  }
  return out;
}

/**
 * Clamp a document summary into the registry's configured length bounds.
 *
 * `context` is used when `summary` is empty, and appended when it is too
 * short to satisfy `minSummaryLength` — pass a sentence describing the
 * document (type, subject, provenance) rather than filler.
 */
export function clampSummary(
  summary: string | null | undefined,
  context = '',
  config?: Partial<DocumentRegistryConfig>
): string {
  const { minSummaryLength, maxSummaryLength } = bounds(config);
  let out = normalize(summary || '') || normalize(context);
  if (out.length < minSummaryLength && context) {
    const extra = normalize(context);
    if (!out.includes(extra)) out = normalize(`${out} ${extra}`);
  }
  out = truncate(out, maxSummaryLength);
  if (out.length < minSummaryLength) {
    out = out.padEnd(minSummaryLength, '.');
  }
  return out;
}
