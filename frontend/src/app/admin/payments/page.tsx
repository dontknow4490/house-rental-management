'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api, getFileUrl } from '@/lib/api';
import { formatCurrencyNPR } from '@/lib/nepali-date';
import { ReceiptModal, ReceiptData } from '@/components/ReceiptModal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useToast } from '@/lib/toast-context';
import { useAutoSync, broadcastSync } from '@/lib/sync';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { SkeletonTable } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Search,
  Filter,
  Eye,
  FileCheck,
  Building2,
  Calendar,
  DollarSign,
  ShieldCheck,
  ExternalLink,
  Receipt,
  User,
} from 'lucide-react';

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
  const [selectedPaymentForDetails, setSelectedPaymentForDetails] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const isVerifyingRef = useRef(false);
  const isRejectingRef = useRef(false);

  // Digital Receipt Modal
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const loadPayments = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      const url = filterStatus ? `/payments?status=${filterStatus}` : '/payments';
      const data = await api.get(url);
      setPayments(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (!isBackground) toast.error(err.message || 'Failed to load payments');
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [filterStatus]);

  // Real-time synchronization for payments
  useAutoSync(() => loadPayments(true), ['payment', 'bill', 'all']);

  const handleOpenVerify = (payment: any) => {
    setSelectedPaymentForVerify(payment);
    setVerifyModalOpen(true);
  };

  const handleConfirmVerify = async () => {
    if (!selectedPaymentForVerify || isVerifyingRef.current) return;
    const targetId = selectedPaymentForVerify.id;

    try {
      isVerifyingRef.current = true;
      setActionLoading(true);

      // Instant optimistic UI response (0ms)
      setPayments((prev) =>
        prev.map((p) =>
          p.id === targetId
            ? { ...p, status: 'VERIFIED', verifiedAt: new Date().toISOString() }
            : p
        )
      );
      setVerifyModalOpen(false);

      const res = await api.put(`/payments/${targetId}/verify`, {
        verified: true,
      });
      broadcastSync('payment');
      toast.success('Payment verified and official digital receipt issued.');
      setSelectedPaymentForVerify(null);
      loadPayments(true);
      if (res.receipt) {
        setReceiptData(res.receipt);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify payment');
      loadPayments(true); // rollback on error
    } finally {
      isVerifyingRef.current = false;
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaymentForReject || isRejectingRef.current) return;
    const targetId = selectedPaymentForReject.id;

    try {
      isRejectingRef.current = true;
      setActionLoading(true);

      // Instant optimistic UI response (0ms)
      setPayments((prev) =>
        prev.map((p) =>
          p.id === targetId
            ? { ...p, status: 'REJECTED' }
            : p
        )
      );
      setRejectModalOpen(false);

      await api.put(`/payments/${targetId}/verify`, {
        verified: false,
        rejectionReason: rejectionReason || 'Payment proof is invalid',
      });
      broadcastSync('payment');
      setSelectedPaymentForReject(null);
      setRejectionReason('');
      loadPayments(true);
      toast.warning('Payment marked as rejected. Tenant has been notified.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject payment');
      loadPayments(true); // rollback
    } finally {
      isRejectingRef.current = false;
      setActionLoading(false);
    }
  };

  const verifiedPayments = payments.filter((p) => p.status === 'VERIFIED');
  const pendingPayments = payments.filter((p) => p.status === 'PENDING_VERIFICATION');
  const rejectedPayments = payments.filter((p) => p.status === 'REJECTED');

  const totalVerifiedAmount = verifiedPayments.reduce(
    (acc, curr) => acc + (Number(curr.amount) || 0),
    0
  );
  const totalPendingAmount = pendingPayments.reduce(
    (acc, curr) => acc + (Number(curr.amount) || 0),
    0
  );

  const filteredPayments = payments.filter((p) => {
    const q = search.toLowerCase();
    const roomNum = String(
      p.bill?.room?.roomNumber || p.tenant?.tenantProfile?.room?.roomNumber || ''
    );
    return (
      p.tenant?.fullName?.toLowerCase().includes(q) ||
      p.tenant?.username?.toLowerCase().includes(q) ||
      p.transactionId?.toLowerCase().includes(q) ||
      p.receiptNumber?.toLowerCase().includes(q) ||
      p.digitalReceipt?.receiptNumber?.toLowerCase().includes(q) ||
      p.paymentMethod?.toLowerCase().includes(q) ||
      roomNum.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="Financial Operations"
        title="Payments & Verification"
        subtitle="Review transaction submissions, inspect screenshots, approve digital receipts, and audit cash ledgers"
      />

      {/* Transaction Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          variant="success"
          title="Verified Collected"
          value={formatCurrencyNPR(totalVerifiedAmount)}
          badge={`${verifiedPayments.length} Settled`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          subtitle="Cleared into verified revenue ledger"
        />

        <StatCard
          variant={pendingPayments.length > 0 ? 'warning' : 'neutral'}
          title="Pending Verification"
          value={formatCurrencyNPR(totalPendingAmount)}
          badge={pendingPayments.length > 0 ? `${pendingPayments.length} Awaiting` : 'All Clear'}
          icon={<AlertCircle className="w-5 h-5" />}
          subtitle="Online slips waiting for approval"
        />

        <StatCard
          variant="danger"
          title="Rejected Proofs"
          value={rejectedPayments.length}
          badge="Declined"
          icon={<XCircle className="w-5 h-5" />}
          subtitle="Invalid receipts or amount mismatch"
        />

        <StatCard
          variant="neutral"
          title="Total Ledger Records"
          value={payments.length}
          badge="Audit History"
          icon={<CreditCard className="w-5 h-5" />}
          subtitle="All cash, eSewa, Khalti & Bank logs"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-700">Filter Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-semibold focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Transactions ({payments.length})</option>
            <option value="PENDING_VERIFICATION">
              Pending Verification ({pendingPayments.length})
            </option>
            <option value="VERIFIED">Verified ({verifiedPayments.length})</option>
            <option value="REJECTED">Rejected ({rejectedPayments.length})</option>
          </select>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search tenant, txn ID, receipt #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white font-medium"
          />
        </div>
      </div>

      {/* Payments Table */}
      {loading ? (
        <SkeletonTable rows={6} cols={7} />
      ) : filteredPayments.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="w-6 h-6 text-indigo-500" />}
          title="No payment records found"
          description="Try adjusting your filter or search keyword."
        />
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold">
                  <th className="px-4 py-3">Date (BS)</th>
                  <th className="px-4 py-3">Resident & Room</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Payment Method</th>
                  <th className="px-4 py-3">Transaction / Slip</th>
                  <th className="px-4 py-3">Proof</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {filteredPayments.map((p) => {
                  const isPending = p.status === 'PENDING_VERIFICATION';
                  const isVerified = p.status === 'VERIFIED';
                  const isRejected = p.status === 'REJECTED';
                  const roomNumber =
                    p.bill?.room?.roomNumber ||
                    p.tenant?.tenantProfile?.room?.roomNumber ||
                    '—';
                  const receiptNum = p.receiptNumber || p.digitalReceipt?.receiptNumber;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 font-mono text-slate-700">
                        {p.paymentDateBS || '—'}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 leading-tight">
                          {p.tenant?.fullName || 'Tenant'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Room {roomNumber}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900 text-xs">
                        {formatCurrencyNPR(p.amount)}
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {p.paymentMethod}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 font-mono text-slate-600 text-[11px]">
                        {p.transactionId ? (
                          <span>{p.transactionId}</span>
                        ) : (
                          <span className="text-slate-400 italic">Direct Entry</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        {p.proofImagePath ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProofUrl(getFileUrl(p.proofImagePath));
                              setProofModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-indigo-600 font-semibold text-[11px] shadow-xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Proof</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Cash/No proof</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <StatusBadge status={p.status} />
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setSelectedPaymentForDetails(p)}
                            title="Inspect Details"
                          >
                            Inspect
                          </Button>

                          {isPending && (
                            <>
                              <Button
                                variant="success"
                                size="xs"
                                loading={actionLoading}
                                onClick={() => handleOpenVerify(p)}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="danger"
                                size="xs"
                                loading={actionLoading}
                                onClick={() => {
                                  setSelectedPaymentForReject(p);
                                  setRejectModalOpen(true);
                                }}
                              >
                                Reject
                              </Button>
                            </>
                          )}

                          {isVerified && receiptNum && (
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={async () => {
                                try {
                                  const r = await api.get(`/payments/receipt/${receiptNum}`);
                                  setReceiptData(r);
                                } catch (err: any) {
                                  toast.error(err.message || 'Receipt could not be loaded');
                                }
                              }}
                            >
                              <Receipt className="w-3 h-3 text-indigo-600" />
                              <span>Receipt #{receiptNum}</span>
                            </Button>
                          )}
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

      {/* Proof Lightbox Modal */}
      {proofModalOpen && selectedProofUrl && (
        <Modal
          isOpen={true}
          onClose={() => setProofModalOpen(false)}
          title="Payment Proof Screenshot"
          description="Submitted proof of bank transfer / mobile wallet payment"
          icon={<Eye className="w-5 h-5 text-indigo-600" />}
          maxWidth="lg"
        >
          <div className="space-y-3">
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950 flex items-center justify-center max-h-[65vh]">
              <img
                src={selectedProofUrl}
                alt="Payment proof screenshot"
                className="max-w-full max-h-[65vh] object-contain"
              />
            </div>
            <div className="flex justify-between items-center pt-2">
              <a
                href={selectedProofUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                <span>Open Full Original Image</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setProofModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Verify Confirmation Modal */}
      {verifyModalOpen && selectedPaymentForVerify && (
        <ConfirmModal
          isOpen={true}
          title={`Approve Payment of ${formatCurrencyNPR(selectedPaymentForVerify.amount)}?`}
          message={`This will approve the payment for Room ${
            selectedPaymentForVerify.bill?.room?.roomNumber || '—'
          } (${selectedPaymentForVerify.tenant?.fullName}), offset room balance dues, and generate an official digital receipt.`}
          confirmText="Approve & Issue Receipt"
          cancelText="Cancel"
          loading={actionLoading}
          onConfirm={handleConfirmVerify}
          onCancel={() => setVerifyModalOpen(false)}
        />
      )}

      {/* Rejection Reason Modal */}
      {rejectModalOpen && selectedPaymentForReject && (
        <Modal
          isOpen={true}
          onClose={() => setRejectModalOpen(false)}
          title={`Reject Payment — ${formatCurrencyNPR(selectedPaymentForReject.amount)}`}
          description={`Provide a reason for declining payment submission by ${selectedPaymentForReject.tenant?.fullName}`}
          icon={<XCircle className="w-5 h-5 text-rose-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handleRejectSubmit} className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Reason for Rejection <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Screenshot unreadable or amount mismatch"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={actionLoading}
                className="font-bold"
              >
                Confirm Rejection
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Inspect Payment Details Modal */}
      {selectedPaymentForDetails && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedPaymentForDetails(null)}
          title="Payment Record Audit"
          description={`Transaction ID: ${selectedPaymentForDetails.id}`}
          icon={<FileCheck className="w-5 h-5 text-indigo-600" />}
          maxWidth="md"
        >
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px] block">
                  Tenant
                </span>
                <span className="font-bold text-slate-900 block mt-0.5">
                  {selectedPaymentForDetails.tenant?.fullName}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  @{selectedPaymentForDetails.tenant?.username}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px] block">
                  Room
                </span>
                <span className="font-bold text-slate-900 block mt-0.5">
                  Room{' '}
                  {selectedPaymentForDetails.bill?.room?.roomNumber ||
                    selectedPaymentForDetails.tenant?.tenantProfile?.room?.roomNumber ||
                    '—'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px] block">
                  Amount
                </span>
                <span className="font-mono font-extrabold text-slate-900 text-sm block mt-0.5">
                  {formatCurrencyNPR(selectedPaymentForDetails.amount)}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px] block">
                  Status
                </span>
                <div className="mt-0.5">
                  <StatusBadge status={selectedPaymentForDetails.status} />
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px] block">
                  Payment Date (BS)
                </span>
                <span className="font-mono text-slate-800 block mt-0.5">
                  {selectedPaymentForDetails.paymentDateBS}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px] block">
                  Payment Method
                </span>
                <span className="font-semibold text-slate-800 block mt-0.5">
                  {selectedPaymentForDetails.paymentMethod}
                </span>
              </div>
            </div>

            {selectedPaymentForDetails.notes && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-semibold uppercase text-[10px] block">
                  Remarks / Notes
                </span>
                <p className="text-slate-700 mt-0.5">{selectedPaymentForDetails.notes}</p>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedPaymentForDetails(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Digital Receipt Modal */}
      {receiptData && (
        <ReceiptModal
          isOpen={true}
          receipt={receiptData}
          onClose={() => setReceiptData(null)}
        />
      )}
    </div>
  );
}
