'use client';

import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { formatCurrencyNPR } from '@/lib/nepali-date';
import { broadcastSync } from '@/lib/sync';

export function NotificationBell({ role }: { role: 'ADMIN' | 'TENANT' }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [open, setOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [rejectionModal, setRejectionModal] = useState<any | null>(null);

  const previousUnreadRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Play subtle notification chime via Web Audio API
  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Audio playback blocked by browser policy
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications?limit=30');
      if (res) {
        const newUnread = res.unreadCount ?? 0;
        setNotifications(res.notifications || []);
        setUnreadCount(newUnread);

        // If new unread notification arrived after initial load, play sound and broadcast update
        if (!isInitialLoadRef.current && newUnread > previousUnreadRef.current) {
          playChime();
          broadcastSync('all');
        }

        previousUnreadRef.current = newUnread;
        isInitialLoadRef.current = false;
      }
    } catch {
      // Ignore background fetch errors
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Poll every 8 seconds
    const interval = setInterval(fetchNotifications, 8000);

    const onFocus = () => fetchNotifications();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handleMarkAllRead = async () => {
    try {
      setLoading(true);
      await api.put('/notifications/read-all', {});
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setLoading(true);
      await api.delete('/notifications/clear-all');
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (e: React.MouseEvent, notifId: string, isRead: boolean) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${notifId}`);
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      if (!isRead) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleItemClick = async (notif: any) => {
    if (!notif.isRead) {
      try {
        await api.put(`/notifications/${notif.id}/read`, {});
        setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)),
        );
      } catch (err) {
        console.error(err);
      }
    }

    setOpen(false);

    // If this is a payment rejection notification for a tenant, open the rejection details modal
    if (role === 'TENANT' && (notif.type === 'PAYMENT_REJECTED' || notif.data?.rejectionReason)) {
      setRejectionModal({
        title: notif.title || 'Payment Rejected',
        message: notif.message,
        amount: notif.data?.amount ?? null,
        rejectionReason: notif.data?.rejectionReason || 'Payment proof could not be verified.',
        billingPeriod: notif.data?.billingPeriod || 'Current Billing Period',
        remainingDue: notif.data?.remainingDue ?? null,
        paymentMethod: notif.data?.paymentMethod || 'Online / eSewa',
        transactionId: notif.data?.transactionId || '—',
        submittedAt: notif.createdAt,
      });
      return;
    }

    if (notif.link) {
      router.push(notif.link);
    }
  };

  return (
    <>
      <div className="relative inline-block" ref={dropdownRef}>
        {/* Bell Button */}
        <button
          onClick={() => setOpen(!open)}
          className="relative p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition flex items-center gap-1.5 focus:outline-none"
          aria-label="Notifications"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>

          {unreadCount > 0 ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </button>

        {/* Dropdown Panel */}
        {open && (
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            {/* Header */}
            <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">Notifications</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
                    {unreadCount} new
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    disabled={loading}
                    className="font-medium text-slate-600 hover:text-slate-900 hover:underline disabled:opacity-50"
                  >
                    Mark all read
                  </button>
                )}

                {notifications.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    disabled={loading}
                    className="font-medium text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <svg className="w-8 h-8 mx-auto text-slate-300 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <p className="text-xs text-slate-500 font-medium">No notifications</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Updates will appear here as they occur.</p>
                </div>
              ) : (
                notifications.map((n) => {
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleItemClick(n)}
                      className={`p-3 transition cursor-pointer hover:bg-slate-50 flex items-start gap-2.5 group relative ${
                        !n.isRead ? 'bg-blue-50/40' : 'bg-white'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.isRead ? 'bg-blue-600' : 'bg-transparent'}`} />

                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-slate-900 truncate">{n.title}</span>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">
                            {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px] mt-0.5 leading-snug">{n.message}</p>
                      </div>

                      {/* Individual Delete Button */}
                      <button
                        onClick={(e) => handleDeleteItem(e, n.id, n.isRead)}
                        title="Delete notification"
                        className="absolute right-2 top-3 p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-200/60 transition opacity-80 group-hover:opacity-100"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rejection Detail Modal for Tenants */}
      {rejectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-rose-50/80 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  ✕
                </div>
                <div>
                  <h3 className="font-bold text-rose-950 text-xs">Payment Verification Rejected</h3>
                  <p className="text-[10px] text-rose-700">Notice from House Administration</p>
                </div>
              </div>
              <button
                onClick={() => setRejectionModal(null)}
                className="text-rose-400 hover:text-rose-700 font-bold text-base p-1"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-3.5">
              {/* Reason Callout */}
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg">
                <span className="font-bold text-amber-900 block text-[11px] uppercase tracking-wider mb-1">
                  Reason for Rejection
                </span>
                <p className="text-slate-800 text-xs font-medium leading-relaxed">
                  "{rejectionModal.rejectionReason}"
                </p>
              </div>

              {/* Payment Details Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-500 block">Submitted Amount</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    {rejectionModal.amount ? formatCurrencyNPR(rejectionModal.amount) : '—'}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-500 block">Billing Period</span>
                  <span className="font-semibold text-slate-900">
                    {rejectionModal.billingPeriod}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-500 block">Payment Method</span>
                  <span className="font-semibold text-slate-900 font-mono">
                    {rejectionModal.paymentMethod}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-500 block">Transaction ID</span>
                  <span className="font-semibold text-slate-900 font-mono truncate block">
                    {rejectionModal.transactionId}
                  </span>
                </div>
              </div>

              {/* Remaining Outstanding Due */}
              {rejectionModal.remainingDue !== null && (
                <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-rose-900 block">Current Remaining Due</span>
                    <span className="text-[10px] text-rose-700">Please re-submit payment proof with valid receipt.</span>
                  </div>
                  <div className="text-base font-extrabold text-rose-800 font-mono">
                    {formatCurrencyNPR(rejectionModal.remainingDue)}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setRejectionModal(null)}
                className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setRejectionModal(null);
                  router.push('/tenant/pay');
                }}
                className="px-3.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <span>Pay / Resubmit Proof</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
