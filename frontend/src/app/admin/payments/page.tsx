'use client';

import React, { useEffect, useState } from 'react';
import { api, getFileUrl } from '@/lib/api';
import { formatCurrencyNPR } from '@/lib/nepali-date';
import { ReceiptModal, ReceiptData } from '@/components/ReceiptModal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useToast } from '@/lib/toast-context';

export default function AdminPaymentsPage() {
  const toast = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [search, setSearch] = useState('');

  // Modals
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedPaymentForReject, setSelectedPaymentForReject] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [selectedPaymentForVerify, setSelectedPaymentForVerify] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Digital Receipt Modal
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const loadPayments = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      const url = filterStatus ? `/payments?status=${filterStatus}` : '/payments';
      const data = await api.get(url);
      setPayments(data);
    } catch (err: any) {
      if (!isBackground) toast.error(err.message || 'Failed to load payments');
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();

    // Auto-refresh every 5 seconds for real-time payment synchronization
    const interval = setInterval(() => {
      loadPayments(true);
    }, 5000);

    const onFocus = () => loadPayments(true);
    const onPaymentUpdated = () => loadPayments(true);

    window.addEventListener('focus', onFocus);
    window.addEventListener('payment_updated', onPaymentUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('payment_updated', onPaymentUpdated);
    };
  }, [filterStatus]);

  const handleOpenVerify = (payment: any) => {
    setSelectedPaymentForVerify(payment);
    setVerifyModalOpen(true);
  };

  const handleConfirmVerify = async () => {
    if (!selectedPaymentForVerify) return;

    try {
      setActionLoading(true);
      const res = await api.put(`/payments/${selectedPaymentForVerify.id}/verify`, { verified: true });
      toast.success('Payment verified and official digital receipt issued.');
      setVerifyModalOpen(false);
      setSelectedPaymentForVerify(null);
      loadPayments();
      if (res.receipt) {
        setReceiptData(res.receipt);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify payment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaymentForReject) return;

    try {
      setActionLoading(true);
      await api.put(`/payments/${selectedPaymentForReject.id}/verify`, {
        verified: false,
        rejectionReason: rejectionReason || 'Payment proof is invalid',
      });
      setRejectModalOpen(false);
      setSelectedPaymentForReject(null);
      setRejectionReason('');
      loadPayments();
      toast.warning('Payment marked as rejected. Tenant has been notified.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject payment');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredPayments = payments.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.tenant?.fullName?.toLowerCase().includes(q) ||
      p.tenant?.username?.toLowerCase().includes(q) ||
      p.transactionId?.toLowerCase().includes(q) ||
      p.receiptNumber?.toLowerCase().includes(q) ||
      String(p.bill?.room?.roomNumber || '').includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Payments & Verification</h2>
          <p className="text-xs text-slate-500">Verify tenant payment proofs and issue digital receipts</p>
        </div>

        {/* Filter and Search */}
        <div className="flex items-center gap-2 text-xs">
          <input
            type="text"
            placeholder="Search payments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-slate-900"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-slate-900 font-medium"
          >
            <option value="">All Statuses</option>
            <option value="PENDING_VERIFICATION">Pending Verification</option>
            <option value="VERIFIED">Verified</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Date (BS)</th>
                <th className="px-4 py-2.5">Tenant / Room</th>
                <th className="px-4 py-2.5">Amount</th>
                <th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5">Txn ID</th>
                <th className="px-4 py-2.5">Proof</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Loading payments...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No payments yet
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const isPending = p.status === 'PENDING_VERIFICATION';
                  const isVerified = p.status === 'VERIFIED';
                  const isRejected = p.status === 'REJECTED';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono">{p.paymentDateBS}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{p.tenant?.fullName}</div>
                        <div className="text-[11px] text-slate-500">Room {p.bill?.room?.roomNumber}</div>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        {formatCurrencyNPR(p.amount)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{p.paymentMethod}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {p.transactionId || <span className="text-slate-400">&mdash;</span>}
                      </td>
                      <td className="px-4 py-3">
                        {p.proofImagePath ? (
                          <button
                            onClick={() => {
                              setSelectedProofUrl(getFileUrl(p.proofImagePath));
                              setProofModalOpen(true);
                            }}
                            className="px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-100 text-[11px] text-slate-700 font-medium"
                          >
                            View Proof
                          </button>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isVerified && (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Verified
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Pending
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && (
                            <>
                              <button
                                onClick={() => handleOpenVerify(p)}
                                disabled={actionLoading}
                                className="px-2.5 py-1 text-[11px] font-medium rounded bg-emerald-700 hover:bg-emerald-800 text-white transition disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedPaymentForReject(p);
                                  setRejectModalOpen(true);
                                }}
                                disabled={actionLoading}
                                className="px-2 py-1 text-[11px] font-medium rounded border border-rose-200 hover:bg-rose-50 text-rose-700 transition disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {isVerified && (
                            <button
                              onClick={async () => {
                                try {
                                  const r = await api.get(`/payments/receipt/${p.receiptNumber}`);
                                  setReceiptData(r);
                                } catch (err: any) {
                                  toast.error(err.message || 'Receipt could not be loaded');
                                }
                              }}
                              className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 hover:bg-slate-100 text-slate-700 transition"
                            >
                              Receipt #{p.receiptNumber}
                            </button>
                          )}
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

      {/* Proof Image Modal */}
      {proofModalOpen && selectedProofUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase">Payment Proof Screenshot</h3>
              <button
                onClick={() => setProofModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                &times;
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-50">
              <img
                src={getFileUrl(selectedProofUrl)}
                alt="Payment proof"
                className="max-h-[70vh] rounded border border-slate-200 object-contain shadow-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase">Reject Payment</h3>
              <button
                onClick={() => setRejectModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleRejectSubmit} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Rejection Reason (Required)
                </label>
                <textarea
                  rows={3}
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Transaction ID does not match bank records..."
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded bg-rose-700 hover:bg-rose-800 text-white font-medium disabled:opacity-50"
                >
                  Reject Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Verification */}
      <ConfirmModal
        isOpen={verifyModalOpen}
        title="Verify Payment"
        message={
          selectedPaymentForVerify
            ? `Verify payment of Rs. ${selectedPaymentForVerify.amount} from ${selectedPaymentForVerify.tenant?.fullName || 'tenant'} and issue an official digital receipt?`
            : 'Verify this payment and issue an official digital receipt?'
        }
        confirmText="Verify & Issue Receipt"
        cancelText="Cancel"
        loading={actionLoading}
        onConfirm={handleConfirmVerify}
        onCancel={() => {
          setVerifyModalOpen(false);
          setSelectedPaymentForVerify(null);
        }}
      />

      {/* Digital Receipt Modal */}
      {receiptData && (
        <ReceiptModal receipt={receiptData} onClose={() => setReceiptData(null)} />
      )}
    </div>
  );
}
