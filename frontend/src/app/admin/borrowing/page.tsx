'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS } from '@/lib/nepali-date';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useToast } from '@/lib/toast-context';

export default function AdminBorrowingPage() {
  const toast = useToast();
  const [loans, setLoans] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Confirm states
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => {},
  });

  const [filterMode, setFilterMode] = useState<'active' | 'paid' | 'all'>('active');

  const [form, setForm] = useState({
    tenantId: '',
    roomId: '',
    amount: '',
    borrowDateBS: '',
    reason: '',
    repaymentTerms: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [lData, rData] = await Promise.all([
        api.get('/borrowing'),
        api.get('/rooms'),
      ]);
      setLoans(lData);
      setRooms(rData);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load loans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const today = getTodayBS();
    setForm((prev) => ({ ...prev, borrowDateBS: today.nepaliFormatted }));
    loadData();
  }, []);

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tenantId || !form.amount) {
      toast.warning('Please fill in required fields');
      return;
    }

    try {
      await api.post('/borrowing', {
        ...form,
        amount: Number(form.amount),
      });
      setModalOpen(false);
      const today = getTodayBS();
      setForm({
        tenantId: '',
        roomId: '',
        amount: '',
        borrowDateBS: today.nepaliFormatted,
        reason: '',
        repaymentTerms: '',
      });
      loadData();
      toast.success('Borrowing entry recorded.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to record loan');
    }
  };

  const handleRepay = (id: string) => {
    const today = getTodayBS();
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Cash Repayment',
      message: 'Mark this loan as repaid directly in cash? The balance will become Rs. 0 and move to Settled History.',
      action: async () => {
        try {
          await api.put(`/borrowing/${id}/repay`, {
            repaidDateBS: today.nepaliFormatted,
            repaymentMethod: 'CASH',
          });
          loadData();
          toast.success('Loan marked as repaid and moved to Settled History.');
        } catch (err: any) {
          toast.error(err.message || 'Failed to mark repayment');
        }
      },
    });
  };

  const handleIncludeInBill = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Include in Monthly Rent Bill',
      message: 'Include this loan in the upcoming monthly rent bill for the tenant?',
      action: async () => {
        try {
          await api.put(`/borrowing/${id}/include-in-bill`, {});
          loadData();
          toast.success('Loan added to monthly bill.');
        } catch (err: any) {
          toast.error(err.message || 'Failed to update loan');
        }
      },
    });
  };

  const activeCount = loans.filter((l) => l.status !== 'PAID').length;
  const paidCount = loans.filter((l) => l.status === 'PAID').length;

  const filteredLoans = loans.filter((l) => {
    if (filterMode === 'active') return l.status !== 'PAID';
    if (filterMode === 'paid') return l.status === 'PAID';
    return true;
  });

  const totalOutstanding = loans
    .filter((l) => l.status === 'OUTSTANDING' || l.status === 'PARTIALLY_PAID')
    .reduce((sum, l) => sum + (Number(l.outstandingAmount) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Tenant Borrowing / Advance Loans</h2>
          <p className="text-xs text-slate-500">Track active loans and view settled repayment history</p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition"
        >
          Add Loan Record
        </button>
      </div>

      {/* Summary and Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm text-xs min-w-[240px]">
          <div className="text-slate-500">Total Active Outstanding Borrowing</div>
          <div className="font-semibold text-rose-700 text-base mt-0.5">
            {formatCurrencyNPR(totalOutstanding)}
          </div>
        </div>

        {/* Filter Switcher */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setFilterMode('active')}
            className={`px-3 py-1.5 rounded-md transition ${
              filterMode === 'active'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active Dues ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('paid')}
            className={`px-3 py-1.5 rounded-md transition ${
              filterMode === 'paid'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Settled / History ({paidCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-md transition ${
              filterMode === 'all'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({loans.length})
          </button>
        </div>
      </div>

      {/* Loans Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Date (BS)</th>
                <th className="px-4 py-2.5">Tenant</th>
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Loan Amount</th>
                <th className="px-4 py-2.5">Outstanding</th>
                <th className="px-4 py-2.5">Reason / Terms</th>
                <th className="px-4 py-2.5">In Bill?</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Loading borrowing records...
                  </td>
                </tr>
              ) : filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    {filterMode === 'active'
                      ? 'No active outstanding borrowings'
                      : filterMode === 'paid'
                      ? 'No settled borrowings yet'
                      : 'No borrowing records found'}
                  </td>
                </tr>
              ) : (
                filteredLoans.map((l) => {
                  const isPaid = l.status === 'PAID';
                  const roomNum =
                    l.roomNumber ??
                    l.room?.roomNumber ??
                    l.tenant?.tenantProfile?.room?.roomNumber;

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono">{l.borrowDateBS}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{l.tenant?.fullName}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {roomNum ? (
                          <span>Room {roomNum}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium">{formatCurrencyNPR(l.amount)}</td>
                      <td className="px-4 py-3 font-mono font-bold text-rose-700">
                        {formatCurrencyNPR(l.outstandingAmount)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>{l.reason ? l.reason : <span className="text-slate-400">-</span>}</div>
                        {l.repaymentTerms && <div className="text-[11px] text-slate-400">{l.repaymentTerms}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {l.includeInBill ? (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
                            Included
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isPaid ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Paid / Settled
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Outstanding
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isPaid && (
                          <div className="flex items-center justify-end gap-1.5">
                            {!l.includeInBill && (
                              <button
                                onClick={() => handleIncludeInBill(l.id)}
                                className="px-2 py-1 text-[11px] rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium"
                              >
                                Add to Bill
                              </button>
                            )}
                            <button
                              onClick={() => handleRepay(l.id)}
                              className="px-2 py-1 text-[11px] rounded bg-emerald-700 hover:bg-emerald-800 text-white font-medium"
                            >
                              Repaid Cash
                            </button>
                          </div>
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

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-sm w-full shadow-lg text-xs space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
              Record Tenant Borrowing
            </h3>
            <form onSubmit={handleCreateLoan} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Select Tenant / Room *</label>
                <select
                  required
                  value={form.tenantId}
                  onChange={(e) => {
                    const r = rooms.find((rm) => rm.tenant?.id === e.target.value);
                    setForm({
                      ...form,
                      tenantId: e.target.value,
                      roomId: r?.id || '',
                    });
                  }}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 bg-white focus:outline-none focus:border-slate-900"
                >
                  <option value="">Select active tenant</option>
                  {rooms
                    .filter((r) => r.status === 'OCCUPIED')
                    .map((r) => (
                      <option key={r.tenant?.id} value={r.tenant?.id}>
                        Room {r.roomNumber} — {r.tenant?.fullName}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Loan Amount (NPR) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="e.g. 5000"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Borrow Date (BS)</label>
                <input
                  type="text"
                  value={form.borrowDateBS}
                  onChange={(e) => setForm({ ...form, borrowDateBS: e.target.value })}
                  placeholder="YYYY-MM-DD"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Reason / Purpose</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="e.g. Medical emergency advance"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Repayment Agreement</label>
                <input
                  type="text"
                  value={form.repaymentTerms}
                  onChange={(e) => setForm({ ...form, repaymentTerms: e.target.value })}
                  placeholder="e.g. Include in next month rent"
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
                  Save Loan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={async () => {
          await confirmModal.action();
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
