'use client';

import { useEffect } from 'react';

/**
 * UI Protection Component
 * Disables right-click context menu and Developer Tools keyboard shortcuts (F12, Ctrl+Shift+I, etc.).
 * 
 * NOTE: Client-side UI protection deters casual inspection. Comprehensive security is enforced
 * on the backend via JWT validation, role-based access control, and tenant data isolation.
 */
export function UiProtection() {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // F12 key
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Intercept Developer Tools shortcuts:
      // Ctrl+Shift+I / Cmd+Option+I (Inspect element / DevTools)
      // Ctrl+Shift+J / Cmd+Option+J (Console)
      // Ctrl+Shift+C / Cmd+Option+C (Inspect Element selection tool)
      // Ctrl+Shift+K (Firefox console)
      // Ctrl+U / Cmd+Option+U (View Page Source)
      const isControlOrMeta = e.ctrlKey || e.metaKey;
      const keyUpper = e.key.toUpperCase();

      if (
        (isControlOrMeta && e.shiftKey && ['I', 'J', 'C', 'K'].includes(keyUpper)) ||
        (isControlOrMeta && keyUpper === 'U') ||
        (e.metaKey && e.altKey && ['I', 'J', 'C'].includes(keyUpper))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return null;
}
