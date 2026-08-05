'use client';

import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

type MarkdownSize = 'compact' | 'document';

interface MarkdownContentProps {
  content: string;
  className?: string;
  /**
   * 'compact' (default) fits descriptions embedded in cards/modals;
   * 'document' is report-reading scale (large bordered headings,
   * base-size body) for full documents like disclosure reports.
   */
  size?: MarkdownSize;
}

// Theme-aware element styles (agora-* tokens adapt to light/dark via CSS
// variables). Both sizes share structure; only scale/spacing and a few
// document-only flourishes (heading rules, row hover) differ.
const buildComponents = (size: MarkdownSize) => {
  const doc = size === 'document';

  return {
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1
        className={
          doc
            ? 'text-2xl font-bold text-agora-text mt-6 mb-4 pb-2 border-b border-agora-border first:mt-0'
            : 'text-lg font-bold text-agora-text mt-4 mb-2 first:mt-0'
        }
      >
        {children}
      </h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2
        className={
          doc
            ? 'text-xl font-semibold text-agora-text mt-5 mb-3 pb-1 border-b border-agora-border/50 first:mt-0'
            : 'text-base font-semibold text-agora-text mt-4 mb-2 first:mt-0'
        }
      >
        {children}
      </h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3
        className={
          doc
            ? 'text-lg font-semibold text-agora-text mt-4 mb-2 first:mt-0'
            : 'text-sm font-semibold text-agora-text mt-3 mb-1.5 first:mt-0'
        }
      >
        {children}
      </h3>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4
        className={
          doc
            ? 'text-base font-semibold text-agora-text mt-3 mb-2 first:mt-0'
            : 'text-sm font-semibold text-agora-text mt-3 mb-1.5 first:mt-0'
        }
      >
        {children}
      </h4>
    ),
    h5: ({ children }: { children?: React.ReactNode }) => (
      <h5
        className={
          doc
            ? 'text-sm font-semibold text-agora-text mt-3 mb-2 first:mt-0'
            : 'text-sm font-semibold text-agora-text mt-3 mb-1.5 first:mt-0'
        }
      >
        {children}
      </h5>
    ),
    h6: ({ children }: { children?: React.ReactNode }) => (
      <h6
        className={
          doc
            ? 'text-sm font-semibold text-agora-muted mt-3 mb-2 first:mt-0'
            : 'text-sm font-semibold text-agora-muted mt-3 mb-1.5 first:mt-0'
        }
      >
        {children}
      </h6>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p
        className={
          doc
            ? 'text-agora-text leading-relaxed mb-3 last:mb-0 break-words'
            : 'text-sm text-agora-text leading-relaxed mb-2 last:mb-0 break-words'
        }
      >
        {children}
      </p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul
        className={
          doc
            ? 'list-disc pl-5 space-y-1 mb-3 last:mb-0 text-agora-text'
            : 'list-disc pl-5 space-y-1 mb-2 last:mb-0 text-sm text-agora-text'
        }
      >
        {children}
      </ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol
        className={
          doc
            ? 'list-decimal pl-5 space-y-1 mb-3 last:mb-0 text-agora-text'
            : 'list-decimal pl-5 space-y-1 mb-2 last:mb-0 text-sm text-agora-text'
        }
      >
        {children}
      </ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="leading-relaxed break-words">{children}</li>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold text-agora-text">{children}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote
        className={
          doc
            ? 'border-l-4 border-agora-primary pl-4 my-3 text-agora-muted italic'
            : 'border-l-4 border-agora-primary/50 pl-3 my-2 text-agora-muted italic'
        }
      >
        {children}
      </blockquote>
    ),
    code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
      const isInline = !className;
      if (isInline) {
        return (
          <code
            className={cn(
              'bg-agora-darker px-1.5 py-0.5 rounded font-mono text-agora-primary break-words',
              doc ? 'text-sm' : 'text-xs'
            )}
          >
            {children}
          </code>
        );
      }
      return (
        <code className={cn(className, 'block font-mono', doc ? 'text-sm' : 'text-xs')}>
          {children}
        </code>
      );
    },
    pre: ({ children }: { children?: React.ReactNode }) => (
      <pre
        className={
          doc
            ? 'bg-agora-darker border border-agora-border rounded-lg p-4 overflow-x-auto my-3 text-sm'
            : 'bg-agora-darker border border-agora-border rounded-lg p-3 overflow-x-auto my-2 text-xs'
        }
      >
        {children}
      </pre>
    ),
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className={doc ? 'overflow-x-auto my-4' : 'overflow-x-auto my-2'}>
        <table className="w-full border-collapse border border-agora-border rounded-lg text-sm">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: { children?: React.ReactNode }) => (
      <thead className="bg-agora-darker">{children}</thead>
    ),
    tbody: ({ children }: { children?: React.ReactNode }) => (
      <tbody className="divide-y divide-agora-border">{children}</tbody>
    ),
    tr: ({ children }: { children?: React.ReactNode }) => (
      <tr className={doc ? 'hover:bg-agora-darker/50 transition-colors' : undefined}>
        {children}
      </tr>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th
        className={
          doc
            ? 'px-4 py-2 text-left text-sm font-semibold text-agora-text border-b border-agora-border'
            : 'px-3 py-1.5 text-left text-xs font-semibold text-agora-text border-b border-agora-border'
        }
      >
        {children}
      </th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td
        className={
          doc
            ? 'px-4 py-2 text-sm text-agora-text border-b border-agora-border/50'
            : 'px-3 py-1.5 text-xs text-agora-text border-b border-agora-border/50'
        }
      >
        {children}
      </td>
    ),
    hr: () => <hr className={doc ? 'my-6 border-agora-border' : 'my-3 border-agora-border'} />,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-agora-primary hover:text-agora-primary/80 underline break-all"
      >
        {children}
      </a>
    ),
  };
};

const componentsBySize: Record<MarkdownSize, ReturnType<typeof buildComponents>> = {
  compact: buildComponents('compact'),
  document: buildComponents('document'),
};

/**
 * Render markdown text (issue descriptions, agent output, disclosure
 * reports, etc.) with theme-aware styling. GFM extensions (tables,
 * strikethrough, task lists) are enabled, and single newlines become
 * hard breaks (GitHub-comment style) so line-per-item metadata and
 * legacy plain-text descriptions keep their line structure.
 */
export function MarkdownContent({ content, className, size = 'compact' }: MarkdownContentProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={componentsBySize[size]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
