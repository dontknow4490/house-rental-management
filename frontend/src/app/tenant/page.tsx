'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api, getFileUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatCurrencyNPR } from '@/lib/nepali-date';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Droplet,
  ArrowRight,
  ShieldCheck,
  QrCode,
  FileText,
  Wrench,
  RefreshCw,
  Bell,
  Home,
  Receipt,
  Copy,
} from 'lucide-react';
import { useToast } from '@/lib/toast-context';

export default function TenantDashboardPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [bill, setBill] = useState<any>(null);
  const [notices, setNotices] = useState<any[]>([]);
  const [pubSettings, setPubSettings] = useState<any>(null);
  const [maintenanceRequests, setMaintenanceRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const loadTenantData = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);

      const [billData, noticeData, settingsData, maintData] = await Promise.all([
        api.get('/billing/my-active').catch(() => null),
        api.get('/notices/active').catch(() => []),
        api.get('/settings/public-payment').catch(() => null),
        api.get('/maintenance').catch(() => []),
      ]);

      if (billData) setBill(billData);
      if (Array.isArray(noticeData)) setNotices(noticeData);
      if (settingsData) setPubSettings(settingsData);
      if (Array.isArray(maintData)) setMaintenanceRequests(maintData.slice(0, 3));
    } catch (err) {
      console.error('Error loading tenant data:', err);
    } finally {
      if (!isBackground) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTenantData();

    // Event-driven auto-synchronization: instant reload when payment is verified or proof submitted
    const onPaymentUpdated = () => {
      loadTenantData(true);
    };

    const onFocus = () => {
      loadTenantData(true);
    };

    window.addEventListener('payment_updated', onPaymentUpdated);
    window.addEventListener('focus', onFocus);

    // Background interval every 20s as safe fallback
    const interval = setInterval(() => {
      loadTenantData(true);
    }, 20000);

    return () => {
      window.removeEventListener('payment_updated', onPaymentUpdated);
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [loadTenantData]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast.success(`Copied ${label} to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const totalDue = bill?.totalOutstanding !== undefined ? bill.totalOutstanding : (bill?.balanceDue ?? 0);
  const isPaid = bill?.allBillsPaid || totalDue === 0;
  const isPending = !isPaid && (bill?.isPendingVerification || bill?.status === 'PENDING_VERIFICATION');
  const isPartial = !isPaid && !isPending && (bill?.paidAmount > 0 || (bill?.unpaidBills && bill.unpaidBills.some((b: any) => b.paidAmount > 0)));

  const recentBills = bill?.recentBills || (bill ? [bill] : []);
  const activeQr = pubSettings?.esewaQrImage || pubSettings?.payment_qr_path || pubSettings?.paymentQrCode;

  return (
    <div className="space-y-6 text-xs max-w-5xl mx-auto pb-10">
      {/* Active House Notices Banner */}
      {notices.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border border-blue-200 text-slate-800 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-blue-950 text-xs">
            <Bell className="w-4 h-4 text-blue-600 animate-pulse" />
            <span>House Announcements & Notices</span>
          </div>
          <div className="space-y-1.5 pl-6">
            {notices.map((n) => (
              <div key={n.id} className="text-slate-700">
                <span className="font-semibold text-slate-900">{n.title}: </span>
                <span>{n.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hero Outstanding & Billing Status Card */}
      <div className="relative overflow-hidden bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-card space-y-5">
        {/* Subtle background glow */}
        <div
          className={`absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-40 ${
            isPaid ? 'bg-emerald-400' : isPending ? 'bg-amber-400' : 'bg-rose-400'
          }`}
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <Home className="w-3 h-3" />
                Room {user?.tenantProfile?.room?.roomNumber || user?.tenantProfile?.roomNumber || '—'}
              </span>
              <span className="text-slate-500 text-xs">
                Resident: <strong className="text-slate-800">{user?.fullName || user?.username}</strong>
              </span>
            </div>

            <span className="text-slate-500 text-[11px] font-medium uppercase tracking-wider block mt-2">
              Total Outstanding Balance
            </span>
            <div className="flex items-baseline gap-2.5 mt-0.5">
              <span
                className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight ${
                  isPaid ? 'text-emerald-700' : isPending ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {formatCurrencyNPR(totalDue)}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {isPaid ? 'All Clear' : 'Dues Pending'}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-2">
            <div className="flex items-center gap-2">
              {isPaid && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Paid in Full 🎉
                </span>
              )}
              {isPending && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-xs animate-pulse">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Verification Pending ⏳
                </span>
              )}
              {isPartial && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300 shadow-xs">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  Partially Paid
                </span>
              )}
              {!isPaid && !isPending && !isPartial && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-xs">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  Payment Due
                </span>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={() => loadTenantData(true)}
                title="Refresh Status"
                className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg p-1.5"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
              </Button>
            </div>

            <p className="text-[11px] text-slate-500">
              {isPending
                ? 'Your payment proof has been submitted. The owner will review and issue your receipt.'
                : isPaid
                ? 'Thank you! Your rent and utility accounts are in good standing.'
                : 'Please complete payment via eSewa or bank transfer.'}
            </p>
          </div>
        </div>

        {/* Advance Balance Credit Pill */}
        {bill?.advanceBalance > 0 && (
          <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center font-bold text-xs">
                Rs
              </div>
              <div>
                <span className="font-bold text-emerald-950 block text-xs">Advance Balance Credit</span>
                <span className="text-[11px] text-emerald-700">
                  This balance is automatically deducted from your upcoming monthly bills.
                </span>
              </div>
            </div>
            <div className="text-base font-extrabold font-mono text-emerald-900">
              {formatCurrencyNPR(bill.advanceBalance)}
            </div>
          </div>
        )}

        {/* Quick Action Buttons Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 relative z-10">
          <div className="text-slate-600 text-xs">
            {isPaid ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Zero outstanding dues for this period.
              </span>
            ) : bill?.unpaidBills && bill.unpaidBills.length > 1 ? (
              <span className="text-amber-800 font-medium">
                Includes {bill.unpaidBills.length} outstanding billing periods. Combined single payment supported.
              </span>
            ) : (
              <span className="text-slate-600">
                Electricity, water, and rent calculated for current cycle.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {activeQr && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQrModalOpen(true)}
                className="font-semibold gap-1.5 border-slate-300 hover:bg-slate-50"
              >
                <QrCode className="w-4 h-4 text-indigo-600" />
                <span>View Payment QR</span>
              </Button>
            )}

            {!isPaid ? (
              <Link
                href="/tenant/pay"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl transition shadow-sm shadow-indigo-200"
              >
                <span>Pay Total ({formatCurrencyNPR(totalDue)})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                href="/tenant/pay"
                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition"
              >
                <span>Pay in Advance</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Quick Access Action Navigation Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Link
          href="/tenant/pay"
          className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-card transition-all flex flex-col items-center text-center group"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50 group-hover:bg-indigo-600 group-hover:text-white text-indigo-600 flex items-center justify-center transition mb-2 shadow-xs">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="font-bold text-slate-900 text-xs">Pay Rent & Bills</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Scan QR & upload proof</div>
        </Link>

        <Link
          href="/tenant/bills"
          className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-card transition-all flex flex-col items-center text-center group"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-slate-900 group-hover:text-white text-slate-700 flex items-center justify-center transition mb-2 shadow-xs">
            <FileText className="w-5 h-5" />
          </div>
          <div className="font-bold text-slate-900 text-xs">Billing History</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Itemized past months</div>
        </Link>

        <Link
          href="/tenant/receipts"
          className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-card transition-all flex flex-col items-center text-center group"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 group-hover:bg-emerald-600 group-hover:text-white text-emerald-600 flex items-center justify-center transition mb-2 shadow-xs">
            <Receipt className="w-5 h-5" />
          </div>
          <div className="font-bold text-slate-900 text-xs">Digital Receipts</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Verified payment receipts</div>
        </Link>

        <Link
          href="/tenant/maintenance"
          className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-card transition-all flex flex-col items-center text-center group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 group-hover:bg-amber-600 group-hover:text-white text-amber-600 flex items-center justify-center transition mb-2 shadow-xs">
            <Wrench className="w-5 h-5" />
          </div>
          <div className="font-bold text-slate-900 text-xs">Maintenance & Fixes</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Plumbing, electric, leaks</div>
        </Link>
      </div>

      {/* Active Maintenance Requests Tracker Widget (If Any) */}
      {maintenanceRequests.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-600" />
              <span className="font-bold text-slate-900 text-xs">Your Maintenance Requests</span>
            </div>
            <Link
              href="/tenant/maintenance"
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
            >
              View All &rarr;
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {maintenanceRequests.map((req) => (
              <div key={req.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 truncate text-xs">{req.title}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{req.category} • Room {user?.tenantProfile?.room?.roomNumber || '—'}</div>
                </div>
                <StatusBadge status={req.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complete Electricity & Bill Details for Latest Billing Periods */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-1 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Current & Recent Billing Breakdowns</h2>
            <p className="text-[11px] text-slate-500">
              Complete meter readings, electricity charges, and line items
            </p>
          </div>
          <Link
            href="/tenant/bills"
            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
          >
            All Historical Bills &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 space-y-2 shadow-xs">
            <RefreshCw className="w-6 h-6 mx-auto animate-spin text-indigo-500" />
            <p className="font-semibold text-xs text-slate-600">Loading billing details...</p>
          </div>
        ) : recentBills.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 shadow-xs">
            <p className="font-semibold text-slate-800">No monthly bills generated yet</p>
            <p className="text-[11px] text-slate-400 mt-1">Bills will appear here once generated by the owner.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentBills.map((b: any) => {
              const isBillPaid = b.status === 'PAID' || b.balanceDue === 0;
              const isBillPending = !isBillPaid && b.status === 'PENDING_VERIFICATION';
              const isBillPartial = !isBillPaid && !isBillPending && b.paidAmount > 0;
              const elec = b.electricityReading;

              return (
                <div
                  key={b.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-card space-y-4"
                >
                  {/* Bill Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          {b.billingPeriodBS || `${b.yearBS} ${b.monthNameBS || ''}`}
                        </span>
                        {b.isOngoing && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Active Cycle
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Bill Ref: {b.billNumber}{' '}
                        {b.correctionReason && (
                          <span className="text-amber-700 ml-1 font-sans italic">
                            (Correction: {b.correctionReason})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <StatusBadge status={b.status} />
                    </div>
                  </div>

                  {/* Electricity Meter Section */}
                  <div className="bg-slate-50 rounded-xl p-3 sm:p-4 border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-amber-600" />
                        Electricity Meter Reading & Usage
                      </span>
                      <span className="font-mono font-extrabold text-slate-900 text-xs">
                        {formatCurrencyNPR(b.electricityAmount)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                        <div className="text-slate-500 text-[10px] font-medium">Previous Reading</div>
                        <div className="font-mono font-bold text-slate-900 mt-0.5">
                          {elec?.previousReading !== null && elec?.previousReading !== undefined
                            ? elec.previousReading
                            : '—'}
                        </div>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                        <div className="text-slate-500 text-[10px] font-medium">Current Reading</div>
                        <div className="font-mono font-bold text-slate-900 mt-0.5">
                          {elec?.currentReading !== null && elec?.currentReading !== undefined
                            ? elec.currentReading
                            : '—'}
                        </div>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                        <div className="text-slate-500 text-[10px] font-medium">Units Used</div>
                        <div className="font-mono font-bold text-indigo-700 mt-0.5">
                          {elec?.unitsUsed ??
                            (b.electricityAmount > 0 ? Math.round(b.electricityAmount / 15) : 0)}{' '}
                          units
                        </div>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                        <div className="text-slate-500 text-[10px] font-medium">Rate / Unit</div>
                        <div className="font-mono font-bold text-slate-900 mt-0.5">
                          Rs. {elec?.unitRate ?? 15}/unit
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Itemized Charges & Balances Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    {/* Left: Charges Breakdown */}
                    <div className="space-y-1.5 text-slate-700">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Itemized Charges
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Room Rent</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {formatCurrencyNPR(b.rentAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Electricity</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {formatCurrencyNPR(b.electricityAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Internet Charge</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {formatCurrencyNPR(b.internetAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Garbage Collection</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {formatCurrencyNPR(b.garbageAmount ?? 100)}
                        </span>
                      </div>
                      {b.waterAmount > 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-100 text-cyan-900">
                          <span className="flex items-center gap-1">
                            <Droplet className="w-3 h-3 text-cyan-600" />
                            Drinking Water Jars
                          </span>
                          <span className="font-mono font-semibold">
                            {formatCurrencyNPR(b.waterAmount)}
                          </span>
                        </div>
                      )}
                      {b.customPurchasesAmount > 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-100 text-purple-900">
                          <span>Custom Purchases / Extras</span>
                          <span className="font-mono font-semibold">
                            {formatCurrencyNPR(b.customPurchasesAmount)}
                          </span>
                        </div>
                      )}
                      {b.adjustmentsAmount !== 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-700">
                          <span>Adjustments / Discounts</span>
                          <span className="font-mono font-semibold">
                            {formatCurrencyNPR(b.adjustmentsAmount)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right: Payment Ledger Summary */}
                    <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3">
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-slate-900 pb-1.5 border-b border-slate-200">
                          <span>Total Period Bill:</span>
                          <span className="font-mono text-sm">{formatCurrencyNPR(b.totalAmount)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600 text-xs">
                          <span>Total Paid:</span>
                          <span className="font-mono font-bold text-emerald-700">
                            {formatCurrencyNPR(b.paidAmount)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs font-extrabold text-rose-700 pt-1 border-t border-slate-200">
                          <span>Balance Due:</span>
                          <span className="font-mono text-sm">{formatCurrencyNPR(b.balanceDue)}</span>
                        </div>
                      </div>

                      {b.balanceDue > 0 && b.status !== 'PENDING_VERIFICATION' && (
                        <div className="pt-2">
                          <Link
                            href="/tenant/pay"
                            className="w-full inline-flex items-center justify-center gap-1.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition shadow-xs"
                          >
                            <span>Pay Outstanding ({formatCurrencyNPR(b.balanceDue)})</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick QR Code Modal */}
      {qrModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setQrModalOpen(false)}
          title="Payment QR Code"
          description="Scan via eSewa, mobile banking, or digital wallet to complete payment"
          icon={<QrCode className="w-5 h-5 text-indigo-600" />}
          maxWidth="md"
        >
          <div className="space-y-4 text-center">
            {activeQr ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl inline-block mx-auto">
                <div className="w-56 h-56 mx-auto bg-white p-2 rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                  <img
                    src={getFileUrl(activeQr)}
                    alt="Payment QR"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            ) : (
              <div className="py-8 text-slate-400">
                <QrCode className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>No active QR code configured by owner.</p>
              </div>
            )}

            {/* Account Credentials */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-left space-y-2">
              {pubSettings?.esewaId && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">eSewa ID:</span>
                  <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900">
                    <span>{pubSettings.esewaId}</span>
                    <button
                      onClick={() => copyToClipboard(pubSettings.esewaId, 'eSewa ID')}
                      className="p-1 text-slate-400 hover:text-indigo-600"
                      title="Copy eSewa ID"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {pubSettings?.esewaAccountName && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Account Name:</span>
                  <span className="font-bold text-slate-900">{pubSettings.esewaAccountName}</span>
                </div>
              )}

              {pubSettings?.bankName && (
                <div className="pt-2 border-t border-slate-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Bank:</span>
                    <span className="font-bold text-slate-900">{pubSettings.bankName}</span>
                  </div>
                  {pubSettings?.bankAccountNumber && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Account No:</span>
                      <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900">
                        <span>{pubSettings.bankAccountNumber}</span>
                        <button
                          onClick={() => copyToClipboard(pubSettings.bankAccountNumber, 'Bank Account')}
                          className="p-1 text-slate-400 hover:text-indigo-600"
                          title="Copy Account Number"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" onClick={() => setQrModalOpen(false)}>
                Close
              </Button>
              <Link
                href="/tenant/pay"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                <span>Upload Proof Slip</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
