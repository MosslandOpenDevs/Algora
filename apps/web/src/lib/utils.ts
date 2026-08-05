import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS conflict resolution
 *
 * Usage:
 * ```tsx
 * <div className={cn('p-4 bg-red-500', isActive && 'bg-blue-500', className)} />
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with compact notation
 *
 * Usage:
 * ```tsx
 * formatCompact(1234) // "1.2K"
 * formatCompact(1234567) // "1.2M"
 * ```
 */
export function formatCompact(num: number): string {
  const formatter = Intl.NumberFormat('en', { notation: 'compact' });
  return formatter.format(num);
}

/**
 * Format a date relative to now
 *
 * Usage:
 * ```tsx
 * formatRelativeTime(new Date(Date.now() - 60000)) // "1 minute ago"
 * ```
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return past.toLocaleDateString();
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Truncate an address (e.g., wallet address)
 */
export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Strip markdown syntax from text for plain-text previews
 * (e.g., line-clamped card descriptions). Shared with the API via
 * @algora/core so search-result snippets strip identically.
 */
export { stripMarkdown } from '@algora/core';

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Generate a random ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Check if a date is valid
 */
export function isValidDate(date: Date | string | number | null | undefined): boolean {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  return !isNaN(d.getTime());
}

/**
 * Safely format a date with a fallback
 * Returns the fallback if the date is invalid
 */
export function safeFormatDate(
  date: Date | string | number | null | undefined,
  formatFn: (date: Date) => string,
  fallback: string = '--'
): string {
  if (!isValidDate(date)) return fallback;
  try {
    const d = date instanceof Date ? date : new Date(date as string | number);
    return formatFn(d);
  } catch {
    return fallback;
  }
}
