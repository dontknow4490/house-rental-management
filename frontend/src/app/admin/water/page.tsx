'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS, NEPALI_MONTH_NAMES } from '@/lib/nepali-date';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useAutoSync, broadcastSync } from '@/lib/sync';
import { useToast } from '@/lib/toast-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { SkeletonTable } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Droplets,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Home,
  Trash2,
  DollarSign,
  PackageCheck,
  PackageOpen,
} from 'lucide-react';

export default function AdminWaterPage() {
  const toast = useToast();
  const [filterTab, setFilterTab] = useState<'active' | 'settled' | 'all'>('active');
  const [purchases, setPurchases] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const isDeletingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

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
      const [wData, rData] = await Promise.all([api.get('/water'), api.get('/rooms')]);
      setPurchases(Array.isArray(wData) ? wData : []);
      setRooms(Array.isArray(rData) ? rData : []);
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

  useAutoSync(loadData, ['water', 'bill', 'room', 'all']);

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!form.roomId) {
      toast.warning('Please select a room');
      return;
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
    }
    const idempotencyKey = idempotencyKeyRef.current;

    try {
      isSubmittingRef.current = true;
      setSubmitting(true);
      await api.post('/water', {
        ...form,
        quantity: Number(form.quantity),
        pricePerUnit: Number(form.pricePerUnit),
        idempotencyKey,
      });
      idempotencyKeyRef.current = null;
      broadcastSync('water');
      broadcastSync('bill');
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
      toast.success('Water jar purchase recorded.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to record water purchase');
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleOpenDelete = (id: string) => {
    setDeleteTargetId(id);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId || isDeletingRef.current) return;
    const targetId = deleteTargetId;
    try {
      isDeletingRef.current = true;
      // Optimistic instant removal (0ms)
      setPurchases((prev) => prev.filter((p) => p.id !== targetId));
      setDeleteModalOpen(false);
      setDeleteTargetId(null);
      await api.delete(`/water/${targetId}`);
      broadcastSync('water');
      broadcastSync('bill');
      toast.success('Water purchase record removed.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete purchase');
      loadData(); // rollback
    } finally {
      isDeletingRef.current = false;
    }
  };

  const filteredPurchases = purchases.filter((p) => {
    if (filterTab === 'active') return !p.isSettled;
    if (filterTab === 'settled') return p.isSettled;
    return true;
  });

  const activePurchases = purchases.filter((p) => !p.isSettled);
  const settledPurchases = purchases.filter((p) => p.isSettled);

  const totalJars = purchases.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
  const totalCost = purchases.reduce((acc, curr) => acc + (Number(curr.totalAmount) || 0), 0);
  const unsettledCost = activePurchases.reduce(
    (acc, curr) => acc + (Number(curr.totalAmount) || 0),
    0
  );
  const settledCost = settledPurchases.reduce(
    (acc, curr) => acc + (Number(curr.totalAmount) || 0),
    0
  );

  const previewTotal = (Number(form.quantity) || 0) * (Number(form.pricePerUnit) || 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="Utilities"
        title="Drinking Water Management"
        subtitle="Log drinking water jars delivery per room, track unit pricing, and verify settlement into monthly bills"
        actions={
          <Button
            onClick={() => setModalOpen(true)}
            variant="primary"
            size="sm"
            className="font-bold shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Record Water Purchase</span>
          </Button>
        }
      />

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          variant="primary"
          title="Total Jars Logged"
          value={`${totalJars} Jars`}
          badge="Delivered"
          icon={<Droplets className="w-5 h-5" />}
          subtitle="Lifetime 20L water jars"
        />

        <StatCard
          variant="neutral"
          title="Total Water Cost"
          value={formatCurrencyNPR(totalCost)}
          badge="Cumulative"
          icon={<DollarSign className="w-5 h-5" />}
          subtitle="Standard Rs. 45/jar"
        />

        <StatCard
          variant="accent"
          title="Unsettled Charges"
          value={formatCurrencyNPR(unsettledCost)}
          badge={`${activePurchases.length} Pending`}
          icon={<PackageOpen className="w-5 h-5" />}
          subtitle="Will attach to upcoming monthly bills"
        />

        <StatCard
          variant="success"
          title="Settled in Bills"
          value={formatCurrencyNPR(settledCost)}
          badge={`${settledPurchases.length} Invoiced`}
          icon={<PackageCheck className="w-5 h-5" />}
          subtitle="Billed to tenants"
        />
      </div>

      {/* Filter Tabs */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setFilterTab('active')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              filterTab === 'active'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Unsettled / Active</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                filterTab === 'active' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {activePurchases.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('settled')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              filterTab === 'settled'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Settled in Bills</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                filterTab === 'settled' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {settledPurchases.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all ${
              filterTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>All Records ({purchases.length})</span>
          </button>
        </div>
      </div>

      {/* Water Purchases Table */}
      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : filteredPurchases.length === 0 ? (
        <EmptyState
          icon={<Droplets className="w-6 h-6 text-blue-500" />}
          title={
            filterTab === 'active'
              ? 'No unsettled water purchases'
              : filterTab === 'settled'
              ? 'No settled purchases found'
              : 'No water purchases logged yet'
          }
          description="Click '+ Record Water Purchase' to log a water jar delivery."
          action={
            <Button onClick={() => setModalOpen(true)} variant="primary" size="sm">
              <PlusCircle className="w-4 h-4" />
              <span>Record Water Purchase</span>
            </Button>
          }
        />
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold">
                  <th className="px-4 py-3">Period / Date (BS)</th>
                  <th className="px-4 py-3">Room & Resident</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Unit Price</th>
                  <th className="px-4 py-3">Total Cost</th>
                  <th className="px-4 py-3">Settlement Status</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {filteredPurchases.map((p) => {
                  const roomNum = p.room?.roomNumber || '—';
                  const tenantName = p.tenant?.fullName || p.room?.tenant?.fullName || 'Resident';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 font-mono text-slate-700">
                        {p.purchaseDateBS || `${p.yearBS} ${NEPALI_MONTH_NAMES[p.monthBS - 1]}`}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">Room {roomNum}</div>
                        <div className="text-[11px] text-slate-500">{tenantName}</div>
                      </td>

                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                        {p.quantity} jar{p.quantity === 1 ? '' : 's'}
                      </td>

                      <td className="px-4 py-3.5 font-mono text-slate-600">
                        {formatCurrencyNPR(p.pricePerUnit)}
                      </td>

                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900 text-xs">
                        {formatCurrencyNPR(p.totalAmount)}
                      </td>

                      <td className="px-4 py-3.5">
                        <StatusBadge status={p.isSettled ? 'SETTLED' : 'UNSETTLED'} />
                      </td>

                      <td className="px-4 py-3.5 text-slate-500 max-w-[200px] truncate">
                        {p.note || <span className="text-slate-400 italic">&mdash;</span>}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        {!p.isSettled ? (
                          <button
                            onClick={() => handleOpenDelete(p.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Delete water record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Settled in bill</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Water Purchase Modal */}
      {modalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setModalOpen(false)}
          title="Record Drinking Water Purchase"
          description="Log jar deliveries for a room. Charges will automatically attach to that room's upcoming monthly bill."
          icon={<Droplets className="w-5 h-5 text-blue-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handleAddPurchase} className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Select Room <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={form.roomId}
                onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 bg-white"
              >
                <option value="">-- Select Room --</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Room {r.roomNumber} ({r.name}) {r.tenant ? `— ${r.tenant.fullName}` : '[Vacant]'}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Year (BS)</label>
                <input
                  type="number"
                  required
                  value={form.yearBS}
                  onChange={(e) => setForm({ ...form, yearBS: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Month (BS)</label>
                <select
                  value={form.monthBS}
                  onChange={(e) => setForm({ ...form, monthBS: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs bg-white"
                >
                  {NEPALI_MONTH_NAMES.map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Quantity (Jars) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Price per Jar (NPR)</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={form.pricePerUnit}
                  onChange={(e) => setForm({ ...form, pricePerUnit: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs font-mono"
                />
              </div>
            </div>

            {/* Dynamic Calculation Preview */}
            <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900">Calculated Total</span>
              <span className="text-sm font-extrabold text-blue-900 font-mono">
                {form.quantity} &times; Rs. {form.pricePerUnit} = {formatCurrencyNPR(previewTotal)}
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Notes (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Delivered by ABC Water Suppliers"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="font-bold"
                disabled={submitting}
                loading={submitting}
              >
                {submitting ? 'Saving...' : 'Save Purchase'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <ConfirmModal
          isOpen={true}
          isDanger={true}
          title="Remove Water Purchase Record?"
          message="This will delete this unsettled water jar record. It will no longer be added to the upcoming monthly bill."
          confirmText="Delete Record"
          cancelText="Cancel"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteModalOpen(false)}
        />
      )}
    </div>
  );
}
