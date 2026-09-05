'use client';

import { useEffect, useRef } from 'react';

const SYNC_CHANNEL_NAME = 'rental_system_sync_channel';

// Create a single shared BroadcastChannel instance if supported by the browser
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  } catch (e) {
    console.warn('[Sync] BroadcastChannel not available:', e);
  }
}

/**
 * Broadcast an application state update event to all open tabs and windows.
 * @param eventType e.g., 'payment', 'bill', 'electricity', 'water', 'custom_purchase', 'maintenance', 'notice'
 */
export function broadcastSync(eventType: string = 'general') {
  if (typeof window === 'undefined') return;

  // 1. Same-window custom event
  try {
    window.dispatchEvent(new CustomEvent('rental_sync_event', { detail: { type: eventType, timestamp: Date.now() } }));
  } catch {}

  // 2. Cross-tab BroadcastChannel
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: eventType, timestamp: Date.now() });
    }
  } catch {}
}

/**
 * React hook that automatically triggers a data refresh callback whenever:
 * - A sync event is broadcasted from any tab/window (payment, bill, electricity, maintenance, etc.)
 * - The browser window regains focus or becomes visible
 * - Debounces rapid triggers to prevent excessive API load.
 */
export function useAutoSync(
  onSync: () => void | Promise<void>,
  watchedTypes?: string[],
  debounceMs: number = 300
) {
  const onSyncRef = useRef(onSync);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const triggerSync = (type?: string) => {
      if (
        watchedTypes &&
        watchedTypes.length > 0 &&
        type &&
        type !== 'all' &&
        type !== 'general' &&
        type !== 'visibility' &&
        type !== 'focus'
      ) {
        if (!watchedTypes.includes(type)) return;
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        try {
          onSyncRef.current?.();
        } catch (err) {
          console.error('[AutoSync Error]:', err);
        }
      }, debounceMs);
    };

    // 1. Same-tab listener
    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      triggerSync(customEvent.detail?.type);
    };
    window.addEventListener('rental_sync_event', handleCustomEvent);
    window.addEventListener('payment_updated', () => triggerSync('payment'));

    // 2. Cross-tab listener
    let channel: BroadcastChannel | null = broadcastChannel;
    const handleBroadcastMessage = (event: MessageEvent) => {
      triggerSync(event.data?.type);
    };

    if (channel) {
      channel.addEventListener('message', handleBroadcastMessage);
    }

    // 3. Tab visibility / window focus listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerSync('visibility');
      }
    };
    const handleFocus = () => {
      triggerSync('focus');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      window.removeEventListener('rental_sync_event', handleCustomEvent);
      window.removeEventListener('payment_updated', () => triggerSync('payment'));
      if (channel) {
        channel.removeEventListener('message', handleBroadcastMessage);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [watchedTypes, debounceMs]);
}
