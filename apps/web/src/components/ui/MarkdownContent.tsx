'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

// Compact, theme-aware element styles sized for descriptions embedded in
// cards/modals (agora-* tokens adapt to light/dark via CSS variables)
const components = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-lg font-bold text-agora-text mt-4 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-semibold text-agora-text mt-4 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-semibold text-agora-text mt-3 mb-1.5 first:mt-0">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-sm font-semibold text-agora-text mt-3 mb-1.5 first:mt-0">{children}</h4>
  ),
  h5: ({ children }: { children?: React.ReactNode }) => (
    <h5 className="text-sm font-semibold text-agora-text mt-3 mb-1.5 first:mt-0">{children}</h5>
  ),
  h6: ({ children }: { children?: React.ReactNode }) => (
    <h6 className="text-sm font-semibold text-agora-muted mt-3 mb-1.5 first:mt-0">{children}</h6>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm text-agora-text leading-relaxed mb-2 last:mb-0 break-words">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-5 space-y-1 mb-2 last:mb-0 text-sm text-agora-text">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-5 space-y-1 mb-2 last:mb-0 text-sm text-agora-text">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed break-words">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-agora-text">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-4 border-agora-primary/50 pl-3 my-2 text-agora-muted italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-agora-darker px-1.5 py-0.5 rounded text-xs font-mono text-agora-primary break-words">
          {children}
        </code>
      );
    }
    return <code className={`${className} block text-xs font-mono`}>{children}</code>;
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-agora-darker border border-agora-border rounded-lg p-3 overflow-x-auto my-2 text-xs">
      {children}
    </pre>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2">
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
  tr: ({ children }: { children?: React.ReactNode }) => <tr>{children}</tr>,
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-1.5 text-left text-xs font-semibold text-agora-text border-b border-agora-border">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-1.5 text-xs text-agora-text border-b border-agora-border/50">
      {children}
    </td>
  ),
  hr: () => <hr className="my-3 border-agora-border" />,
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

/**
 * Render markdown text (issue descriptions, agent output, etc.) with
 * theme-aware styling. GFM extensions (tables, strikethrough, task
 * lists) are enabled.
 */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
