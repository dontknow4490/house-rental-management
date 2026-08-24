'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS, NEPALI_MONTH_NAMES } from '@/lib/nepali-date';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useToast } from '@/lib/toast-context';

export default function AdminWaterPage() {
  const toast = useToast();
  const [filterTab, setFilterTab] = useState<'active' | 'settled' | 'all'>('active');
  const [purchases, setPurchases] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [form, setForm] = useState({
    roomId: '',
    yearBS: 2083,
    monthBS: 5,
    quantity: 1,
    pricePerUnit: 45,
    note: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [wData, rData] = await Promise.all([
        api.get('/water'),
        api.get('/rooms'),
      ]);
      setPurchases(wData);
      setRooms(rData);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load water purchases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const today = getTodayBS();
    setForm((prev) => ({
      ...prev,
      yearBS: today.yearBS,
      monthBS: today.monthBS,
    }));
    loadData();
  }, []);

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.roomId) {
      toast.warning('Please select a room');
      return;
    }

    try {
      await api.post('/water', {
        ...form,
        quantity: Number(form.quantity),
        pricePerUnit: Number(form.pricePerUnit),
      });
      setModalOpen(false);
      const today = getTodayBS();
      setForm({
        roomId: '',
        yearBS: today.yearBS,
        monthBS: today.monthBS,
        quantity: 1,
        pricePerUnit: 45,
        note: '',
      });
      loadData();
      toast.success('Water purchase recorded.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to record water purchase');
    }
  };

  const handleOpenDelete = (id: string) => {
    setDeleteTargetId(id);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await api.delete(`/water/${deleteTargetId}`);
      setDeleteModalOpen(false);
      setDeleteTargetId(null);
      loadData();
      toast.success('Water purchase record removed.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete purchase');
    }
  };

  const filteredPurchases = purchases.filter((p) => {
    if (filterTab === 'active') return !p.isSettled || (Number(p.remainingDue) > 0);
    if (filterTab === 'settled') return p.isSettled && (Number(p.remainingDue) === 0);
    return true;
  });

  const totalJars = filteredPurchases.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
  const totalCost = filteredPurchases.reduce(
    (sum, p) => sum + (Number(p.totalAmount ?? p.totalCost) || Number(p.quantity) * Number(p.pricePerUnit) || 0),
    0,
  );
  const totalCovered = filteredPurchases.reduce(
    (sum, p) => sum + (Number(p.coveredByAdvance) || 0),
    0,
  );
  const totalRemainingDue = filteredPurchases.reduce(
    (sum, p) => sum + (Number(p.remainingDue ?? p.totalAmount) || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Drinking Water Records</h2>
          <p className="text-xs text-slate-500">Track 20-liter drinking water jar deliveries, advance payment coverage, and settlement</p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition"
        >
          Add Water Record
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs">
        <button
          type="button"
          onClick={() => setFilterTab('all')}
          className={`pb-2 px-3 font-semibold transition border-b-2 flex items-center gap-1.5 ${
            filterTab === 'all'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>All Water Records</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-800 font-mono">
            {purchases.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterTab('active')}
          className={`pb-2 px-3 font-semibold transition border-b-2 flex items-center gap-1.5 ${
            filterTab === 'active'
              ? 'border-amber-600 text-amber-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Active / Pending Due</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-900 font-mono">
            {purchases.filter((p) => !p.isSettled || Number(p.remainingDue) > 0).length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterTab('settled')}
          className={`pb-2 px-3 font-semibold transition border-b-2 flex items-center gap-1.5 ${
            filterTab === 'settled'
              ? 'border-emerald-600 text-emerald-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Covered / Paid</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-900 font-mono">
            {purchases.filter((p) => p.isSettled && Number(p.remainingDue) === 0).length}
          </span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="text-slate-500">Jars Delivered</div>
          <div className="font-semibold text-slate-900 mt-1">{totalJars} jars</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="text-slate-500">Total Water Cost</div>
          <div className="font-semibold text-slate-900 mt-1">{formatCurrencyNPR(totalCost)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="text-slate-500">Covered by Advance / Paid</div>
          <div className="font-semibold text-emerald-700 mt-1">{formatCurrencyNPR(totalCovered)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="text-slate-500">Remaining Due</div>
          <div className="font-semibold text-amber-700 mt-1">{formatCurrencyNPR(totalRemainingDue)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Date / Month</th>
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Tenant</th>
                <th className="px-4 py-2.5">Quantity</th>
                <th className="px-4 py-2.5">Rate</th>
                <th className="px-4 py-2.5">Total Cost</th>
                <th className="px-4 py-2.5">Covered from Advance</th>
                <th className="px-4 py-2.5">Remaining Due</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Notes</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                    Loading water records...
                  </td>
                </tr>
              ) : filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                    No water records found for the selected view.
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((p) => {
                  const resolvedTenant =
                    p.tenantName ||
                    p.tenant?.fullName ||
                    p.room?.tenantProfiles?.[0]?.user?.fullName ||
                    null;
                  const itemCost =
                    Number(p.totalAmount ?? p.totalCost) ||
                    Number(p.quantity) * Number(p.pricePerUnit) ||
                    0;
                  const covered = Number(p.coveredByAdvance) || 0;
                  const due = Number(p.remainingDue ?? (itemCost - covered)) || 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono">{p.yearBS} {NEPALI_MONTH_NAMES[p.monthBS - 1]}</td>
                      <td className="px-4 py-3 font-medium">Room {p.room?.roomNumber}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {resolvedTenant ? (
                          <span>{resolvedTenant}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{p.quantity} jars</td>
                      <td className="px-4 py-3 font-mono">Rs. {p.pricePerUnit}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        {formatCurrencyNPR(itemCost)}
                      </td>
                      <td className="px-4 py-3 font-mono text-emerald-700 font-medium">
                        {covered > 0 ? formatCurrencyNPR(covered) : <span className="text-slate-400">Rs. 0</span>}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold">
                        {due > 0 ? (
                          <span className="text-amber-700">{formatCurrencyNPR(due)}</span>
                        ) : (
                          <span className="text-emerald-600">Rs. 0 (Cleared)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {due === 0 ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Covered / Paid
                          </span>
                        ) : covered > 0 ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                            Partially Paid
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Unpaid Due
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {p.note ? p.note : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleOpenDelete(p.id)}
                          className="px-2 py-1 text-[11px] rounded border border-rose-200 text-rose-700 hover:bg-rose-50 font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-sm w-full shadow-lg text-xs space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
              Record Water Delivery
            </h3>
            <form onSubmit={handleAddPurchase} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Select Room *</label>
                <select
                  required
                  value={form.roomId}
                  onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 bg-white"
                >
                  <option value="">-- Choose Room --</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.roomNumber} ({r.name}) {r.tenant?.fullName ? `— ${r.tenant.fullName}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Billing Year (BS) *</label>
                  <input
                    type="number"
                    min="2070"
                    max="2100"
                    required
                    value={form.yearBS}
                    onChange={(e) => setForm({ ...form, yearBS: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Billing Month (BS) *</label>
                  <select
                    required
                    value={form.monthBS}
                    onChange={(e) => setForm({ ...form, monthBS: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 bg-white"
                  >
                    {NEPALI_MONTH_NAMES.map((m, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {m} (Month {idx + 1})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Quantity (Jars) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Price per Jar (Rs) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.pricePerUnit}
                    onChange={(e) => setForm({ ...form, pricePerUnit: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-2 rounded border border-slate-200 flex justify-between font-medium">
                <span>Total Amount:</span>
                <span className="font-mono text-slate-900 font-semibold">
                  {formatCurrencyNPR((Number(form.quantity) || 0) * (Number(form.pricePerUnit) || 0))}
                </span>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Note (Optional)</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="e.g. 2 jars delivered on Friday"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Delete Water Record"
        message="Are you sure you want to permanently delete this water delivery record? It will be completely removed from the database."
        confirmText="Permanently Delete"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeleteTargetId(null);
        }}
      />
    </div>
  );
}
