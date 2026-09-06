'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS, NEPALI_MONTH_NAMES } from '@/lib/nepali-date';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { useAutoSync, broadcastSync } from '@/lib/sync';
import { NepaliDatePicker } from '@/components/NepaliDatePicker';
import { useToast } from '@/lib/toast-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { SkeletonCard, SkeletonTable } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Receipt,
  PlusCircle,
  Banknote,
  SlidersHorizontal,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Home,
  Zap,
  Droplets,
  Wifi,
  Trash,
  ShoppingBag,
  PiggyBank,
  Tag,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

export default function AdminBillingPage() {
  const toast = useToast();
  const [viewMode, setViewMode] = useState<'unpaid' | 'monthly'>('unpaid');
  const [bills, setBills] = useState<any[]>([]);
  const [unpaidCount, setUnpaidCount] = useState<number>(0);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedYearBS, setSelectedYearBS] = useState(2083);
  const [selectedMonthBS, setSelectedMonthBS] = useState(5);

  // Modals
  const [breakdownModalOpen, setBreakdownModalOpen] = useState(false);
  const [selectedBillBreakdown, setSelectedBillBreakdown] = useState<any>(null);
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjForm, setAdjForm] = useState({
    tenantId: '',
    roomId: '',
    type: 'DISCOUNT',
    amount: '',
    reason: '',
  });

  // Cash Payment Modal State
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

  // Correction Modal
  const [correctModalOpen, setCorrectModalOpen] = useState(false);
  const [correctSubmitting, setCorrectSubmitting] = useState(false);
  const [correctingBill, setCorrectingBill] = useState<any>(null);
  const [correctForm, setCorrectForm] = useState({
    rentAmount: '',
    electricityAmount: '',
    internetAmount: '',
    garbageAmount: '',
    waterAmount: '',
    adjustmentsAmount: '',
    customPurchasesAmount: '',
    correctionReason: '',
  });

  const loadBills = async () => {
    try {
      setLoading(true);
      const url =
        viewMode === 'unpaid'
          ? '/billing/all?unpaidOnly=true'
          : `/billing/all?yearBS=${selectedYearBS}&monthBS=${selectedMonthBS}`;

      const [bData, rData] = await Promise.all([api.get(url), api.get('/rooms')]);
      setBills(Array.isArray(bData) ? bData : []);
      setRooms(Array.isArray(rData) ? rData : []);

      if (viewMode === 'unpaid') {
        setUnpaidCount(bData.length);
      } else {
        api
          .get('/billing/all?unpaidOnly=true')
          .then((res) => {
            if (Array.isArray(res)) setUnpaidCount(res.length);
          })
          .catch(() => {});
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const today = getTodayBS();
    setSelectedYearBS(today.yearBS);
    setSelectedMonthBS(today.monthBS);
  }, []);

  useEffect(() => {
    loadBills();
  }, [viewMode, selectedYearBS, selectedMonthBS]);

  // Real-time synchronization when rooms, tenants, payments, bills, water, or electricity update
  useAutoSync(loadBills, ['bill', 'payment', 'room', 'tenant', 'electricity', 'water', 'custom_purchase', 'all']);

  const handleOpenBreakdown = async (billId: string) => {
    try {
      const data = await api.get(`/billing/${billId}`);
      setSelectedBillBreakdown({ ...data, isMultiMonth: false });
      setBreakdownModalOpen(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load bill breakdown');
    }
  };

  const handleOpenMultiBreakdown = async (billIds: string[]) => {
    try {
      if (!billIds || billIds.length === 0) return;
      if (billIds.length === 1) {
        return handleOpenBreakdown(billIds[0]);
      }
      const data = await api.get(`/billing/breakdown-multi?billIds=${billIds.join(',')}`);
      setSelectedBillBreakdown({ ...data, isMultiMonth: true });
      setBreakdownModalOpen(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load multi-month bill breakdown');
    }
  };

  const handleOpenCorrect = (bill: any) => {
    setCorrectingBill(bill);
    setCorrectForm({
      rentAmount: String(bill.rentAmount ?? 0),
      electricityAmount: String(bill.electricityAmount ?? 0),
      internetAmount: String(bill.internetAmount ?? 0),
      garbageAmount: String(bill.garbageAmount ?? 100),
      waterAmount: String(bill.waterAmount ?? 0),
      adjustmentsAmount: String(bill.adjustmentsAmount ?? 0),
      customPurchasesAmount: String(bill.customPurchasesAmount ?? 0),
      correctionReason: '',
    });
    setCorrectModalOpen(true);
  };

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingBill) return;
    if (!correctForm.correctionReason || !correctForm.correctionReason.trim()) {
      toast.warning('Please enter an audit reason for the correction.');
      return;
    }

    try {
      setCorrectSubmitting(true);
      await api.put(`/billing/${correctingBill.id}/correct`, {
        rentAmount: Number(correctForm.rentAmount) || 0,
        electricityAmount: Number(correctForm.electricityAmount) || 0,
        internetAmount: Number(correctForm.internetAmount) || 0,
        waterAmount: Number(correctForm.waterAmount) || 0,
        garbageAmount: Number(correctForm.garbageAmount) || 0,
        adjustmentsAmount: Number(correctForm.adjustmentsAmount) || 0,
        customPurchasesAmount: Number(correctForm.customPurchasesAmount || 0),
        reason: correctForm.correctionReason.trim(),
      });
      broadcastSync('bill');
      toast.success('Bill breakdown corrected successfully.');
      setCorrectModalOpen(false);
      loadBills();
    } catch (err: any) {
      toast.error(err.message || 'Failed to correct bill');
    } finally {
      setCorrectSubmitting(false);
    }
  };

  const handleOpenCashPayment = (target?: any) => {
    const today = getTodayBS();

    // 1. Resolve room & tenant from target payload accurately
    let tId = target?.tenantId || target?.tenant?.id || (target as any)?.tenantProfiles?.[0]?.userId || '';
    let tName = target?.tenant?.fullName || (target as any)?.tenantProfiles?.[0]?.user?.fullName || target?.tenantName || '';
    let rId = target?.roomId || target?.room?.id || target?.id || '';
    let rNum = String(target?.room?.roomNumber || target?.roomNumber || '');
    let bId = target?.id && target?.totalAmount !== undefined ? target.id : (target?.bills?.[0]?.id || '');
    let due = Number(
      target?.balanceDue ?? target?.due ?? target?.totalDue ?? target?.totalAmount ?? 0
    );

    // If target is a room summary with bills attached, pick the unpaid bill
    if (target?.bills && target.bills.length > 0) {
      const unpaidB = target.bills.filter((b: any) => (b.balanceDue || 0) > 0);
      const chosenBill = unpaidB[0] || target.bills[0];
      if (chosenBill) {
        bId = chosenBill.id;
        tId = chosenBill.tenantId || tId;
        tName = chosenBill.tenant?.fullName || tName;
        rId = chosenBill.roomId || rId;
        rNum = String(chosenBill.roomNumber || chosenBill.room?.roomNumber || rNum);
      }
    }

    // If tenant is still missing, lookup room in state
    if (!tId && rNum) {
      const matched = rooms.find((r) => String(r.roomNumber) === rNum);
      if (matched) {
        rId = matched.id;
        const tenantProf = (matched as any).tenantProfiles?.[0];
        if (tenantProf) {
          tId = tenantProf.userId || tenantProf.user?.id || '';
          tName = tenantProf.user?.fullName || tName;
        }
      }
    }

    // If no target provided at all (from header), select the first room with outstanding dues
    if (!tId) {
      const occupiedWithDue = rooms.find((r) => {
        const tProf = (r as any).tenantProfiles?.[0];
        return r.status === 'OCCUPIED' && tProf;
      });
      if (occupiedWithDue) {
        const tProf = (occupiedWithDue as any).tenantProfiles[0];
        rId = occupiedWithDue.id;
        rNum = String(occupiedWithDue.roomNumber);
        tId = tProf.userId || tProf.user?.id || '';
        tName = tProf.user?.fullName || '';
      }
    }

    const tBills = tId ? bills.filter((b) => b.tenantId === tId) : [];
    const totalDue = tBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);
    const targetDue = due > 0 ? due : totalDue;

    setCashForm({
      roomId: rId,
      tenantId: tId,
      tenantName: tName || 'Tenant',
      roomNumber: rNum,
      billId: bId || (tBills.find((b) => (b.balanceDue || 0) > 0)?.id || ''),
      amount: targetDue > 0 ? String(targetDue) : '',
      maxDue: targetDue,
      paymentDateBS: today.nepaliFormatted,
      notes: 'Direct Cash Payment received by Admin',
    });
    setCashModalOpen(true);
  };

  const handleRecordCashPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashForm.tenantId) {
      toast.warning('Please select a tenant with outstanding dues.');
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
      loadBills();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record cash payment');
    } finally {
      setCashSubmitting(false);
    }
  };

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjForm.roomId || !adjForm.tenantId || !adjForm.amount) {
      toast.warning('Please fill in all adjustment fields');
      return;
    }

    try {
      await api.post('/adjustments', {
        ...adjForm,
        yearBS: selectedYearBS,
        monthBS: selectedMonthBS,
        amount: Number(adjForm.amount),
      });
      broadcastSync('bill');
      setAdjModalOpen(false);
      setAdjForm({ tenantId: '', roomId: '', type: 'DISCOUNT', amount: '', reason: '' });
      loadBills();
      toast.success('Adjustment created successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create adjustment');
    }
  };

  const totalBilled = bills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const totalPaid = bills.reduce((sum, b) => sum + (b.paidAmount || 0), 0);
  const totalDue = bills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);

  // Compute room-wise totals dynamically for all configured rooms
  const sortedRooms = [...rooms].sort((a, b) => a.roomNumber - b.roomNumber);
  const allRoomNumbers = Array.from(
    new Set([
      ...sortedRooms.map((r) => r.roomNumber),
      ...bills.map((b) => b.roomNumber || b.room?.roomNumber).filter(Boolean),
    ])
  ).sort((a, b) => a - b);

  const roomSummaries = (allRoomNumbers.length > 0 ? allRoomNumbers : sortedRooms.map((r) => r.roomNumber)).map((roomNum) => {
    const roomObj = rooms.find((r) => r.roomNumber === roomNum) || {
      id: '',
      roomNumber: roomNum,
      status: 'VACANT',
      name: `Room ${roomNum}`,
    };
    const roomBills = bills.filter(
      (b) =>
        b.roomNumber === roomNum ||
        b.room?.roomNumber === roomNum ||
        (roomObj.id && b.roomId === roomObj.id)
    );
    const roomTotalBilled = roomBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const roomPaid = roomBills.reduce((sum, b) => sum + (b.paidAmount || 0), 0);
    const roomDue = roomBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);
    const activeTenant =
      roomObj.tenant ||
      (roomObj as any).tenantProfiles?.[0]?.user ||
      roomBills[0]?.tenant ||
      null;
    const tenantId =
      activeTenant?.id ||
      (roomObj as any).tenantProfiles?.[0]?.userId ||
      roomBills[0]?.tenantId ||
      '';
    const tenantName =
      activeTenant?.fullName || (roomBills.length > 0 ? roomBills[0]?.tenant?.fullName : null);

    return {
      id: roomObj.id || roomBills[0]?.roomId || '',
      roomId: roomObj.id || roomBills[0]?.roomId || '',
      roomNumber: roomNum,
      roomName: roomObj.name || `Room ${roomNum}`,
      status: roomObj.status || (roomBills.length > 0 ? 'OCCUPIED' : 'VACANT'),
      tenantId,
      tenant: activeTenant,
      tenantName,
      billsCount: roomBills.length,
      totalBilled: roomTotalBilled,
      paid: roomPaid,
      due: roomDue,
      bills: roomBills,
    };
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="Finances & Invoicing"
        title="Monthly Bills & Invoices"
        subtitle={
          viewMode === 'unpaid'
            ? 'Consolidated view of all unpaid and partially-settled dues across all rooms'
            : `Itemized billing breakdown and generation for ${NEPALI_MONTH_NAMES[selectedMonthBS - 1]} ${selectedYearBS} BS`
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => handleOpenCashPayment()}
              variant="success"
              size="sm"
              className="font-bold shadow-xs"
            >
              <Banknote className="w-4 h-4" />
              <span>Record Cash Payment</span>
            </Button>
            {viewMode === 'monthly' && (
              <Button
                onClick={() => setAdjModalOpen(true)}
                variant="outline"
                size="sm"
              >
                <Tag className="w-4 h-4" />
                <span>+ Adjustment</span>
              </Button>
            )}
          </div>
        }
      />

      {/* View Mode Switcher & Period Selector Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Toggle Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode('unpaid')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'unpaid'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>All Unpaid Dues</span>
            {unpaidCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                {unpaidCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setViewMode('monthly')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'monthly'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>By Selected Month</span>
          </button>
        </div>

        {/* Month Selector for Monthly Mode */}
        {viewMode === 'monthly' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-600">Period BS:</span>
            <select
              value={selectedYearBS}
              onChange={(e) => setSelectedYearBS(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
            >
              {Array.from({ length: 20 }).map((_, idx) => {
                const y = 2080 + idx;
                return (
                  <option key={y} value={y}>
                    {y} BS
                  </option>
                );
              })}
            </select>
            <select
              value={selectedMonthBS}
              onChange={(e) => setSelectedMonthBS(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
            >
              {NEPALI_MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Financial Overview Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          variant={viewMode === 'unpaid' ? 'danger' : 'primary'}
          title={viewMode === 'unpaid' ? 'Total Outstanding Balance' : 'Total Billed Amount'}
          value={formatCurrencyNPR(viewMode === 'unpaid' ? totalDue : totalBilled)}
          badge={viewMode === 'unpaid' ? `${bills.length} Pending Bills` : 'Period Cost'}
          icon={<AlertCircle className="w-5 h-5" />}
          subtitle={
            viewMode === 'unpaid'
              ? 'Unsettled balances across all rooms'
              : `Rent, utilities & extras for this month`
          }
        />

        <StatCard
          variant="success"
          title={viewMode === 'unpaid' ? 'Gross Billed Total' : 'Collected Amount'}
          value={formatCurrencyNPR(viewMode === 'unpaid' ? totalBilled : totalPaid)}
          badge={viewMode === 'unpaid' ? 'Period Ledger' : 'Verified Collections'}
          icon={<TrendingUp className="w-5 h-5" />}
          subtitle={
            viewMode === 'unpaid'
              ? 'Original charge before payments'
              : 'Direct cash + verified online payments'
          }
        />

        <StatCard
          variant={totalDue > 0 ? 'warning' : 'neutral'}
          title={viewMode === 'unpaid' ? 'Total Paid Toward Dues' : 'Balance Remaining Due'}
          value={formatCurrencyNPR(viewMode === 'unpaid' ? totalPaid : totalDue)}
          badge={totalDue > 0 ? 'Action Needed' : 'Fully Settled'}
          icon={<CheckCircle2 className="w-5 h-5" />}
          subtitle={
            viewMode === 'unpaid'
              ? 'Partial payments made'
              : 'Remaining receivables for this period'
          }
        />
      </div>

      {/* Room Summary Cards (Rooms 1 through 6) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            {viewMode === 'unpaid' ? 'Room-by-Room Outstanding Dues' : 'Monthly Room Summary'}
          </h3>
          <span className="text-xs text-slate-500">{roomSummaries.length} Rooms Status</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roomSummaries.map((room) => {
            const hasDue = room.due > 0;
            const isFullyPaid = room.totalBilled > 0 && room.due === 0;

            return (
              <div
                key={room.roomNumber}
                className={`rounded-2xl border p-4 shadow-card transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5 flex flex-col justify-between ${
                  hasDue
                    ? 'border-rose-200/90 bg-gradient-to-br from-rose-50/30 via-white to-white'
                    : isFullyPaid
                    ? 'border-emerald-200/90 bg-gradient-to-br from-emerald-50/20 via-white to-white'
                    : 'border-slate-200/80 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div>
                      <span className="text-sm font-extrabold text-slate-900 tracking-tight">
                        Room {room.roomNumber < 10 ? `0${room.roomNumber}` : room.roomNumber}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium block truncate max-w-[140px]">
                        {room.tenantName || <span className="text-slate-400 italic">Vacant</span>}
                      </span>
                    </div>

                    {hasDue ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                        Due: {formatCurrencyNPR(room.due)}
                      </span>
                    ) : isFullyPaid ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        Paid in Full
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        {room.status === 'OCCUPIED' ? 'No Dues' : 'Vacant'}
                      </span>
                    )}
                  </div>

                  {/* Financial Grid */}
                  <div className="grid grid-cols-3 gap-2 py-3 border-b border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">
                        Total
                      </span>
                      <span className="font-mono font-bold text-slate-900 text-xs block mt-0.5">
                        {formatCurrencyNPR(room.totalBilled)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">
                        Paid
                      </span>
                      <span className="font-mono font-bold text-emerald-700 text-xs block mt-0.5">
                        {formatCurrencyNPR(room.paid)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">
                        Due
                      </span>
                      <span
                        className={`font-mono font-bold text-xs block mt-0.5 ${
                          hasDue ? 'text-rose-700' : 'text-slate-700'
                        }`}
                      >
                        {formatCurrencyNPR(room.due)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[11px] text-slate-400">
                    {room.billsCount > 0
                      ? `${room.billsCount} bill${room.billsCount === 1 ? '' : 's'}`
                      : '0 bills'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {hasDue && (
                      <Button
                        variant="success"
                        size="xs"
                        onClick={() => handleOpenCashPayment(room)}
                      >
                        Pay Cash
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={!room.bills || room.bills.length === 0}
                      onClick={() => {
                        if (room.bills && room.bills.length > 0) {
                          if (viewMode === 'unpaid') {
                            handleOpenMultiBreakdown(room.bills.map((b: any) => b.id));
                          } else {
                            handleOpenBreakdown(room.bills[0].id);
                          }
                        }
                      }}
                    >
                      Breakdown &rarr;
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoices List / Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Detailed Invoice Records</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Itemized rent, electricity, water, internet, and payment status
            </p>
          </div>
        </CardHeader>

        {loading ? (
          <div className="p-4">
            <SkeletonTable rows={6} cols={6} />
          </div>
        ) : bills.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Receipt className="w-6 h-6 text-indigo-500" />}
              title="No bills found for this filter"
              description={
                viewMode === 'unpaid'
                  ? 'All room bills are completely paid up!'
                  : `No recorded bills found for ${NEPALI_MONTH_NAMES[selectedMonthBS - 1]} ${selectedYearBS}. Bills are calculated automatically upon recording room activities.`
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold">
                  <th className="px-4 py-3">Room & Tenant</th>
                  <th className="px-4 py-3">Billing Period</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Total Bill</th>
                  <th className="px-4 py-3">Paid Amount</th>
                  <th className="px-4 py-3">Balance Due</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {bills.map((b) => {
                  const rNum = b.room?.roomNumber || b.roomNumber;
                  const tName = b.tenant?.fullName || 'Tenant';
                  const isDue = (b.balanceDue || 0) > 0;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">Room {rNum}</div>
                        <div className="text-[11px] text-slate-500">{tName}</div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-700">
                        {b.billingPeriodBS || `${b.yearBS} ${b.monthNameBS}`}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                        {formatCurrencyNPR(b.totalAmount)}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-semibold text-emerald-700">
                        {formatCurrencyNPR(b.paidAmount)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`font-mono font-bold text-xs ${
                            isDue ? 'text-rose-700' : 'text-slate-700'
                          }`}
                        >
                          {formatCurrencyNPR(b.balanceDue)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {isDue && (
                            <Button
                              variant="success"
                              size="xs"
                              onClick={() => handleOpenCashPayment(b)}
                            >
                              Pay Cash
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => handleOpenBreakdown(b.id)}
                          >
                            Breakdown
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleOpenCorrect(b)}
                            title="Correct / Adjust Bill"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Bill Breakdown Modal — Visually organized hierarchy */}
      {breakdownModalOpen && selectedBillBreakdown && (
        <Modal
          isOpen={true}
          onClose={() => setBreakdownModalOpen(false)}
          title={`Bill Breakdown & Itemized Calculations`}
          description={
            selectedBillBreakdown.isMultiMonth
              ? `Combined multi-month statement across ${
                  selectedBillBreakdown.monthsCount || selectedBillBreakdown.bills?.length
                } periods`
              : `Statement for ${
                  selectedBillBreakdown.billingPeriodBS ||
                  `${selectedBillBreakdown.yearBS} ${selectedBillBreakdown.monthNameBS}`
                }`
          }
          icon={<Receipt className="w-5 h-5 text-indigo-600" />}
          maxWidth="xl"
        >
          {(() => {
            const billList = selectedBillBreakdown.bills || [selectedBillBreakdown];
            const isMulti = selectedBillBreakdown.isMultiMonth;

            return (
              <div className="space-y-4 text-xs">
                {/* Statement Header Card */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-card">
                  <div>
                    <span className="text-[11px] text-indigo-300 font-bold uppercase tracking-wider block">
                      Room {selectedBillBreakdown.room?.roomNumber || selectedBillBreakdown.roomNumber || '—'}
                    </span>
                    <h4 className="text-base font-extrabold mt-0.5">
                      {selectedBillBreakdown.tenant?.fullName || selectedBillBreakdown.tenantName || 'Resident Statement'}
                    </h4>
                  </div>
                  <div className="text-right sm:text-right">
                    <span className="text-[10px] text-indigo-300 uppercase block font-semibold">
                      Total Balance Due
                    </span>
                    <span className="text-xl font-extrabold text-rose-300 font-mono">
                      {formatCurrencyNPR(
                        selectedBillBreakdown.balanceDue ??
                        selectedBillBreakdown.totalOutstanding ??
                        selectedBillBreakdown.totalDue ??
                        0
                      )}
                    </span>
                  </div>
                </div>

                {/* Iterate through months */}
                <div className="space-y-3.5 max-h-[50vh] overflow-y-auto pr-1">
                  {billList.map((b: any, idx: number) => {
                    const breakdown = b.breakdown || {};
                    return (
                      <div
                        key={b.id || idx}
                        className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-mono font-bold text-[10px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">
                              {b.monthNameBS} {b.yearBS} BS
                            </span>
                          </div>
                          <StatusBadge status={b.status} />
                        </div>

                        {/* Visually Separated Line Items */}
                        <div className="divide-y divide-slate-200/60 space-y-1.5">
                          {/* 1. Base Rent */}
                          <div className="flex items-center justify-between pt-1.5">
                            <div className="flex items-center gap-2">
                              <Home className="w-3.5 h-3.5 text-indigo-500" />
                              <span className="font-semibold text-slate-700">Base Room Rent</span>
                            </div>
                            <span className="font-mono font-bold text-slate-900">
                              {formatCurrencyNPR(b.rentAmount)}
                            </span>
                          </div>

                          {/* 2. Electricity */}
                          <div className="pt-1.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Zap className="w-3.5 h-3.5 text-amber-500" />
                                <span className="font-semibold text-slate-700">
                                  Electricity Meter Charge
                                </span>
                              </div>
                              <span className="font-mono font-bold text-slate-900">
                                {formatCurrencyNPR(b.electricityAmount)}
                              </span>
                            </div>
                            {breakdown.electricity && (
                              <div className="text-[10px] text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 font-mono">
                                {breakdown.electricity.units} units @ Rs.{' '}
                                {breakdown.electricity.unitRate}/unit (Reading:{' '}
                                {breakdown.electricity.previousReading} &rarr;{' '}
                                {breakdown.electricity.currentReading})
                              </div>
                            )}
                          </div>

                          {/* 3. Water */}
                          {b.waterAmount > 0 && (
                            <div className="pt-1.5 space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Droplets className="w-3.5 h-3.5 text-blue-500" />
                                  <span className="font-semibold text-slate-700">Drinking Water</span>
                                </div>
                                <span className="font-mono font-bold text-slate-900">
                                  {formatCurrencyNPR(b.waterAmount)}
                                </span>
                              </div>
                              {breakdown.water?.items && (
                                <div className="text-[10px] text-slate-500 bg-white p-1.5 rounded border border-slate-200 space-y-0.5">
                                  {breakdown.water.items.map((item: any) => (
                                    <div key={item.id} className="flex justify-between">
                                      <span>
                                        {item.quantity} jar(s) @ Rs. {item.pricePerUnit}{' '}
                                        {item.purchaseDateBS ? `(${item.purchaseDateBS})` : ''}
                                      </span>
                                      <span className="font-mono font-semibold">
                                        {formatCurrencyNPR(item.totalAmount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 4. Internet */}
                          <div className="flex items-center justify-between pt-1.5">
                            <div className="flex items-center gap-2">
                              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="font-semibold text-slate-700">Internet Service</span>
                            </div>
                            <span className="font-mono font-bold text-slate-900">
                              {formatCurrencyNPR(b.internetAmount)}
                            </span>
                          </div>

                          {/* 5. Garbage */}
                          <div className="flex items-center justify-between pt-1.5">
                            <div className="flex items-center gap-2">
                              <Trash className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-semibold text-slate-700">
                                Garbage Management Fee
                              </span>
                            </div>
                            <span className="font-mono font-bold text-slate-900">
                              {formatCurrencyNPR(b.garbageAmount ?? 100)}
                            </span>
                          </div>

                          {/* 6. Custom Purchases / Extras */}
                          {b.customPurchasesAmount > 0 && (
                            <div className="pt-1.5 space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <ShoppingBag className="w-3.5 h-3.5 text-purple-500" />
                                  <span className="font-semibold text-slate-700">
                                    Custom Purchases / Extras
                                  </span>
                                </div>
                                <span className="font-mono font-bold text-slate-900">
                                  {formatCurrencyNPR(b.customPurchasesAmount)}
                                </span>
                              </div>
                              {breakdown.customPurchases?.items && (
                                <div className="text-[10px] text-slate-500 bg-white p-1.5 rounded border border-slate-200 space-y-0.5">
                                  {breakdown.customPurchases.items.map((item: any) => (
                                    <div key={item.id} className="flex justify-between">
                                      <span>
                                        {item.itemName} (x{item.quantity} @ Rs. {item.unitPrice})
                                      </span>
                                      <span className="font-mono font-semibold">
                                        {formatCurrencyNPR(item.totalAmount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 7. Adjustments */}
                          {b.adjustmentsAmount !== 0 && (
                            <div className="flex items-center justify-between pt-1.5 text-amber-700">
                              <div className="flex items-center gap-2">
                                <Tag className="w-3.5 h-3.5" />
                                <span className="font-semibold">Billing Adjustments / Credits</span>
                              </div>
                              <span className="font-mono font-bold">
                                {formatCurrencyNPR(b.adjustmentsAmount)}
                              </span>
                            </div>
                          )}

                          {/* 8. Advance Credit Deduction */}
                          {b.advanceDeductedAmount > 0 && (
                            <div className="flex items-center justify-between pt-1.5 text-purple-700">
                              <div className="flex items-center gap-2">
                                <PiggyBank className="w-3.5 h-3.5" />
                                <span className="font-semibold">Advance Balance Applied</span>
                              </div>
                              <span className="font-mono font-bold">
                                -{formatCurrencyNPR(b.advanceDeductedAmount)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Month Total & Due */}
                        <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between font-bold">
                          <span className="text-slate-600">
                            Total: {formatCurrencyNPR(b.totalAmount)} | Paid:{' '}
                            {formatCurrencyNPR(b.paidAmount)}
                          </span>
                          <span className="text-rose-700 font-mono text-sm">
                            Due: {formatCurrencyNPR(b.balanceDue)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer Action Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBreakdownModalOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    variant="success"
                    size="sm"
                    className="font-bold"
                    onClick={() => {
                      setBreakdownModalOpen(false);
                      handleOpenCashPayment(selectedBillBreakdown);
                    }}
                  >
                    Record Payment for this Bill &rarr;
                  </Button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Adjustments Modal */}
      {adjModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setAdjModalOpen(false)}
          title="Add Billing Adjustment"
          description={`Apply a discount, fine, or custom fee for ${NEPALI_MONTH_NAMES[selectedMonthBS - 1]} ${selectedYearBS}`}
          icon={<Tag className="w-5 h-5 text-indigo-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handleCreateAdjustment} className="space-y-3.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Room <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={adjForm.roomId}
                onChange={(e) => {
                  const rId = e.target.value;
                  const r = rooms.find((rm) => rm.id === rId);
                  setAdjForm({
                    ...adjForm,
                    roomId: rId,
                    tenantId: r?.tenant?.id || '',
                  });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 bg-white"
              >
                <option value="">-- Select Room --</option>
                {rooms
                  .filter((r) => r.status === 'OCCUPIED' && r.tenant)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.roomNumber} &mdash; {r.tenant.fullName}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Adjustment Type
              </label>
              <select
                value={adjForm.type}
                onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 bg-white"
              >
                <option value="DISCOUNT">Discount (Deduction)</option>
                <option value="FINE">Late Fine / Extra Fee</option>
                <option value="CREDIT">Special Credit</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Amount (NPR) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                value={adjForm.amount}
                onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })}
                placeholder="e.g. 500"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Reason / Explanation
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Maintenance inconvenience waiver"
                value={adjForm.reason}
                onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdjModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="font-bold">
                Apply Adjustment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Bill Line-Items Correction Modal */}
      {correctModalOpen && correctingBill && (
        <Modal
          isOpen={true}
          onClose={() => setCorrectModalOpen(false)}
          title={`Correct Bill — Room ${correctingBill.room?.roomNumber || correctingBill.roomNumber}`}
          description={`Override line items and recalculate statement for ${correctingBill.monthNameBS} ${correctingBill.yearBS}`}
          icon={<Edit2 className="w-5 h-5 text-indigo-600" />}
          maxWidth="md"
        >
          <form onSubmit={handleSaveCorrection} className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Rent</label>
                <input
                  type="number"
                  value={correctForm.rentAmount}
                  onChange={(e) =>
                    setCorrectForm({ ...correctForm, rentAmount: e.target.value })
                  }
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Electricity</label>
                <input
                  type="number"
                  value={correctForm.electricityAmount}
                  onChange={(e) =>
                    setCorrectForm({ ...correctForm, electricityAmount: e.target.value })
                  }
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Water</label>
                <input
                  type="number"
                  value={correctForm.waterAmount}
                  onChange={(e) =>
                    setCorrectForm({ ...correctForm, waterAmount: e.target.value })
                  }
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Internet</label>
                <input
                  type="number"
                  value={correctForm.internetAmount}
                  onChange={(e) =>
                    setCorrectForm({ ...correctForm, internetAmount: e.target.value })
                  }
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Garbage</label>
                <input
                  type="number"
                  value={correctForm.garbageAmount}
                  onChange={(e) =>
                    setCorrectForm({ ...correctForm, garbageAmount: e.target.value })
                  }
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Adjustments
                </label>
                <input
                  type="number"
                  value={correctForm.adjustmentsAmount}
                  onChange={(e) =>
                    setCorrectForm({ ...correctForm, adjustmentsAmount: e.target.value })
                  }
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Reason for Correction <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Adjusted water reading dispute"
                value={correctForm.correctionReason}
                onChange={(e) =>
                  setCorrectForm({ ...correctForm, correctionReason: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCorrectModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="font-bold" disabled={correctSubmitting}>
                {correctSubmitting ? 'Saving...' : 'Save & Recalculate Bill'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Cash Payment Modal */}
      {cashModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setCashModalOpen(false)}
          title={`Record Cash Payment — ${cashForm.tenantName}`}
          description={`Clear balance for Room ${cashForm.roomNumber || '—'}`}
          icon={<Banknote className="w-5 h-5 text-emerald-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handleRecordCashPayment} className="space-y-3.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Amount Received (NPR) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">Rs.</span>
                <input
                  type="number"
                  required
                  min={1}
                  value={cashForm.amount}
                  onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })}
                  placeholder="Amount"
                  className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono font-bold text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              {cashForm.maxDue > 0 && (
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCashForm({ ...cashForm, amount: String(cashForm.maxDue) })
                    }
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
                  >
                    Clear Full Due (Rs. {cashForm.maxDue})
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Payment Date (BS)</label>
              <NepaliDatePicker
                value={cashForm.paymentDateBS}
                onChange={(formattedBS) =>
                  setCashForm({ ...cashForm, paymentDateBS: formattedBS })
                }
                placeholder="Select date"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Notes (Optional)</label>
              <input
                type="text"
                value={cashForm.notes}
                onChange={(e) => setCashForm({ ...cashForm, notes: e.target.value })}
                placeholder="e.g. Received in cash"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
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
                className="font-bold"
              >
                {cashSubmitting ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
