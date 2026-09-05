'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR } from '@/lib/nepali-date';
import { useAutoSync } from '@/lib/sync';
import { ReceiptModal, ReceiptData } from '@/components/ReceiptModal';

export default function TenantReceiptsPage() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null);

  const loadReceipts = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      const data = await api.get('/payments?status=VERIFIED');
      const recs = Array.isArray(data) ? data.map((p: any) => p.digitalReceipt).filter(Boolean) : [];
      setReceipts(recs);
    } catch (err) {
      console.error(err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    loadReceipts();
  }, []);

  // Real-time synchronization for receipts
  useAutoSync(() => loadReceipts(true), ['payment', 'all']);

  return (
    <div className="space-y-5 text-xs">
      <div className="pb-3 border-b border-slate-200">
        <h2 className="text-base font-bold text-slate-900">Payment Receipts</h2>
        <p className="text-xs text-slate-500">Official digital receipts issued upon verified payments</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400 text-xs">
          Loading receipts...
        </div>
      ) : receipts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-slate-500 shadow-sm">
          <p className="font-semibold text-slate-900">No verified receipts yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Receipts will appear here once your submitted payments are verified by the house owner.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {receipts.map((r) => (
            <div
              key={r.receiptNumber}
              className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="font-mono font-semibold text-slate-900">{r.receiptNumber}</span>
                  <span className="text-[11px] text-slate-500">{r.issuedDateBS || r.paymentDateBS}</span>
                </div>

                <div className="mt-2 space-y-1 text-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Amount Paid:</span>
                    <span className="font-mono font-bold text-emerald-700">{formatCurrencyNPR(r.amount || r.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Method:</span>
                    <span>{r.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Billing Period:</span>
                    <span>{r.billingPeriodBS || r.billingPeriod}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => setSelectedReceipt(r)}
                  className="w-full py-1.5 px-3 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs transition text-center"
                >
                  View & Print Receipt
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Receipt Modal */}
      <ReceiptModal receipt={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
    </div>
  );
}
