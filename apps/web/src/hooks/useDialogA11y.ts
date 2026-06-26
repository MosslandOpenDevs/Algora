'use client';

import { useEffect, useId, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface UseDialogA11yOptions {
  /** Whether the dialog is currently open. Defaults to true for modals that are
   *  mounted only while open. Pass the real flag for modals that stay mounted. */
  isOpen?: boolean;
  /** Close handler — wire this to the SAME handler the modal's close/X button
   *  uses (e.g. a guarded handleClose), so Escape respects close guards. */
  onClose: () => void;
  /** Set false to disable Escape-to-close (e.g. a blocking step). Default true. */
  closeOnEscape?: boolean;
}

/**
 * Accessible-dialog behavior for portal modals: focus trap, focus restore,
 * Escape-to-close, and body scroll lock. Spread `dialogProps` onto the modal
 * PANEL element and `titleProps` onto its visible title so the dialog has an
 * accessible name (aria-labelledby).
 *
 * Usage:
 *   const { dialogProps, titleProps } = useDialogA11y({ onClose });
 *   ...
 *   <div {...dialogProps} className="...panel...">
 *     <h2 {...titleProps}>Title</h2>
 */
export function useDialogA11y({
  isOpen = true,
  onClose,
  closeOnEscape = true,
}: UseDialogA11yOptions) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Keep the latest onClose without re-running the effect on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const getFocusable = (): HTMLElement[] => {
      if (!panel) return [];
      return Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.getClientRects().length > 0);
    };

    // Move focus into the dialog (first focusable, else the panel itself).
    const focusables = getFocusable();
    (focusables[0] ?? panel)?.focus?.();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const f = getFocusable();
      if (f.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      // Restore focus to whatever opened the dialog.
      previouslyFocused?.focus?.();
    };
  }, [isOpen, closeOnEscape]);

  return {
    /** Attach to the modal panel element (role=dialog). */
    dialogProps: {
      ref: panelRef,
      role: 'dialog' as const,
      'aria-modal': true,
      'aria-labelledby': titleId,
      tabIndex: -1,
    },
    /** Spread onto the visible title element so the dialog has an accessible name. */
    titleProps: { id: titleId },
    titleId,
  };
}
