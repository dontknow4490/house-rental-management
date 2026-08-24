'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS } from '@/lib/nepali-date';
import { NepaliDatePicker } from '@/components/NepaliDatePicker';
import { useToast } from '@/lib/toast-context';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const toast = useToast();
  const [summary, setSummary] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [todayBS, setTodayBS] = useState<{ nepaliFullFormatted: string; yearBS: number; monthBS: number; monthNameBS: string } | null>(null);

  // Cash Modal state
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

  const handleGenerateBills = async () => {
    if (generating) return;
    try {
      setGenerating(true);
      const currentToday = todayBS || getTodayBS();
      const targetYear = summary?.period?.yearBS || currentToday.yearBS;
      const targetMonth = summary?.period?.monthBS || currentToday.monthBS;
      
      const res = await api.post('/billing/generate', {
        yearBS: targetYear,
        monthBS: targetMonth,
      });
      await loadData();
      toast.success(res?.message || 'Monthly bills generated successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate monthly bills');
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenCashPayment = (targetRoom?: any) => {
    const today = getTodayBS();
    if (targetRoom && targetRoom.tenant) {
      const tId = targetRoom.tenant.id;
      const tBills = unpaidBills.filter((b) => b.tenantId === tId);
      const totalDue = tBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);

      setCashForm({
        roomId: targetRoom.id,
        tenantId: tId,
        tenantName: targetRoom.tenant.fullName,
        roomNumber: String(targetRoom.roomNumber),
        billId: tBills[0]?.id || '',
        amount: totalDue > 0 ? String(totalDue) : '',
        maxDue: totalDue,
        paymentDateBS: today.nepaliFormatted,
        notes: 'Direct Cash Payment received by Admin',
      });
    } else {
      const firstOccupied = rooms.find((r) => r.status === 'OCCUPIED' && r.tenant);
      const tId = firstOccupied?.tenant?.id || '';
      const tBills = tId ? unpaidBills.filter((b) => b.tenantId === tId) : [];
      const totalDue = tBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);

      setCashForm({
        roomId: firstOccupied?.id || '',
        tenantId: tId,
        tenantName: firstOccupied?.tenant?.fullName || '',
        roomNumber: String(firstOccupied?.roomNumber || ''),
        billId: tBills[0]?.id || '',
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
      toast.warning('Please select a tenant.');
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
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record cash payment');
    } finally {
      setCashSubmitting(false);
    }
  };

  const totalRooms = summary?.stats?.totalRooms ?? (rooms.length || 6);
  const occupiedRooms = summary?.stats?.occupiedRooms ?? rooms.filter((r) => r.status === 'OCCUPIED').length;
  const vacantRooms = summary?.stats?.vacantRooms ?? (totalRooms - occupiedRooms);

  const expectedRent = summary?.stats?.expectedRent ?? 0;
  const collectedAmount = summary?.stats?.collectedAmount ?? 0;
  const outstandingAmount = summary?.stats?.outstandingAmount ?? 0;

  return (
    <div className="space-y-6">
      {/* Header & Date */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">House Rental Management</h2>
          <p className="text-xs text-slate-500">
            {todayBS?.nepaliFullFormatted || 'Bikram Sambat Calendar'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenCashPayment()}
            className="px-3 py-1.5 text-xs font-bold rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white transition flex items-center gap-1 shadow-sm"
          >
            <span>+ Record Cash Payment</span>
          </button>
          <button
            onClick={handleGenerateBills}
            disabled={generating}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white transition disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Monthly Bills'}
          </button>
        </div>
      </div>

      {/* Row 1: Simple Summary Strip */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="text-slate-500 font-medium">Total Rooms</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{totalRooms}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="text-slate-500 font-medium">Occupied</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{occupiedRooms}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="text-slate-500 font-medium">Vacant</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{vacantRooms}</div>
        </div>
      </div>

      {/* Row 2: Financial Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-sm">
          <div className="text-slate-500 font-medium">Expected Rent ({summary?.period?.monthNameBS || 'This Month'})</div>
          <div className="text-lg font-bold text-slate-900 mt-1 font-mono">
            {formatCurrencyNPR(expectedRent)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-sm">
          <div className="text-slate-500 font-medium">Collected</div>
          <div className="text-lg font-bold text-emerald-700 mt-1 font-mono">
            {formatCurrencyNPR(collectedAmount)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-sm">
          <div className="text-slate-500 font-medium">Outstanding Balance</div>
          <div className="text-lg font-bold text-rose-700 mt-1 font-mono">
            {formatCurrencyNPR(outstandingAmount)}
          </div>
        </div>
      </div>

      {/* Row 3: 6 Rooms Clean Status Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Room Overview (6 Rooms)
          </h3>
          <Link
            href="/admin/rooms"
            className="text-xs text-slate-600 hover:text-slate-900 font-medium"
          >
            Manage Rooms &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Current Tenant</th>
                <th className="px-4 py-2.5">Monthly Rent</th>
                <th className="px-4 py-2.5">Electricity Meter</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {loading && rooms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Loading rooms...
                  </td>
                </tr>
              ) : rooms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    No rooms found
                  </td>
                </tr>
              ) : (
                rooms.map((room) => {
                  const isOccupied = room.status === 'OCCUPIED';
                  const tenant = room.tenant || room.tenantProfiles?.[0]?.user;
                  const profile = room.tenantProfiles?.[0];
                  const rent = profile ? profile.monthlyRent : room.defaultRent;

                  return (
                    <tr key={room.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        Room {room.roomNumber}
                      </td>
                      <td className="px-4 py-3">
                        {isOccupied ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-300">
                            Occupied
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Vacant
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {tenant ? (
                          <div>
                            <span className="font-medium text-slate-900">{tenant.fullName}</span>
                            <span className="text-[11px] text-slate-500 font-mono block">@{tenant.username}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        {formatCurrencyNPR(rent)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {room.currentReading !== null && room.currentReading !== undefined ? (
                          <span>
                            <span className="font-mono font-medium text-slate-900">{room.currentReading}</span>
                            <span className="text-[11px] text-slate-500 ml-1">({room.unitsUsed ?? room.electricityUnits ?? 0} units)</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Not entered</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isOccupied ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenCashPayment(room)}
                              className="px-2 py-1 text-[11px] font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-xs"
                            >
                              Pay Cash
                            </button>
                            <Link
                              href="/admin/billing"
                              className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 hover:bg-slate-100 text-slate-700 inline-block transition"
                            >
                              View Bill
                            </Link>
                          </div>
                        ) : (
                          <Link
                            href="/admin/tenants"
                            className="px-2.5 py-1 text-[11px] font-medium rounded bg-slate-900 hover:bg-slate-800 text-white inline-block transition"
                          >
                            Assign
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
      </div>

      {/* Dashboard Cash Payment Modal */}
      {cashModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full shadow-2xl text-xs space-y-4 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-xs">Rs</span>
                  <span>Record Direct Cash Payment</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Receive cash directly and clear tenant dues
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

                    const tBills = nextTenantId ? unpaidBills.filter((b) => b.tenantId === nextTenantId) : [];
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

              {/* Step 2: Select Tenant */}
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
                        const tBills = unpaidBills.filter((b) => b.tenantId === selRoom.tenant.id);
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
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs">
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
                          const totalDue = tBills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);

                          setCashForm({
                            ...cashForm,
                            tenantId: tId,
                            tenantName: chosen?.fullName || '',
                            billId: tBills[0]?.id || '',
                            amount: totalDue > 0 ? String(totalDue) : '',
                            maxDue: totalDue,
                          });
                        }}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-slate-900 bg-white font-medium focus:outline-none focus:border-slate-900"
                      >
                        <option value="">-- Select Tenant --</option>
                        {availableTenants.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.fullName} {t.status === 'MOVED_OUT' ? '[Moved Out]' : ''} ({t.due > 0 ? `Due: Rs. ${t.due}` : 'No Dues'})
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
                  <label className="block text-slate-700 font-medium mb-1">
                    3. Target Bill <span className="text-rose-500">*</span>
                  </label>
                  {(() => {
                    const tenantBills = unpaidBills.filter((b) => b.tenantId === cashForm.tenantId);
                    if (tenantBills.length === 0) {
                      return (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs">
                          No unpaid bills found. Payment will apply to tenant balance.
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
                const currentBill = unpaidBills.find((b) => b.id === cashForm.billId && b.tenantId === cashForm.tenantId);
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

              {/* Step 5: Cash Amount Input */}
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
