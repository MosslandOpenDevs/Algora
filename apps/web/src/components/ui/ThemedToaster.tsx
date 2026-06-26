'use client';

import { Toaster } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * Sonner toaster wired to the app's theme so toasts match light/dark mode.
 * Mounted once inside ThemeProvider; emit toasts anywhere via `toast()` from 'sonner'.
 */
export function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{ duration: 4000 }}
    />
  );
}
