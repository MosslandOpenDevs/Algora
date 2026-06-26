// Decode HTML entities in plain-text strings (e.g. signal descriptions
// pulled from RSS/social sources, which arrive with `&quot;`, `&amp;`, etc.).
// React renders text literally, so these must be decoded before display.

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

export function decodeHtmlEntities(input: string | undefined | null): string {
  if (!input || input.indexOf('&') === -1) return input ?? '';
  return input.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (match, body: string) => {
      if (body[0] === '#') {
        const isHex = body[1] === 'x' || body[1] === 'X';
        const code = isHex
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return NAMED_ENTITIES[body] ?? match;
    },
  );
}
