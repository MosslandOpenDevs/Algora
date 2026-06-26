'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyableHashProps {
  hash: string;
  truncateLength?: number;
  showCopyButton?: boolean;
  className?: string;
}

export function CopyableHash({
  hash,
  truncateLength = 8,
  showCopyButton = true,
  className = '',
}: CopyableHashProps) {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const truncatedHash = hash.length > truncateLength + 3
    ? `${hash.slice(0, truncateLength)}...`
    : hash;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span
        className="relative font-mono text-xs cursor-help"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {truncatedHash}

        {/* Tooltip */}
        {showTooltip && (
          <span className="absolute z-50 left-0 -top-10 px-2 py-1.5 rounded bg-slate-900 text-white text-xs font-mono whitespace-nowrap shadow-lg border border-agora-border">
            {hash}
            <span className="absolute left-4 -bottom-1 w-2 h-2 bg-slate-900 border-r border-b border-agora-border transform rotate-45" />
          </span>
        )}
      </span>

      {showCopyButton && (
        <button
          onClick={handleCopy}
          className="p-0.5 rounded hover:bg-agora-border transition-colors"
          title="Copy full hash"
        >
          {copied ? (
            <Check className="h-3 w-3 text-agora-success" />
          ) : (
            <Copy className="h-3 w-3 text-agora-muted hover:text-agora-text" />
          )}
        </button>
      )}
    </span>
  );
}
