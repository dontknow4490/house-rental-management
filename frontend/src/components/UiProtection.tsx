'use client';

import { useEffect } from 'react';

/**
 * Basic UI Protection Component
 * Disables the default browser right-click context menu across the application UI.
 * 
 * NOTE: This is purely a UI presentation deterrent. True security is enforced
 * on the backend through JWT validation, role-based access control, and strict tenant data isolation.
 */
export function UiProtection() {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Prevent default browser context menu on right click
      e.preventDefault();
    };

    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  return null;
}
