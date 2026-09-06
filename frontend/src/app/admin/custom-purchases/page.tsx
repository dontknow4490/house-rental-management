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
  ShoppingBag,
  PlusCircle,
  PackageCheck,
  PackageOpen,
  DollarSign,
  Edit2,
  Trash2,
  Tag,
  Home,
  Calendar,
  Plus,
} from 'lucide-react';

const COMMON_ITEM_SUGGESTIONS = [
  'Momo',
  'Chau Chau',
  'Biscuit',
  'Gas Cylinder',
  'Water Jar Extra',
  'Room Cleaning',
  'Key Duplicate',
  'Internet',
  'Heater Charge',
  'Grocery Items',
];

export default function AdminCustomPurchasesPage() {
  const toast = useToast();
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'settled'>('all');
  const [purchases, setPurchases] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals & Locks
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [submittingBatch, setSubmittingBatch] = useState(false);
  const isSubmittingRef = useRef(false);
  const isDeletingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const [batchItems, setBatchItems] = useState<Array<{ id: string; itemName: string; quantity: number; unitPrice: number; note: string }>>([
    { id: 'item_1', itemName: '', quantity: 1, unitPrice: 0, note: '' },
  ]);

  const [form, setForm] = useState({
    roomId: '',
    tenantId: '',
    yearBS: 2083,
    monthBS: 5,
    purchaseDateBS: '',
  });

  const [editForm, setEditForm] = useState({
    itemName: '',
    quantity: 1,
    unitPrice: 0,
    yearBS: 2083,
    monthBS: 5,
    purchaseDateBS: '',
    note: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [pData, rData] = await Promise.all([
        api.get('/custom-purchases'),
        api.get('/rooms'),
      ]);
      setPurchases(Array.isArray(pData) ? pData : []);
      setRooms(Array.isArray(rData) ? rData : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load custom purchases');
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
      purchaseDateBS: today.nepaliFormatted,
    }));
    loadData();
  }, []);

  useAutoSync(loadData, ['custom_purchase', 'bill', 'room', 'all']);

  const handleAddItemRow = () => {
    setBatchItems((prev) => [
      ...prev,
      { id: `item_${Date.now()}_${Math.random()}`, itemName: '', quantity: 1, unitPrice: 0, note: '' },
    ]);
  };

  const handleRemoveItemRow = (id: string) => {
    if (batchItems.length <= 1) {
      toast.warning('At least one item is required.');
      return;
    }
    setBatchItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleItemChange = (id: string, field: 'itemName' | 'quantity' | 'unitPrice' | 'note', val: any) => {
    setBatchItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: val } : it))
    );
  };

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!form.roomId) {
      toast.warning('Please select a room');
      return;
    }

    // Validate all items
    for (let i = 0; i < batchItems.length; i++) {
      const it = batchItems[i];
      if (!it.itemName.trim()) {
        toast.warning(`Please enter item name for row #${i + 1}`);
        return;
      }
      if (Number(it.quantity) < 1) {
        toast.warning(`Quantity for "${it.itemName}" must be at least 1`);
        return;
      }
      if (Number(it.unitPrice) < 0) {
        toast.warning(`Unit price for "${it.itemName}" cannot be negative`);
        return;
      }
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
    }
    const idempotencyKey = idempotencyKeyRef.current;

    try {
      isSubmittingRef.current = true;
      setSubmittingBatch(true);
      const payload = {
        roomId: form.roomId,
        tenantId: form.tenantId || undefined,
        yearBS: Number(form.yearBS),
        monthBS: Number(form.monthBS),
        purchaseDateBS: form.purchaseDateBS,
        idempotencyKey,
        items: batchItems.map((it) => ({
          itemName: it.itemName.trim(),
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          note: it.note?.trim() || undefined,
        })),
      };

      await api.post('/custom-purchases/batch', payload);
      idempotencyKeyRef.current = null;
      setAddModalOpen(false);
      const today = getTodayBS();
      setBatchItems([
        { id: `item_${Date.now()}`, itemName: '', quantity: 1, unitPrice: 0, note: '' },
      ]);
      setForm({
        roomId: '',
        tenantId: '',
        yearBS: today.yearBS,
        monthBS: today.monthBS,
        purchaseDateBS: today.nepaliFormatted,
      });
      loadData();
      toast.success(`Successfully saved ${batchItems.length} purchase items to bill.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to record custom purchases');
    } finally {
      isSubmittingRef.current = false;
      setSubmittingBatch(false);
    }
  };

  const handleOpenEdit = (p: any) => {
    setEditingPurchase(p);
    setEditForm({
      itemName: p.itemName,
      quantity: p.quantity,
      unitPrice: p.unitPrice,
      yearBS: p.yearBS,
      monthBS: p.monthBS,
      purchaseDateBS: p.purchaseDateBS || '',
      note: p.note || '',
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPurchase) return;

    try {
      await api.put(`/custom-purchases/${editingPurchase.id}`, {
        ...editForm,
        quantity: Number(editForm.quantity),
        unitPrice: Number(editForm.unitPrice),
      });
      setEditModalOpen(false);
      setEditingPurchase(null);
      loadData();
      toast.success('Purchase updated successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update custom purchase');
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
      // Optimistic instant response (0ms)
      setPurchases((prev) => prev.filter((p) => p.id !== targetId));
      setDeleteModalOpen(false);
      setDeleteTargetId(null);
      await api.delete(`/custom-purchases/${targetId}`);
      toast.success('Purchase record removed.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete purchase');
      loadData(); // revert
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

  const totalCost = purchases.reduce((acc, curr) => acc + (Number(curr.totalAmount) || 0), 0);
  const unsettledCost = activePurchases.reduce(
    (acc, curr) => acc + (Number(curr.totalAmount) || 0),
    0
  );
  const settledCost = settledPurchases.reduce(
    (acc, curr) => acc + (Number(curr.totalAmount) || 0),
    0
  );

  const addTotalPreview = batchItems.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0
  );
  const editTotalPreview = (Number(editForm.quantity) || 0) * (Number(editForm.unitPrice) || 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="Billing Extras"
        title="Custom Purchases & Extras"
        subtitle="Manage custom store purchases, extra cylinder charges, or miscellaneous room fees"
        actions={
          <Button
            onClick={() => setAddModalOpen(true)}
            variant="primary"
            size="sm"
            className="font-bold shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Custom Purchase</span>
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          variant="primary"
          title="Total Purchases Logged"
          value={`${purchases.length} Items`}
          badge="Lifetime"
          icon={<ShoppingBag className="w-5 h-5" />}
          subtitle="All items & custom charges"
        />

        <StatCard
          variant="neutral"
          title="Total Value"
          value={formatCurrencyNPR(totalCost)}
          badge="Combined"
          icon={<DollarSign className="w-5 h-5" />}
          subtitle="Gross charges recorded"
        />

        <StatCard
          variant="accent"
          title="Unsettled Extras"
          value={formatCurrencyNPR(unsettledCost)}
          badge={`${activePurchases.length} Pending`}
          icon={<PackageOpen className="w-5 h-5" />}
          subtitle="Will attach to upcoming bills"
        />

        <StatCard
          variant="success"
          title="Settled into Bills"
          value={formatCurrencyNPR(settledCost)}
          badge={`${settledPurchases.length} Invoiced`}
          icon={<PackageCheck className="w-5 h-5" />}
          subtitle="Invoiced in monthly statements"
        />
      </div>

      {/* Filter Tabs */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all ${
              filterTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>All Records ({purchases.length})</span>
          </button>

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
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
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
        </div>
      </div>

      {/* Purchases Table */}
      {loading ? (
        <SkeletonTable rows={5} cols={7} />
      ) : filteredPurchases.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="w-6 h-6 text-purple-500" />}
          title={
            filterTab === 'active'
              ? 'No unsettled custom purchases'
              : filterTab === 'settled'
              ? 'No settled purchases found'
              : 'No custom purchases recorded yet'
          }
          description="Log extra items, snacks, or custom services provided to tenants."
          action={
            <Button onClick={() => setAddModalOpen(true)} variant="primary" size="sm">
              <PlusCircle className="w-4 h-4" />
              <span>Add Custom Purchase</span>
            </Button>
          }
        />
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold">
                  <th className="px-4 py-3">Date / Period (BS)</th>
                  <th className="px-4 py-3">Room & Tenant</th>
                  <th className="px-4 py-3">Item Description</th>
                  <th className="px-4 py-3">Qty & Rate</th>
                  <th className="px-4 py-3">Total Cost</th>
                  <th className="px-4 py-3">Settlement</th>
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

                      <td className="px-4 py-3.5 font-semibold text-slate-900">
                        {p.itemName}
                      </td>

                      <td className="px-4 py-3.5 font-mono text-slate-600">
                        {p.quantity} &times; {formatCurrencyNPR(p.unitPrice)}
                      </td>

                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900 text-xs">
                        {formatCurrencyNPR(p.totalAmount)}
                      </td>

                      <td className="px-4 py-3.5">
                        <StatusBadge status={p.isSettled ? 'SETTLED' : 'UNSETTLED'} />
                      </td>

                      <td className="px-4 py-3.5 text-slate-500 max-w-[180px] truncate">
                        {p.note || <span className="text-slate-400 italic">&mdash;</span>}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <button
                            onClick={() => handleOpenEdit(p)}
                            disabled={p.isSettled}
                            className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                            title={p.isSettled ? 'Settled in bill (Cannot edit)' : 'Edit item'}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleOpenDelete(p.id)}
                            disabled={p.isSettled}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                            title={p.isSettled ? 'Settled in bill (Cannot delete)' : 'Delete item'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Custom Purchase Modal */}
      {addModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setAddModalOpen(false)}
          title="Add Custom Purchases / Extras"
          description="Log multiple purchase items (e.g. Momo, Water, Cleaning) for a room resident in a single batch. All items will be saved together."
          icon={<ShoppingBag className="w-5 h-5 text-purple-600" />}
          maxWidth="xl"
        >
          <form onSubmit={handleAddPurchase} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Select Room & Resident <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={form.roomId}
                  onChange={(e) => {
                    const rId = e.target.value;
                    const chosenRoom = rooms.find((r) => r.id === rId);
                    setForm({
                      ...form,
                      roomId: rId,
                      tenantId: chosenRoom?.tenant?.id || '',
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 bg-white"
                >
                  <option value="">-- Select Room --</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.roomNumber} ({r.name}){' '}
                      {r.tenant ? `— ${r.tenant.fullName}` : '[Vacant]'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Month BS</label>
                  <select
                    value={form.monthBS}
                    onChange={(e) => setForm({ ...form, monthBS: Number(e.target.value) })}
                    className="w-full px-2 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs bg-white"
                  >
                    {NEPALI_MONTH_NAMES.map((name, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Year BS</label>
                  <input
                    type="number"
                    value={form.yearBS}
                    onChange={(e) => setForm({ ...form, yearBS: Number(e.target.value) })}
                    className="w-full px-2 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Quick Suggestions Bar */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1.5">
                Quick add suggested item to list:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {COMMON_ITEM_SUGGESTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setBatchItems((prev) => {
                        const last = prev[prev.length - 1];
                        if (last && !last.itemName.trim()) {
                          return prev.map((it, idx) =>
                            idx === prev.length - 1 ? { ...it, itemName: item } : it
                          );
                        }
                        return [
                          ...prev,
                          { id: `item_${Date.now()}_${Math.random()}`, itemName: item, quantity: 1, unitPrice: 0, note: '' },
                        ];
                      });
                    }}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 text-slate-700 transition shadow-2xs"
                  >
                    + {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Items Table / List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">
                  Purchase Line Items ({batchItems.length})
                </span>
                <span className="text-[11px] text-slate-500">
                  Multiple items will be stored separately and linked to the bill
                </span>
              </div>

              <div className="space-y-2 max-h-[36vh] overflow-y-auto pr-1">
                {batchItems.map((item, idx) => {
                  const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-indigo-700 text-[11px]">
                          Item #{idx + 1}
                        </span>
                        {batchItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(item.id)}
                            className="text-rose-500 hover:text-rose-700 text-xs font-semibold p-1 hover:bg-rose-50 rounded transition"
                            title="Remove this item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-5">
                          <input
                            type="text"
                            required
                            placeholder="Item name (e.g. Momo, Water, Cleaning)"
                            value={item.itemName}
                            onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 bg-white"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <div className="flex items-center">
                            <input
                              type="number"
                              required
                              min={1}
                              placeholder="Qty"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(item.id, 'quantity', Number(e.target.value))}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-slate-900 text-xs font-mono font-bold text-center bg-white"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <div className="flex items-center">
                            <input
                              type="number"
                              required
                              min={0}
                              placeholder="Rate (NPR)"
                              value={item.unitPrice}
                              onChange={(e) => handleItemChange(item.id, 'unitPrice', Number(e.target.value))}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-slate-900 text-xs font-mono font-bold bg-white"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-3 text-right">
                          <span className="text-[10px] text-slate-400 block sm:hidden">Line Total</span>
                          <span className="font-mono font-extrabold text-indigo-900 text-xs">
                            = {formatCurrencyNPR(lineTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  onClick={handleAddItemRow}
                  variant="outline"
                  size="xs"
                  className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Item</span>
                </Button>

                <span className="text-[11px] text-slate-500">
                  {batchItems.length} item{batchItems.length === 1 ? '' : 's'} in batch
                </span>
              </div>
            </div>

            {/* Prominent Live Grand Total Summary */}
            <div className="p-4 bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border border-purple-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-purple-900 block">Grand Total of All Items</span>
                <span className="text-[11px] text-purple-700">
                  Total of {batchItems.length} line item{batchItems.length === 1 ? '' : 's'}
                </span>
              </div>
              <span className="text-xl font-extrabold text-purple-900 font-mono">
                Total = {formatCurrencyNPR(addTotalPreview)}
              </span>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                className="font-bold shadow-xs"
                disabled={submittingBatch}
                loading={submittingBatch}
              >
                {submittingBatch ? 'Saving...' : 'Save Purchases'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Purchase Modal */}
      {editModalOpen && editingPurchase && (
        <Modal
          isOpen={true}
          onClose={() => setEditModalOpen(false)}
          title={`Edit Purchase — ${editingPurchase.itemName}`}
          description={`Room ${editingPurchase.room?.roomNumber || '—'}`}
          icon={<Edit2 className="w-5 h-5 text-indigo-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handleSaveEdit} className="space-y-3.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Item Name</label>
              <input
                type="text"
                required
                value={editForm.itemName}
                onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Quantity</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={editForm.quantity}
                  onChange={(e) =>
                    setEditForm({ ...editForm, quantity: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Unit Price</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={editForm.unitPrice}
                  onChange={(e) =>
                    setEditForm({ ...editForm, unitPrice: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-900">Total Calculation</span>
              <span className="text-sm font-extrabold text-purple-900 font-mono">
                {formatCurrencyNPR(editTotalPreview)}
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Notes</label>
              <input
                type="text"
                value={editForm.note}
                onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="font-bold">
                Save Changes
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
          title="Remove Custom Purchase Record?"
          message="This unsettled item will be deleted and will not be attached to the upcoming bill."
          confirmText="Delete Record"
          cancelText="Cancel"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteModalOpen(false)}
        />
      )}
    </div>
  );
}
