'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS } from '@/lib/nepali-date';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { useAutoSync, broadcastSync } from '@/lib/sync';
import { NepaliDatePicker } from '@/components/NepaliDatePicker';
import { useToast } from '@/lib/toast-context';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatusBadge } from '@/components/StatusBadge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonCard, SkeletonTable } from '@/components/ui/LoadingSkeleton';
import Link from 'next/link';
import {
  Banknote,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  PiggyBank,
  Home,
  DoorOpen,
  PlusCircle,
  Droplets,
  ShoppingBag,
  Zap,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Sparkles,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const toast = useToast();
  const [summary, setSummary] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayBS, setTodayBS] = useState<{
    nepaliFullFormatted: string;
    yearBS: number;
    monthBS: number;
    monthNameBS: string;
  } | null>(null);

  // Cash Modal state
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const cashIdempotencyKeyRef = useRef<string | null>(null);
  const [cashForm, setCashForm] = useState({
    roomId: '',
    tenantId: '',
    tenantName: '',
    roomNumber: '',
    billId: '',
    amount: '',
    maxDue: 0,
    paymentDateBS: '',
    notes: '',
  });

  const [unpaidBills, setUnpaidBills] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [sumRes, roomsRes, unpaidRes] = await Promise.all([
        api.get('/billing/summary'),
        api.get('/rooms'),
        api.get('/billing/all?unpaidOnly=true'),
      ]);
      setSummary(sumRes);
      setRooms(roomsRes);
      setUnpaidBills(Array.isArray(unpaidRes) ? unpaidRes : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load admin summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTodayBS(getTodayBS());
    loadData();
  }, []);

  // Real-time synchronization when payments, bills, water, electricity, or maintenance update
  useAutoSync(loadData, ['payment', 'bill', 'electricity', 'water', 'custom_purchase', 'maintenance', 'all']);

  const handleOpenCashPayment = (targetRoom?: any) => {
    const today = getTodayBS();

    // 1. Accurately resolve room & tenant from targetRoom payload
    const activeTenant = targetRoom?.tenant || (targetRoom as any)?.tenantProfiles?.[0]?.user || null;
    const tId = activeTenant?.id || (targetRoom as any)?.tenantProfiles?.[0]?.userId || targetRoom?.tenantId || '';
    const tName = activeTenant?.fullName || targetRoom?.tenantName || '';
    const rId = targetRoom?.id || targetRoom?.roomId || '';
    const rNum = String(targetRoom?.roomNumber || '');

    let resolvedTenantId = tId;
    let resolvedTenantName = tName;
    let resolvedRoomId = rId;
    let resolvedRoomNumber = rNum;

    // Fallback only if no room was passed (e.g. from top header button)
    if (!resolvedTenantId) {
      const occupiedWithDue = rooms.find((r) => {
        const t = r.tenant || (r as any).tenantProfiles?.[0]?.user;
        return r.status === 'OCCUPIED' && t;
      });
      if (occupiedWithDue) {
        const t = occupiedWithDue.tenant || (occupiedWithDue as any).tenantProfiles?.[0]?.user;
        resolvedRoomId = occupiedWithDue.id;
        resolvedRoomNumber = String(occupiedWithDue.roomNumber);
        resolvedTenantId = t?.id || (occupiedWithDue as any).tenantProfiles?.[0]?.userId || '';
        resolvedTenantName = t?.fullName || '';
      }
    }

    const tBills = resolvedTenantId ? unpaidBills.filter((b) => b.tenantId === resolvedTenantId) : [];
    const totalDue = tBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);

    setCashForm({
      roomId: resolvedRoomId,
      tenantId: resolvedTenantId,
      tenantName: resolvedTenantName || 'Tenant',
      roomNumber: resolvedRoomNumber,
      billId: tBills[0]?.id || '',
      amount: totalDue > 0 ? String(totalDue) : '',
      maxDue: totalDue,
      paymentDateBS: today.nepaliFormatted,
      notes: 'Direct Cash Payment received by Admin',
    });
    setCashModalOpen(true);
  };

  const handleRecordCashPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashForm.tenantId) {
      toast.warning('Please select a tenant.');
      return;
    }
    const amt = parseFloat(cashForm.amount);
    if (isNaN(amt) || amt <= 0) {
      toast.warning('Please enter a valid cash amount.');
      return;
    }

    if (!cashIdempotencyKeyRef.current) {
      cashIdempotencyKeyRef.current = generateIdempotencyKey();
    }
    const idempotencyKey = cashIdempotencyKeyRef.current;

    try {
      setCashSubmitting(true);
      const res = await api.post('/payments/cash-payment', {
        tenantId: cashForm.tenantId,
        billId: cashForm.billId || undefined,
        amount: amt,
        paymentDateBS: cashForm.paymentDateBS,
        notes: cashForm.notes,
        idempotencyKey,
      });
      cashIdempotencyKeyRef.current = null;
      broadcastSync('payment');
      toast.success(res?.message || 'Cash payment recorded and dues cleared successfully.');
      setCashModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record cash payment');
    } finally {
      setCashSubmitting(false);
    }
  };

  const totalRooms = summary?.stats?.totalRooms ?? rooms.length;
  const occupiedRooms = summary?.stats?.occupiedRooms ?? rooms.filter((r) => r.status === 'OCCUPIED').length;
  const vacantRooms = summary?.stats?.vacantRooms ?? Math.max(0, totalRooms - occupiedRooms);

  const expectedRent = summary?.stats?.expectedRent ?? 0;
  const collectedAmount = summary?.stats?.collectedAmount ?? 0;
  const totalCollectedAllTime = summary?.stats?.totalCollectedAllTime ?? 0;
  const outstandingAmount = summary?.stats?.outstandingAmount ?? 0;
  const totalAdvanceBalance = summary?.stats?.totalAdvanceBalance ?? 0;
  const verifiedPaymentsCount = summary?.stats?.verifiedPaymentsCount ?? 0;
  const pendingPaymentsCount = summary?.stats?.pendingPaymentsCount ?? 0;
  const pendingPaymentsAmount = summary?.stats?.pendingPaymentsAmount ?? 0;
  const totalBilledCollectedAllTime = summary?.stats?.totalBilledCollectedAllTime ?? 0;
  const isReconciled = summary?.stats?.isReconciled ?? true;

  // Dynamic greeting
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      {/* Premium Dashboard Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-2xl p-6 sm:p-7 text-white shadow-card relative overflow-hidden">
        {/* Subtle decorative background circles */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-indigo-300" />
                <span>Private 6-Room System</span>
              </span>
              {isReconciled && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Ledger Reconciled
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              {greeting}, Administrator
            </h1>
            <p className="text-xs text-indigo-200/90 mt-1 max-w-xl leading-relaxed">
              Financial overview, rent collection, and utility tracking for{' '}
              <span className="font-semibold text-white">
                {todayBS?.monthNameBS || 'Current Month'} {todayBS?.yearBS || '2083'} BS
              </span>
              .
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <Button
              onClick={() => handleOpenCashPayment()}
              variant="success"
              size="sm"
              className="font-bold shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Record Cash</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Room Occupancy Strip */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
            <Home className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Rooms
            </div>
            <div className="text-lg font-extrabold text-slate-900 mt-0.5">{totalRooms}</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <DoorOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Occupied
            </div>
            <div className="text-lg font-extrabold text-emerald-700 mt-0.5">
              {occupiedRooms}{' '}
              <span className="text-xs font-medium text-slate-400">
                ({Math.round((occupiedRooms / (totalRooms || 1)) * 100)}%)
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
            <Home className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Vacant
            </div>
            <div className="text-lg font-extrabold text-slate-700 mt-0.5">{vacantRooms}</div>
          </div>
        </div>
      </div>

      {/* Executive Financial Cards Grid (5 Key Financial Metrics) */}
      {loading ? (
        <SkeletonCard count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. All-Time Collected (Most prominent historical metric) */}
          <StatCard
            variant="success"
            title="Total Collected (All-Time)"
            value={formatCurrencyNPR(totalCollectedAllTime)}
            badge={`${verifiedPaymentsCount} Verified`}
            icon={<TrendingUp className="w-5 h-5" />}
            subtitle={
              <span>
                Billed:{' '}
                <strong className="text-slate-700">
                  {formatCurrencyNPR(totalBilledCollectedAllTime)}
                </strong>{' '}
                + Advance:{' '}
                <strong className="text-slate-700">
                  {formatCurrencyNPR(totalAdvanceBalance)}
                </strong>
              </span>
            }
          />

          {/* 2. Current Month Collected */}
          <StatCard
            variant="primary"
            title={`Collected (${summary?.period?.monthNameBS || 'This Month'})`}
            value={formatCurrencyNPR(collectedAmount)}
            badge={`${summary?.period?.yearBS || 2083} BS`}
            icon={<CheckCircle2 className="w-5 h-5" />}
            subtitle={
              <span>
                Expected Rent:{' '}
                <strong className="text-slate-700">{formatCurrencyNPR(expectedRent)}</strong>
              </span>
            }
          />

          {/* 3. Total Outstanding Dues */}
          <StatCard
            variant={outstandingAmount > 0 ? 'danger' : 'neutral'}
            title="Total Outstanding Dues"
            value={formatCurrencyNPR(outstandingAmount)}
            badge={outstandingAmount > 0 ? 'Needs Attention' : 'All Clear'}
            icon={<AlertCircle className="w-5 h-5" />}
            subtitle={
              <span>
                {unpaidBills.length} unpaid bill{unpaidBills.length === 1 ? '' : 's'} across rooms
              </span>
            }
          />

          {/* 4. Advance Credit Balance */}
          <StatCard
            variant="accent"
            title="Advance Credit Held"
            value={formatCurrencyNPR(totalAdvanceBalance)}
            badge="Prepaid Funds"
            icon={<PiggyBank className="w-5 h-5" />}
            subtitle="Prepaid bank/cash awaiting next monthly billing"
          />
        </div>
      )}

      {/* Financial Visualization & Visual Breakdown Strip */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Financial Ledger Distribution</span>
              {isReconciled && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Fully Balanced
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Visual proportion of total collected revenue vs outstanding tenant receivables
            </p>
          </div>
          <Link
            href="/admin/payments"
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 group"
          >
            <span>View Full Ledger</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Visual Progress Ratio Bar */}
        <ProgressBar
          segments={[
            {
              label: `All-Time Collected (${formatCurrencyNPR(totalCollectedAllTime)})`,
              value: totalCollectedAllTime,
              colorClass: 'bg-emerald-500',
            },
            {
              label: `Outstanding Dues (${formatCurrencyNPR(outstandingAmount)})`,
              value: outstandingAmount,
              colorClass: 'bg-rose-500',
            },
            {
              label: `Advance Held (${formatCurrencyNPR(totalAdvanceBalance)})`,
              value: totalAdvanceBalance,
              colorClass: 'bg-purple-500',
            },
          ]}
          height="h-3"
        />

        {/* Category breakdown cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold">
              <Droplets className="w-3.5 h-3.5 text-blue-500" />
              <span>Water Purchases</span>
            </div>
            <div className="font-mono font-bold text-slate-900 text-sm mt-1">
              {formatCurrencyNPR(summary?.stats?.totalWaterPurchasesAllTime || 0)}
            </div>
          </div>

          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold">
              <ShoppingBag className="w-3.5 h-3.5 text-purple-500" />
              <span>Purchases / Extras</span>
            </div>
            <div className="font-mono font-bold text-slate-900 text-sm mt-1">
              {formatCurrencyNPR(summary?.stats?.totalCustomPurchasesAllTime || 0)}
            </div>
          </div>

          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Electricity</span>
            </div>
            <div className="font-mono font-bold text-slate-900 text-sm mt-1">
              {formatCurrencyNPR(summary?.stats?.totalElectricityAllTime || 0)}
            </div>
          </div>

          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Pending Verifications</span>
            </div>
            <div className="font-mono font-bold text-slate-900 text-sm mt-1">
              {pendingPaymentsCount > 0 ? (
                <Link href="/admin/payments" className="text-amber-700 hover:underline">
                  {pendingPaymentsCount} ({formatCurrencyNPR(pendingPaymentsAmount)})
                </Link>
              ) : (
                <span className="text-emerald-700 font-semibold">0 Pending</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Rooms Overview Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Room Overview ({totalRooms} Rooms)</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Live occupancy, assigned tenants, and electricity sub-meter readings
            </p>
          </div>
          <Link
            href="/admin/rooms"
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 group"
          >
            <span>Manage All Rooms</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold">
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Current Tenant</th>
                <th className="px-4 py-3">Monthly Rent</th>
                <th className="px-4 py-3">Electricity Reading</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
              {loading && rooms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading rooms...
                  </td>
                </tr>
              ) : rooms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No rooms found.
                  </td>
                </tr>
              ) : (
                rooms.map((room) => {
                  const isOccupied = room.status === 'OCCUPIED';
                  const tenant = room.tenant || room.tenantProfiles?.[0]?.user;
                  const profile = room.tenantProfiles?.[0];
                  const rent = profile ? profile.monthlyRent : room.defaultRent;

                  return (
                    <tr key={room.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">Room {room.roomNumber}</div>
                        <div className="text-[11px] text-slate-500">{room.name}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={room.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        {tenant ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                              {tenant.fullName.slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 leading-tight">
                                {tenant.fullName}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                @{tenant.username}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No tenant assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                        {formatCurrencyNPR(rent)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {room.currentReading !== null && room.currentReading !== undefined ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-900">
                              {room.currentReading}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              ({room.unitsUsed ?? room.electricityUnits ?? 0} units)
                            </span>
                          </div>
                        ) : (
                          <span className="text-amber-700 font-medium text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Reading Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {isOccupied ? (
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              variant="success"
                              size="xs"
                              onClick={() => handleOpenCashPayment(room)}
                            >
                              Pay Cash
                            </Button>
                            <Link href="/admin/billing">
                              <Button variant="outline" size="xs">
                                View Bill
                              </Button>
                            </Link>
                          </div>
                        ) : (
                          <Link href="/admin/tenants">
                            <Button variant="primary" size="xs">
                              Assign
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Dashboard Direct Cash Payment Modal */}
      {cashModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-modal text-xs space-y-4 animate-scaleUp">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Record Direct Cash Payment
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Receive cash and instantly reconcile dues
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCashModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRecordCashPayment} className="space-y-3.5">
              {/* Step 1: Select Room */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  1. Select Room <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={cashForm.roomId}
                  onChange={(e) => {
                    const newRoomId = e.target.value;
                    let nextTenantId = '';
                    let nextTenantName = '';
                    let nextRoomNum = '';

                    if (newRoomId && newRoomId !== 'MOVED_OUT') {
                      const r = rooms.find((rm) => rm.id === newRoomId);
                      nextRoomNum = String(r?.roomNumber || '');
                      if (r?.tenant) {
                        nextTenantId = r.tenant.id;
                        nextTenantName = r.tenant.fullName;
                      }
                    }

                    const tBills = nextTenantId
                      ? unpaidBills.filter((b) => b.tenantId === nextTenantId)
                      : [];
                    const totalDue = tBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);

                    setCashForm({
                      ...cashForm,
                      roomId: newRoomId,
                      tenantId: nextTenantId,
                      tenantName: nextTenantName,
                      roomNumber: nextRoomNum,
                      billId: tBills[0]?.id || '',
                      amount: totalDue > 0 ? String(totalDue) : '',
                      maxDue: totalDue,
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 bg-white font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">-- Select Room --</option>
                  <optgroup label="Active Rooms">
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.roomNumber} ({r.name}){' '}
                        {r.tenant ? `[Occupied: ${r.tenant.fullName}]` : '[Vacant]'}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Historical / Former Tenants">
                    <option value="MOVED_OUT">[Moved-Out Tenants With Dues]</option>
                  </optgroup>
                </select>
              </div>

              {/* Step 2: Select Tenant */}
              {cashForm.roomId && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    2. Select Tenant <span className="text-rose-500">*</span>
                  </label>
                  {(() => {
                    let availableTenants: {
                      id: string;
                      fullName: string;
                      due: number;
                      status: string;
                    }[] = [];
                    if (cashForm.roomId === 'MOVED_OUT') {
                      const activeTenantIds = new Set(
                        rooms.map((r) => r.tenant?.id).filter(Boolean)
                      );
                      const movedOutMap = new Map<
                        string,
                        { id: string; fullName: string; due: number; status: string }
                      >();
                      for (const b of unpaidBills) {
                        if (b.tenantId && !activeTenantIds.has(b.tenantId)) {
                          const cur = movedOutMap.get(b.tenantId) || {
                            id: b.tenantId,
                            fullName: b.tenant?.fullName || 'Former Tenant',
                            due: 0,
                            status: 'MOVED_OUT',
                          };
                          cur.due += Number(b.balanceDue || 0);
                          movedOutMap.set(b.tenantId, cur);
                        }
                      }
                      availableTenants = Array.from(movedOutMap.values());
                    } else {
                      const selRoom = rooms.find((r) => r.id === cashForm.roomId);
                      if (selRoom?.tenant) {
                        const tBills = unpaidBills.filter(
                          (b) => b.tenantId === selRoom.tenant.id
                        );
                        const due = tBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);
                        availableTenants.push({
                          id: selRoom.tenant.id,
                          fullName: selRoom.tenant.fullName,
                          due,
                          status: 'ACTIVE',
                        });
                      }
                    }

                    if (availableTenants.length === 0) {
                      return (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-xs">
                          No tenants with dues found for this room.
                        </div>
                      );
                    }

                    return (
                      <select
                        required
                        value={cashForm.tenantId}
                        onChange={(e) => {
                          const tId = e.target.value;
                          const chosen = availableTenants.find((t) => t.id === tId);
                          const tBills = unpaidBills.filter((b) => b.tenantId === tId);
                          const totalDue = tBills.reduce(
                            (sum, b) => sum + (b.balanceDue || 0),
                            0
                          );

                          setCashForm({
                            ...cashForm,
                            tenantId: tId,
                            tenantName: chosen?.fullName || '',
                            billId: tBills[0]?.id || '',
                            amount: totalDue > 0 ? String(totalDue) : '',
                            maxDue: totalDue,
                          });
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 bg-white font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      >
                        <option value="">-- Select Tenant --</option>
                        {availableTenants.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.fullName} {t.status === 'MOVED_OUT' ? '[Moved Out]' : ''}{' '}
                            ({t.due > 0 ? `Due: Rs. ${t.due}` : 'No Dues'})
                          </option>
                        ))}
                      </select>
                    );
                  })()}
                </div>
              )}

              {/* Step 3: Select Bill */}
              {cashForm.tenantId && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    3. Target Bill <span className="text-rose-500">*</span>
                  </label>
                  {(() => {
                    const tenantBills = unpaidBills.filter(
                      (b) => b.tenantId === cashForm.tenantId
                    );
                    if (tenantBills.length === 0) {
                      return (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-xs">
                          No unpaid bills found. Payment will apply to tenant credit balance.
                        </div>
                      );
                    }

                    return (
                      <select
                        value={cashForm.billId}
                        onChange={(e) => {
                          const bId = e.target.value;
                          if (bId) {
                            const b = tenantBills.find((bill) => bill.id === bId);
                            const due = Number(b?.balanceDue ?? b?.totalAmount ?? 0);
                            setCashForm({
                              ...cashForm,
                              billId: bId,
                              amount: due > 0 ? String(due) : '',
                              maxDue: due,
                            });
                          } else {
                            const totalDue = tenantBills.reduce(
                              (sum, b) => sum + (b.balanceDue || 0),
                              0
                            );
                            setCashForm({
                              ...cashForm,
                              billId: '',
                              amount: totalDue > 0 ? String(totalDue) : '',
                              maxDue: totalDue,
                            });
                          }
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 bg-white font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      >
                        <option value="">
                          All Outstanding Bills (Auto-Reconcile Dues: Rs. {cashForm.maxDue})
                        </option>
                        {tenantBills.map((b) => (
                          <option key={b.id} value={b.id}>
                            Room {b.room?.roomNumber || b.roomNumber} &mdash;{' '}
                            {b.billingPeriodBS || `${b.yearBS} ${b.monthNameBS}`} (Total: Rs.{' '}
                            {b.totalAmount}, Due: Rs. {b.balanceDue}) [{b.status}]
                          </option>
                        ))}
                      </select>
                    );
                  })()}
                </div>
              )}

              {/* Step 4: Bill Information Preview Card */}
              {(() => {
                const currentBill = unpaidBills.find(
                  (b) => b.id === cashForm.billId && b.tenantId === cashForm.tenantId
                );
                if (!currentBill) return null;
                return (
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 font-bold text-slate-900">
                      <span>
                        Room {currentBill.room?.roomNumber || currentBill.roomNumber} &bull;{' '}
                        {currentBill.tenant?.fullName || cashForm.tenantName}
                      </span>
                      <span className="text-emerald-700 font-mono">
                        {currentBill.billingPeriodBS ||
                          `${currentBill.yearBS} ${currentBill.monthNameBS}`}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600">
                      <div>
                        Rent:{' '}
                        <span className="font-semibold text-slate-900">
                          Rs. {currentBill.rentAmount}
                        </span>
                      </div>
                      <div>
                        Electricity:{' '}
                        <span className="font-semibold text-slate-900">
                          Rs. {currentBill.electricityAmount}
                        </span>
                      </div>
                      <div>
                        Water:{' '}
                        <span className="font-semibold text-slate-900">
                          Rs. {currentBill.waterAmount}
                        </span>
                      </div>
                      <div>
                        Garbage:{' '}
                        <span className="font-semibold text-slate-900">
                          Rs. {currentBill.garbageAmount}
                        </span>
                      </div>
                      <div>
                        Internet:{' '}
                        <span className="font-semibold text-slate-900">
                          Rs. {currentBill.internetAmount}
                        </span>
                      </div>
                      <div>
                        Other/Adj:{' '}
                        <span className="font-semibold text-slate-900">
                          Rs.{' '}
                          {(currentBill.adjustmentsAmount || 0) +
                            (currentBill.customPurchasesAmount || 0)}
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-bold">
                      <span className="text-slate-700">
                        Total: Rs. {currentBill.totalAmount} (Paid: Rs.{' '}
                        {currentBill.paidAmount})
                      </span>
                      <span className="text-rose-700 font-mono text-xs">
                        Due: Rs. {currentBill.balanceDue}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Step 5: Cash Amount Input */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Cash Amount Received (NPR) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">Rs.</span>
                  <input
                    type="number"
                    required
                    min={1}
                    value={cashForm.amount}
                    onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })}
                    placeholder="e.g. 6500"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 font-mono font-bold text-base focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                {cashForm.maxDue > 0 && (
                  <div className="mt-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setCashForm({ ...cashForm, amount: String(cashForm.maxDue) })
                      }
                      className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
                    >
                      Clear Full Balance (Rs. {cashForm.maxDue})
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Payment Date (Bikram Sambat BS)
                </label>
                <NepaliDatePicker
                  value={cashForm.paymentDateBS}
                  onChange={(formattedBS) =>
                    setCashForm({ ...cashForm, paymentDateBS: formattedBS })
                  }
                  placeholder="Select payment date"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Remarks / Notes (Optional)
                </label>
                <input
                  type="text"
                  value={cashForm.notes}
                  onChange={(e) => setCashForm({ ...cashForm, notes: e.target.value })}
                  placeholder="e.g. Received in cash by Admin"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCashModalOpen(false)}
                  disabled={cashSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="success"
                  loading={cashSubmitting}
                  disabled={!cashForm.tenantId}
                  className="font-bold"
                >
                  {cashSubmitting ? 'Recording...' : 'Record Cash Payment & Clear Dues'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
