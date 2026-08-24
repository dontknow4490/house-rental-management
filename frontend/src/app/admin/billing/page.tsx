'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS, NEPALI_MONTH_NAMES } from '@/lib/nepali-date';
import { NepaliDatePicker } from '@/components/NepaliDatePicker';
import { useToast } from '@/lib/toast-context';

export default function AdminBillingPage() {
  const toast = useToast();
  const [viewMode, setViewMode] = useState<'unpaid' | 'monthly'>('unpaid');
  const [bills, setBills] = useState<any[]>([]);
  const [unpaidCount, setUnpaidCount] = useState<number>(0);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

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
  const [correctingBill, setCorrectingBill] = useState<any>(null);
  const [correctForm, setCorrectForm] = useState({
    rentAmount: '',
    electricityAmount: '',
    internetAmount: '',
    garbageAmount: '',
    waterAmount: '',
    borrowingAmount: '',
    adjustmentsAmount: '',
    correctionReason: '',
  });

  const loadBills = async () => {
    try {
      setLoading(true);
      const url =
        viewMode === 'unpaid'
          ? '/billing/all?unpaidOnly=true'
          : `/billing/all?yearBS=${selectedYearBS}&monthBS=${selectedMonthBS}`;

      const [bData, rData] = await Promise.all([
        api.get(url),
        api.get('/rooms'),
      ]);
      setBills(bData);
      setRooms(rData);

      if (viewMode === 'unpaid') {
        setUnpaidCount(bData.length);
      } else {
        // Also fetch unpaid count silently in background
        api.get('/billing/all?unpaidOnly=true').then((res) => {
          if (Array.isArray(res)) setUnpaidCount(res.length);
        }).catch(() => {});
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

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      await api.post('/billing/generate', {
        yearBS: selectedYearBS,
        monthBS: selectedMonthBS,
      });
      loadBills();
      toast.success(`Monthly bills generated for ${NEPALI_MONTH_NAMES[selectedMonthBS - 1]} ${selectedYearBS}.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate bills');
    } finally {
      setGenerating(false);
    }
  };

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
      borrowingAmount: String(bill.borrowingAmount ?? 0),
      adjustmentsAmount: String(bill.adjustmentsAmount ?? 0),
      correctionReason: bill.correctionReason || '',
    });
    setCorrectModalOpen(true);
  };

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingBill) return;
    if (!correctForm.correctionReason.trim()) {
      toast.warning('Please enter a reason for this bill correction.');
      return;
    }

    try {
      await api.put(`/billing/${correctingBill.id}/correct`, {
        rentAmount: Number(correctForm.rentAmount),
        electricityAmount: Number(correctForm.electricityAmount),
        internetAmount: Number(correctForm.internetAmount),
        garbageAmount: Number(correctForm.garbageAmount),
        waterAmount: Number(correctForm.waterAmount),
        borrowingAmount: Number(correctForm.borrowingAmount),
        adjustmentsAmount: Number(correctForm.adjustmentsAmount),
        correctionReason: correctForm.correctionReason.trim(),
      });
      setCorrectModalOpen(false);
      setCorrectingBill(null);
      loadBills();
      toast.success('Bill updated and recalculated successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to correct bill');
    }
  };

  const handleOpenCashPayment = (target?: any) => {
    const today = getTodayBS();
    if (target?.tenantId || target?.tenant?.id) {
      const tId = target.tenantId || target.tenant?.id;
      const tName = target.tenant?.fullName || target.tenantName || 'Tenant';
      const rId = target.roomId || target.room?.id || '';
      const rNum = String(target.room?.roomNumber || target.roomNumber || '');
      const bId = target.id && target.totalAmount !== undefined ? target.id : '';
      const due = Number(target.balanceDue ?? target.due ?? target.totalDue ?? target.totalAmount ?? 0);

      // Check if this room has an active tenant that is different or if room is vacant
      const matchedRoom = rooms.find((rm) => rm.id === rId);
      const isMovedOut = !matchedRoom || matchedRoom.tenant?.id !== tId;

      setCashForm({
        roomId: isMovedOut ? 'MOVED_OUT' : (rId || ''),
        tenantId: tId,
        tenantName: tName,
        roomNumber: rNum,
        billId: bId,
        amount: due > 0 ? String(due) : '',
        maxDue: due,
        paymentDateBS: today.nepaliFormatted,
        notes: 'Direct Cash Payment received by Admin',
      });
    } else {
      // Find first occupied room with due
      const occupiedWithDue = rooms.find((r) => r.status === 'OCCUPIED' && r.tenant);
      const tId = occupiedWithDue?.tenant?.id || '';
      const tBills = tId ? bills.filter((b) => b.tenantId === tId) : [];
      const totalDue = tBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);
      const unpaidBills = tBills.filter((b) => b.balanceDue > 0);

      setCashForm({
        roomId: occupiedWithDue?.id || '',
        tenantId: tId,
        tenantName: occupiedWithDue?.tenant?.fullName || '',
        roomNumber: String(occupiedWithDue?.roomNumber || ''),
        billId: unpaidBills[0]?.id || '',
        amount: totalDue > 0 ? String(totalDue) : '',
        maxDue: totalDue,
        paymentDateBS: today.nepaliFormatted,
        notes: 'Direct Cash Payment received by Admin',
      });
    }
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

    try {
      setCashSubmitting(true);
      const res = await api.post('/payments/cash-payment', {
        tenantId: cashForm.tenantId,
        billId: cashForm.billId || undefined,
        amount: amt,
        paymentDateBS: cashForm.paymentDateBS,
        notes: cashForm.notes,
      });
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

  // Compute room-wise totals for all rooms (Rooms 1 through 6)
  const roomSummaries = Array.from({ length: 6 }, (_, i) => {
    const roomNum = i + 1;
    const roomObj = rooms.find((r) => r.roomNumber === roomNum) || {
      id: '',
      roomNumber: roomNum,
      status: 'VACANT',
      name: `Room ${roomNum}`,
    };
    const roomBills = bills.filter(
      (b) => b.roomNumber === roomNum || b.room?.roomNumber === roomNum || (roomObj.id && b.roomId === roomObj.id)
    );
    const roomTotalBilled = roomBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const roomPaid = roomBills.reduce((sum, b) => sum + (b.paidAmount || 0), 0);
    const roomDue = roomBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);
    const activeTenant = roomObj.tenant || roomBills[0]?.tenant || null;
    const tenantName = activeTenant?.fullName || (roomBills.length > 0 ? roomBills[0]?.tenant?.fullName : null);

    return {
      roomNumber: roomNum,
      roomName: roomObj.name || `Room ${roomNum}`,
      status: roomObj.status || (roomBills.length > 0 ? 'OCCUPIED' : 'VACANT'),
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
      {/* Header & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Billing & Invoices</h2>
          <p className="text-xs text-slate-500">
            {viewMode === 'unpaid'
              ? 'Consolidated view of all unpaid & partially-paid billing periods across months'
              : 'Generate bills and review itemized calculations by specific month'}
          </p>
        </div>

        {/* Actions & View Toggle Tabs */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto text-xs">
          <button
            type="button"
            onClick={() => handleOpenCashPayment()}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <span>+ Record Cash Payment</span>
          </button>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('unpaid')}
              className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1.5 ${
                viewMode === 'unpaid'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>All Unpaid Months</span>
              {unpaidCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                  {unpaidCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                viewMode === 'monthly'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              By Selected Month
            </button>
          </div>
        </div>
      </div>

      {/* Controls Bar for Monthly Mode */}
      {viewMode === 'monthly' && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Select Period:</span>
            <select
              value={selectedYearBS}
              onChange={(e) => setSelectedYearBS(Number(e.target.value))}
              className="px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-slate-900 font-medium"
            >
              {Array.from({ length: 25 }).map((_, idx) => {
                const y = 2075 + idx;
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
              className="px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-slate-900 font-medium"
            >
              {NEPALI_MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAdjModalOpen(true)}
              className="px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium"
            >
              + Adjustment
            </button>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Bills'}
            </button>
          </div>
        </div>
      )}

      {/* Overall Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-sm">
          <div className="text-slate-500 font-medium">
            {viewMode === 'unpaid' ? 'Total Outstanding Amount (All Unpaid)' : 'Total Billed (This Month)'}
          </div>
          <div className={`text-lg font-bold mt-1 font-mono ${viewMode === 'unpaid' ? 'text-rose-700' : 'text-slate-900'}`}>
            {formatCurrencyNPR(viewMode === 'unpaid' ? totalDue : totalBilled)}
          </div>
          {viewMode === 'unpaid' && (
            <div className="text-[11px] text-slate-500 mt-0.5">
              Combined balance across {bills.length} unpaid bill{bills.length === 1 ? '' : 's'}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-sm">
          <div className="text-slate-500 font-medium">
            {viewMode === 'unpaid' ? 'Total Period Cost Billed' : 'Collected (This Month)'}
          </div>
          <div className={`text-lg font-bold mt-1 font-mono ${viewMode === 'unpaid' ? 'text-slate-900' : 'text-emerald-700'}`}>
            {formatCurrencyNPR(viewMode === 'unpaid' ? totalBilled : totalPaid)}
          </div>
          {viewMode === 'unpaid' && (
            <div className="text-[11px] text-slate-500 mt-0.5">
              Original full total before payments
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-sm">
          <div className="text-slate-500 font-medium">
            {viewMode === 'unpaid' ? 'Paid / Verified So Far' : 'Outstanding Balance (This Month)'}
          </div>
          <div className={`text-lg font-bold mt-1 font-mono ${viewMode === 'unpaid' ? 'text-emerald-700' : 'text-rose-700'}`}>
            {formatCurrencyNPR(viewMode === 'unpaid' ? totalPaid : totalDue)}
          </div>
          {viewMode === 'unpaid' && (
            <div className="text-[11px] text-slate-500 mt-0.5">
              Partial payments applied to these bills
            </div>
          )}
        </div>
      </div>

      {/* Room-Wise Total Bill & Due Overview */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Room-Wise Total Bills & Due
            </h3>
            <p className="text-[11px] text-slate-500">
              {viewMode === 'unpaid'
                ? 'Unpaid balance and billed totals broken down separately per room'
                : `Breakdown for ${NEPALI_MONTH_NAMES[selectedMonthBS - 1]} ${selectedYearBS} per room`}
            </p>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            6 Rooms Total
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {roomSummaries.map((room) => {
            const hasBills = room.billsCount > 0;
            const hasDue = room.due > 0;
            const isFullyPaid = hasBills && room.due === 0 && room.totalBilled > 0;

            return (
              <div
                key={room.roomNumber}
                className={`p-3.5 rounded-lg border text-xs transition space-y-2.5 ${
                  hasDue
                    ? 'border-rose-200 bg-rose-50/30'
                    : isFullyPaid
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-bold text-slate-900 text-sm">
                      Room {room.roomNumber}
                    </span>
                    <span className="text-[11px] text-slate-600 block truncate max-w-[140px]">
                      {room.tenantName ? room.tenantName : <span className="text-slate-400 italic">Vacant</span>}
                    </span>
                  </div>

                  {hasDue ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      Due: {formatCurrencyNPR(room.due)}
                    </span>
                  ) : isFullyPaid ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Paid in Full
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      {room.status === 'OCCUPIED' ? 'No Dues' : 'Vacant'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-200/70 text-[11px]">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Total Bill</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {formatCurrencyNPR(room.totalBilled)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block">Paid</span>
                    <span className="font-semibold text-emerald-700 font-mono">
                      {formatCurrencyNPR(room.paid)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block">Balance Due</span>
                    <span className={`font-bold font-mono ${hasDue ? 'text-rose-700' : 'text-slate-700'}`}>
                      {formatCurrencyNPR(room.due)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-500 font-medium">
                    {room.billsCount > 0
                      ? `${room.billsCount} bill period${room.billsCount === 1 ? '' : 's'}`
                      : 'No bills'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {hasDue && (
                      <button
                        type="button"
                        onClick={() => handleOpenCashPayment(room)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] transition shadow-xs"
                      >
                        <span>Pay Cash</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (room.bills && room.bills.length > 0) {
                          if (viewMode === 'unpaid') {
                            handleOpenMultiBreakdown(room.bills.map((b: any) => b.id));
                          } else {
                            handleOpenBreakdown(room.bills[0].id);
                          }
                        } else {
                          toast.info(`No bills found for Room ${room.roomNumber} in this period.`);
                        }
                      }}
                      disabled={!room.bills || room.bills.length === 0}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium text-[11px] transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span>View Details</span>
                      <span className="text-[10px]">&rarr;</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bills Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            {viewMode === 'unpaid'
              ? `All Unpaid & Partially-Paid Bills (${bills.length})`
              : `Monthly Bills for ${NEPALI_MONTH_NAMES[selectedMonthBS - 1]} ${selectedYearBS} (${bills.length})`}
          </div>
          {viewMode === 'unpaid' && totalDue > 0 && (
            <div className="text-xs font-semibold text-rose-700">
              Combined Due: {formatCurrencyNPR(totalDue)}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Bill #</th>
                <th className="px-4 py-2.5">Billing Period</th>
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Tenant</th>
                <th className="px-4 py-2.5">Rent</th>
                <th className="px-4 py-2.5">Electricity</th>
                <th className="px-4 py-2.5">Garbage</th>
                <th className="px-4 py-2.5">Total Amount</th>
                <th className="px-4 py-2.5">Paid</th>
                <th className="px-4 py-2.5">Remaining Due</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-400">
                    Loading bills...
                  </td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-400">
                    {viewMode === 'unpaid'
                      ? 'No unpaid bills! All tenant periods are fully paid.'
                      : 'No bills generated yet for this period.'}
                  </td>
                </tr>
              ) : (
                bills.map((bill) => {
                  const isPaid = bill.status === 'PAID';
                  const isPending = bill.status === 'PENDING_VERIFICATION';
                  const isPartial = bill.status === 'PARTIALLY_PAID';

                  return (
                    <tr key={bill.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        {bill.billNumber}
                        {bill.correctionReason && (
                          <span className="block text-[10px] text-amber-700 font-sans italic">
                            Edited: {bill.correctionReason}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {bill.billingPeriodBS || `${bill.yearBS} ${bill.monthNameBS}`}
                        </div>
                        {bill.isOngoing ? (
                          <span className="inline-flex mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            Ongoing
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 block">Completed period</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        Room {bill.room?.roomNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{bill.tenant?.fullName}</div>
                        <div className="text-[11px] text-slate-500">{bill.tenant?.phone}</div>
                      </td>
                      <td className="px-4 py-3 font-mono">{formatCurrencyNPR(bill.rentAmount)}</td>
                      <td className="px-4 py-3 font-mono">{formatCurrencyNPR(bill.electricityAmount)}</td>
                      <td className="px-4 py-3 font-mono">{formatCurrencyNPR(bill.garbageAmount ?? 100)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        {formatCurrencyNPR(bill.totalAmount)}
                      </td>
                      <td className="px-4 py-3 font-mono text-emerald-700">
                        {formatCurrencyNPR(bill.paidAmount)}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold">
                        {bill.balanceDue > 0 ? (
                          <span className="text-rose-700">{formatCurrencyNPR(bill.balanceDue)}</span>
                        ) : (
                          <span className="text-emerald-700">{formatCurrencyNPR(0)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isPaid && (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Paid
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Pending Verification
                          </span>
                        )}
                        {isPartial && (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            Partially Paid
                          </span>
                        )}
                        {!isPaid && !isPending && !isPartial && (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            Unpaid
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {bill.balanceDue > 0 && (
                            <button
                              onClick={() => handleOpenCashPayment(bill)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-xs"
                            >
                              <span>Pay Cash</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenBreakdown(bill.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-900 hover:bg-slate-800 text-white transition shadow-xs"
                          >
                            <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>View Details</span>
                          </button>
                          <button
                            onClick={() => handleOpenCorrect(bill)}
                            className="px-2 py-1 text-[11px] font-medium rounded border border-slate-300 hover:bg-slate-100 text-slate-700 transition"
                          >
                            Correct
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bill Correction Modal */}
      {correctModalOpen && correctingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-md w-full shadow-lg text-xs space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Correct Bill &mdash; {correctingBill.billNumber}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Room {correctingBill.room?.roomNumber} | {correctingBill.tenant?.fullName}
                </p>
              </div>
              <button
                onClick={() => setCorrectModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveCorrection} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Room Rent (NPR)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={correctForm.rentAmount}
                    onChange={(e) => setCorrectForm({ ...correctForm, rentAmount: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Electricity (NPR)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={correctForm.electricityAmount}
                    onChange={(e) => setCorrectForm({ ...correctForm, electricityAmount: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Internet (NPR)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={correctForm.internetAmount}
                    onChange={(e) => setCorrectForm({ ...correctForm, internetAmount: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Garbage Charge (NPR)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={correctForm.garbageAmount}
                    onChange={(e) => setCorrectForm({ ...correctForm, garbageAmount: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Water (NPR)</label>
                  <input
                    type="number"
                    min={0}
                    value={correctForm.waterAmount}
                    onChange={(e) => setCorrectForm({ ...correctForm, waterAmount: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Borrowing (NPR)</label>
                  <input
                    type="number"
                    min={0}
                    value={correctForm.borrowingAmount}
                    onChange={(e) => setCorrectForm({ ...correctForm, borrowingAmount: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-700 font-medium mb-1">Adjustments (NPR) &mdash; positive/negative</label>
                  <input
                    type="number"
                    value={correctForm.adjustmentsAmount}
                    onChange={(e) => setCorrectForm({ ...correctForm, adjustmentsAmount: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Reason for Correction <span className="text-rose-600">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={correctForm.correctionReason}
                  onChange={(e) => setCorrectForm({ ...correctForm, correctionReason: e.target.value })}
                  placeholder="Explain why this bill is being edited..."
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCorrectModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium"
                >
                  Save Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bill Breakdown Modal (Single Month or All Unpaid Months) */}
      {breakdownModalOpen && selectedBillBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-xl w-full shadow-2xl text-xs space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <span>{selectedBillBreakdown.isMultiMonth ? 'All Unpaid Months Breakdown' : 'Bill Breakdown'} &mdash;</span>
                  <span className="font-mono text-slate-800">
                    {selectedBillBreakdown.isMultiMonth
                      ? `Room ${selectedBillBreakdown.roomNumber}`
                      : selectedBillBreakdown.billNumber}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  {selectedBillBreakdown.isMultiMonth
                    ? `${selectedBillBreakdown.tenantName} • ${selectedBillBreakdown.count} Unpaid Month(s)`
                    : `${selectedBillBreakdown.monthNameBS} ${selectedBillBreakdown.yearBS} BS`}
                </p>
              </div>
              <button
                onClick={() => setBreakdownModalOpen(false)}
                className="w-6 h-6 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold text-sm"
              >
                &times;
              </button>
            </div>

            {selectedBillBreakdown.isMultiMonth ? (
              /* MULTI-MONTH BREAKDOWN VIEW */
              <div className="space-y-4">
                {/* Top Summary Banner */}
                <div className="bg-rose-50/70 border border-rose-200/80 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-rose-900 block">Total Combined Outstanding</span>
                    <span className="text-[11px] text-rose-700">Sum of all {selectedBillBreakdown.count} unpaid billing periods</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-extrabold font-mono text-rose-900 block">
                      {formatCurrencyNPR(selectedBillBreakdown.totalOutstanding)}
                    </span>
                    <span className="text-[10px] text-rose-700 font-mono">
                      (Billed: {formatCurrencyNPR(selectedBillBreakdown.totalBilled)} | Paid: {formatCurrencyNPR(selectedBillBreakdown.totalPaid)})
                    </span>
                  </div>
                </div>

                {/* List of Months */}
                <div className="space-y-3">
                  {selectedBillBreakdown.bills?.map((b: any, idx: number) => {
                    const statusBadge =
                      b.status === 'PARTIALLY_PAID' ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          Partially Paid
                        </span>
                      ) : b.status === 'PENDING_VERIFICATION' ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                          Pending Verification
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                          Unpaid
                        </span>
                      );

                    return (
                      <div
                        key={b.id}
                        className="bg-slate-50/70 border border-slate-200 rounded-lg p-3 text-xs space-y-2"
                      >
                        {/* Month Header */}
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-900 text-white font-mono font-bold text-[10px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">
                              {b.monthNameBS} {b.yearBS}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              ({b.billingPeriodBS || `${b.yearBS} ${b.monthNameBS}`})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {statusBadge}
                            <button
                              type="button"
                              onClick={() => {
                                setBreakdownModalOpen(false);
                                handleOpenCorrect(b);
                              }}
                              className="text-[10px] text-slate-600 hover:text-slate-900 underline font-medium ml-1"
                            >
                              Edit
                            </button>
                          </div>
                        </div>

                        {/* Itemized Charges for this Month */}
                        <div className="space-y-1 text-slate-700">
                          {/* Room Rent */}
                          <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                            <span className="font-medium">Room Rent</span>
                            <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(b.rentAmount)}</span>
                          </div>

                          {/* Electricity */}
                          <div className="py-0.5 border-b border-slate-200/50 space-y-0.5">
                            <div className="flex justify-between">
                              <span className="font-medium">Electricity Meter Charge</span>
                              <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(b.electricityAmount)}</span>
                            </div>
                            {b.breakdown?.electricity && (
                              <div className="text-[10px] text-slate-500 bg-white/70 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                                {b.breakdown.electricity.units} units @ Rs. {b.breakdown.electricity.unitRate}/unit (Reading: {b.breakdown.electricity.previousReading} &rarr; {b.breakdown.electricity.currentReading})
                              </div>
                            )}
                          </div>

                          {/* Internet */}
                          <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                            <span className="font-medium">{b.breakdown?.internet?.description || 'Internet Charge'}</span>
                            <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(b.internetAmount)}</span>
                          </div>

                          {/* Garbage */}
                          <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                            <span className="font-medium">Garbage Charge (Fixed)</span>
                            <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(b.garbageAmount ?? 100)}</span>
                          </div>

                          {/* Drinking Water */}
                          {b.waterAmount > 0 && (
                            <div className="py-0.5 border-b border-slate-200/50 space-y-0.5">
                              <div className="flex justify-between">
                                <span className="font-medium">Drinking Water</span>
                                <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(b.waterAmount)}</span>
                              </div>
                              {b.breakdown?.water?.items && b.breakdown.water.items.length > 0 && (
                                <div className="text-[10px] text-slate-500 bg-white/70 p-1.5 rounded border border-slate-200 space-y-0.5">
                                  {b.breakdown.water.items.map((item: any) => (
                                    <div key={item.id} className="flex justify-between">
                                      <span>{item.quantity} jar(s) @ Rs. {item.pricePerUnit} {item.purchaseDateBS ? `(${item.purchaseDateBS})` : ''} {item.note ? `- ${item.note}` : ''}</span>
                                      <span className="font-mono font-semibold">{formatCurrencyNPR(item.totalAmount)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Borrowing / Advance */}
                          {b.borrowingAmount > 0 && (
                            <div className="py-0.5 border-b border-slate-200/50 space-y-0.5">
                              <div className="flex justify-between">
                                <span className="font-medium">Borrowed Money / Loan</span>
                                <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(b.borrowingAmount)}</span>
                              </div>
                              {b.breakdown?.borrowing?.items && b.breakdown.borrowing.items.length > 0 && (
                                <div className="text-[10px] text-slate-500 bg-white/70 p-1.5 rounded border border-slate-200 space-y-0.5">
                                  {b.breakdown.borrowing.items.map((item: any) => (
                                    <div key={item.id} className="flex justify-between">
                                      <span>Loan on {item.borrowDateBS || 'BS'} {item.reason ? `(${item.reason})` : ''}</span>
                                      <span className="font-mono font-semibold">{formatCurrencyNPR(item.outstandingAmount ?? item.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Adjustments */}
                          {b.adjustmentsAmount !== 0 && (
                            <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                              <span className="font-medium">Adjustments / Discounts</span>
                              <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(b.adjustmentsAmount)}</span>
                            </div>
                          )}
                        </div>

                        {/* Month Subtotal */}
                        <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-xs font-semibold">
                          <span className="text-slate-600">Month Total: <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(b.totalAmount)}</span></span>
                          <span className="text-emerald-700">Paid: <span className="font-mono">{formatCurrencyNPR(b.paidAmount)}</span></span>
                          <span className="text-rose-700 font-bold">Due: <span className="font-mono">{formatCurrencyNPR(b.balanceDue)}</span></span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Grand Summary */}
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="flex justify-between text-xs text-slate-600 font-medium">
                    <span>Total Billed across {selectedBillBreakdown.count} unpaid month(s):</span>
                    <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(selectedBillBreakdown.totalBilled)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-emerald-700 font-semibold">
                    <span>Total Paid:</span>
                    <span className="font-mono">{formatCurrencyNPR(selectedBillBreakdown.totalPaid)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-extrabold text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                    <span>Total Combined Outstanding Amount:</span>
                    <span className="font-mono text-base">{formatCurrencyNPR(selectedBillBreakdown.totalOutstanding)}</span>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setBreakdownModalOpen(false)}
                    className="px-4 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium transition"
                  >
                    Close Details
                  </button>
                </div>
              </div>
            ) : (
              /* SINGLE-MONTH BREAKDOWN VIEW */
              <div className="space-y-3.5">
                {/* Room and Tenant Header Card */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-700 space-y-1">
                  <div className="flex justify-between">
                    <span><span className="text-slate-500 font-medium">Tenant:</span> <span className="font-bold text-slate-900">{selectedBillBreakdown.tenant?.fullName}</span></span>
                    <span><span className="text-slate-500 font-medium">Phone:</span> <span className="font-mono text-slate-700">{selectedBillBreakdown.tenant?.phone || '—'}</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span><span className="text-slate-500 font-medium">Room:</span> <span className="font-bold text-slate-900">Room {selectedBillBreakdown.room?.roomNumber}</span></span>
                    <span>
                      <span className="text-slate-500 font-medium">Billing Period:</span>{' '}
                      <span className="font-semibold text-slate-900">
                        {selectedBillBreakdown.billingPeriodBS || `${selectedBillBreakdown.yearBS} ${selectedBillBreakdown.monthNameBS}`}
                      </span>
                      {selectedBillBreakdown.isOngoing && (
                        <span className="inline-flex ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          Ongoing
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Itemized Line Items */}
                <div className="space-y-2 border-t border-slate-100 pt-2 text-xs">
                  <div className="font-bold text-[11px] text-slate-400 uppercase tracking-wider mb-1">
                    Itemized Charges
                  </div>

                  {/* Room Rent */}
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-700 font-medium">Room Rent</span>
                    <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(selectedBillBreakdown.rentAmount)}</span>
                  </div>

                  {/* Electricity */}
                  <div className="py-1 border-b border-slate-100 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-700 font-medium">
                        Electricity Meter Charge
                      </span>
                      <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(selectedBillBreakdown.electricityAmount)}</span>
                    </div>
                    {selectedBillBreakdown.breakdown?.electricity && (
                      <div className="text-[11px] text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200/70 font-mono">
                        {selectedBillBreakdown.breakdown.electricity.units} units @ Rs. {selectedBillBreakdown.breakdown.electricity.unitRate}/unit (Reading: {selectedBillBreakdown.breakdown.electricity.previousReading} &rarr; {selectedBillBreakdown.breakdown.electricity.currentReading})
                      </div>
                    )}
                  </div>

                  {/* Internet */}
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-700 font-medium">
                      {selectedBillBreakdown.breakdown?.internet?.description || 'Internet Charge'}
                    </span>
                    <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(selectedBillBreakdown.internetAmount)}</span>
                  </div>

                  {/* Garbage Charge */}
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-700 font-medium">Garbage Charge (Fixed)</span>
                    <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(selectedBillBreakdown.garbageAmount ?? 100)}</span>
                  </div>

                  {/* Drinking Water */}
                  {selectedBillBreakdown.waterAmount > 0 && (
                    <div className="py-1 border-b border-slate-100 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-700 font-medium">
                          Drinking Water ({selectedBillBreakdown.breakdown?.water?.items?.length || 1} delivery)
                        </span>
                        <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(selectedBillBreakdown.waterAmount)}</span>
                      </div>
                      {selectedBillBreakdown.breakdown?.water?.items && selectedBillBreakdown.breakdown.water.items.length > 0 && (
                        <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200/70 space-y-0.5">
                          {selectedBillBreakdown.breakdown.water.items.map((item: any) => (
                            <div key={item.id} className="flex justify-between">
                              <span>{item.quantity} jar(s) @ Rs. {item.pricePerUnit} {item.purchaseDateBS ? `(${item.purchaseDateBS})` : ''} {item.note ? `- ${item.note}` : ''}</span>
                              <span className="font-mono font-semibold">{formatCurrencyNPR(item.totalAmount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Borrowing / Advance */}
                  {selectedBillBreakdown.borrowingAmount > 0 && (
                    <div className="py-1 border-b border-slate-100 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-700 font-medium">
                          Borrowed Money / Loan Included
                        </span>
                        <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(selectedBillBreakdown.borrowingAmount)}</span>
                      </div>
                      {selectedBillBreakdown.breakdown?.borrowing?.items && selectedBillBreakdown.breakdown.borrowing.items.length > 0 && (
                        <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200/70 space-y-0.5">
                          {selectedBillBreakdown.breakdown.borrowing.items.map((item: any) => (
                            <div key={item.id} className="flex justify-between">
                              <span>Loan on {item.borrowDateBS || 'BS'} {item.reason ? `(${item.reason})` : ''}</span>
                              <span className="font-mono font-semibold">{formatCurrencyNPR(item.outstandingAmount ?? item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Adjustments */}
                  {selectedBillBreakdown.adjustmentsAmount !== 0 && (
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-700 font-medium">Adjustments / Discounts</span>
                      <span className="font-mono font-bold text-slate-900">{formatCurrencyNPR(selectedBillBreakdown.adjustmentsAmount)}</span>
                    </div>
                  )}
                </div>

                {/* Total Summary */}
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <div className="flex justify-between items-center text-sm font-extrabold text-slate-900">
                    <span>Total Calculated Bill:</span>
                    <span className="font-mono">{formatCurrencyNPR(selectedBillBreakdown.totalAmount)}</span>
                  </div>

                  <div className="flex justify-between text-xs font-semibold text-emerald-700">
                    <span>Paid So Far:</span>
                    <span className="font-mono">{formatCurrencyNPR(selectedBillBreakdown.paidAmount)}</span>
                  </div>

                  <div className="flex justify-between text-xs font-bold text-rose-700">
                    <span>Remaining Due:</span>
                    <span className="font-mono">{formatCurrencyNPR(selectedBillBreakdown.balanceDue)}</span>
                  </div>

                  <div className="text-[10px] text-slate-400 font-sans italic pt-1">
                    Total = Rent + Electricity + Internet + Garbage + Water + Borrowing &plusmn; Adjustments
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setBreakdownModalOpen(false);
                      handleOpenCorrect(selectedBillBreakdown);
                    }}
                    className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium transition"
                  >
                    Edit Bill
                  </button>

                  <button
                    onClick={() => setBreakdownModalOpen(false)}
                    className="px-3.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium transition"
                  >
                    Close Details
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Adjustment Modal */}
      {adjModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-sm w-full shadow-lg text-xs space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
              Create Bill Adjustment
            </h3>

            <form onSubmit={handleCreateAdjustment} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Select Room / Tenant</label>
                <select
                  required
                  value={adjForm.roomId}
                  onChange={(e) => {
                    const r = rooms.find((rm) => rm.id === e.target.value);
                    setAdjForm({
                      ...adjForm,
                      roomId: e.target.value,
                      tenantId: r?.tenant?.id || '',
                    });
                  }}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 bg-white focus:outline-none focus:border-slate-900"
                >
                  <option value="">Select occupied room</option>
                  {rooms
                    .filter((r) => r.status === 'OCCUPIED')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.roomNumber} — {r.tenant?.fullName || 'Occupied'}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Adjustment Type</label>
                <select
                  value={adjForm.type}
                  onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 bg-white focus:outline-none focus:border-slate-900"
                >
                  <option value="DISCOUNT">Discount (Deduction)</option>
                  <option value="CHARGE">Extra Charge (Addition)</option>
                  <option value="CREDIT">Credit</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Amount (NPR)</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={adjForm.amount}
                  onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                  placeholder="e.g. 500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Reason / Description</label>
                <input
                  type="text"
                  required
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                  placeholder="e.g. Wi-Fi outage discount"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdjModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash Payment Modal */}
      {cashModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full shadow-2xl text-xs space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-xs">Rs</span>
                  <span>Record Direct Cash Payment</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Receive cash directly, clear tenant dues & issue digital receipt
                </p>
              </div>
              <button
                onClick={() => setCashModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base p-1"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRecordCashPayment} className="space-y-3.5">
              {/* Step 1: Select Room */}
              <div>
                <label className="block text-slate-700 font-medium mb-1">
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

                    const tBills = nextTenantId ? bills.filter((b) => b.tenantId === nextTenantId) : [];
                    const totalDue = tBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);
                    const unpaidBills = tBills.filter((b) => b.balanceDue > 0);

                    setCashForm({
                      ...cashForm,
                      roomId: newRoomId,
                      tenantId: nextTenantId,
                      tenantName: nextTenantName,
                      roomNumber: nextRoomNum,
                      billId: unpaidBills[0]?.id || '',
                      amount: totalDue > 0 ? String(totalDue) : '',
                      maxDue: totalDue,
                    });
                  }}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-slate-900 bg-white font-medium focus:outline-none focus:border-slate-900"
                >
                  <option value="">-- Select Room --</option>
                  <optgroup label="Active Rooms">
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.roomNumber} ({r.name}) {r.tenant ? `[Occupied: ${r.tenant.fullName}]` : '[Vacant]'}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Historical / Moved-Out">
                    <option value="MOVED_OUT">[Moved-Out Tenants With Dues]</option>
                  </optgroup>
                </select>
              </div>

              {/* Step 2: Select Tenant (Strictly scoped to selected room or moved out) */}
              {cashForm.roomId && (
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    2. Select Tenant <span className="text-rose-500">*</span>
                  </label>
                  {(() => {
                    let availableTenants: { id: string; fullName: string; due: number; status: string }[] = [];
                    if (cashForm.roomId === 'MOVED_OUT') {
                      const activeTenantIds = new Set(rooms.map((r) => r.tenant?.id).filter(Boolean));
                      const movedOutMap = new Map<string, { id: string; fullName: string; due: number; status: string }>();
                      for (const b of bills) {
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
                        const tBills = bills.filter((b) => b.tenantId === selRoom.tenant.id);
                        const due = tBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);
                        availableTenants.push({
                          id: selRoom.tenant.id,
                          fullName: selRoom.tenant.fullName,
                          due,
                          status: 'ACTIVE',
                        });
                      }
                      // Also find former tenants who had bills in this room
                      const formerBills = bills.filter((b) => b.roomId === cashForm.roomId && b.tenantId !== selRoom?.tenant?.id);
                      const formerMap = new Map<string, { id: string; fullName: string; due: number; status: string }>();
                      for (const b of formerBills) {
                        if (b.tenantId) {
                          const cur = formerMap.get(b.tenantId) || {
                            id: b.tenantId,
                            fullName: b.tenant?.fullName || 'Former Tenant',
                            due: 0,
                            status: 'MOVED_OUT',
                          };
                          cur.due += Number(b.balanceDue || 0);
                          formerMap.set(b.tenantId, cur);
                        }
                      }
                      availableTenants.push(...Array.from(formerMap.values()));
                    }

                    if (availableTenants.length === 0) {
                      return (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs">
                          No tenants found for this selection.
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
                          const tBills = bills.filter((b) => b.tenantId === tId);
                          const unpaidBills = tBills.filter((b) => b.balanceDue > 0);
                          const totalDue = tBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);

                          setCashForm({
                            ...cashForm,
                            tenantId: tId,
                            tenantName: chosen?.fullName || '',
                            billId: unpaidBills[0]?.id || '',
                            amount: totalDue > 0 ? String(totalDue) : '',
                            maxDue: totalDue,
                          });
                        }}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-slate-900 bg-white font-medium focus:outline-none focus:border-slate-900"
                      >
                        <option value="">-- Select Tenant --</option>
                        {availableTenants.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.fullName} {t.status === 'MOVED_OUT' ? '[Moved Out]' : ''} ({t.due > 0 ? `Outstanding: Rs. ${t.due}` : 'Settled'})
                          </option>
                        ))}
                      </select>
                    );
                  })()}
                </div>
              )}

              {/* Step 3: Select Bill (Strictly scoped to selected tenant) */}
              {cashForm.tenantId && (
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    3. Target Bill <span className="text-rose-500">*</span>
                  </label>
                  {(() => {
                    const tenantBills = bills.filter((b) => b.tenantId === cashForm.tenantId);
                    if (tenantBills.length === 0) {
                      return (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs">
                          No bills found for this tenant. Payment will apply to their overall balance.
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
                            const totalDue = tenantBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);
                            setCashForm({
                              ...cashForm,
                              billId: '',
                              amount: totalDue > 0 ? String(totalDue) : '',
                              maxDue: totalDue,
                            });
                          }
                        }}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-slate-900 bg-white font-medium focus:outline-none focus:border-slate-900"
                      >
                        <option value="">
                          All Outstanding Bills (Auto-Reconcile Dues: Rs. {cashForm.maxDue})
                        </option>
                        {tenantBills.map((b) => (
                          <option key={b.id} value={b.id}>
                            Room {b.room?.roomNumber || b.roomNumber} — {b.billingPeriodBS || `${b.yearBS} ${b.monthNameBS}`} (Total: Rs. {b.totalAmount}, Due: Rs. {b.balanceDue}) [{b.status}]
                          </option>
                        ))}
                      </select>
                    );
                  })()}
                </div>
              )}

              {/* Step 4: Bill Information Card */}
              {(() => {
                const currentBill = bills.find((b) => b.id === cashForm.billId && b.tenantId === cashForm.tenantId);
                if (!currentBill) return null;
                return (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-200 font-bold text-slate-900">
                      <span>Room {currentBill.room?.roomNumber || currentBill.roomNumber} &bull; {currentBill.tenant?.fullName || cashForm.tenantName}</span>
                      <span className="text-emerald-700 font-mono">{currentBill.billingPeriodBS || `${currentBill.yearBS} ${currentBill.monthNameBS}`}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600">
                      <div>Rent: <span className="font-semibold text-slate-900">Rs. {currentBill.rentAmount}</span></div>
                      <div>Electricity: <span className="font-semibold text-slate-900">Rs. {currentBill.electricityAmount}</span></div>
                      <div>Water: <span className="font-semibold text-slate-900">Rs. {currentBill.waterAmount}</span></div>
                      <div>Garbage: <span className="font-semibold text-slate-900">Rs. {currentBill.garbageAmount}</span></div>
                      <div>Internet: <span className="font-semibold text-slate-900">Rs. {currentBill.internetAmount}</span></div>
                      <div>Other/Adj: <span className="font-semibold text-slate-900">Rs. {(currentBill.adjustmentsAmount || 0) + (currentBill.borrowingAmount || 0)}</span></div>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between font-bold">
                      <span className="text-slate-700">Total: Rs. {currentBill.totalAmount} (Paid: Rs. {currentBill.paidAmount})</span>
                      <span className="text-rose-700 font-mono text-xs">Due: Rs. {currentBill.balanceDue}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Step 5: Cash Amount Input & Quick Fill */}
              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Cash Amount Received (NPR) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 font-bold">Rs.</span>
                  <input
                    type="number"
                    required
                    min={1}
                    value={cashForm.amount}
                    onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })}
                    placeholder="e.g. 6500"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-mono font-bold text-sm focus:outline-none focus:border-slate-900"
                  />
                </div>
                {cashForm.maxDue > 0 && (
                  <div className="flex gap-2 mt-1.5">
                    <button
                      type="button"
                      onClick={() => setCashForm({ ...cashForm, amount: String(cashForm.maxDue) })}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
                    >
                      Clear Full Balance (Rs. {cashForm.maxDue})
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Payment Date (Bikram Sambat BS)
                </label>
                <NepaliDatePicker
                  value={cashForm.paymentDateBS}
                  onChange={(formattedBS) => setCashForm({ ...cashForm, paymentDateBS: formattedBS })}
                  placeholder="Select payment date"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Remarks / Notes (Optional)
                </label>
                <input
                  type="text"
                  value={cashForm.notes}
                  onChange={(e) => setCashForm({ ...cashForm, notes: e.target.value })}
                  placeholder="e.g. Received in cash by Admin"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCashModalOpen(false)}
                  disabled={cashSubmitting}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cashSubmitting || !cashForm.tenantId}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition"
                >
                  {cashSubmitting ? 'Recording...' : 'Record Cash Payment & Clear Dues'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
