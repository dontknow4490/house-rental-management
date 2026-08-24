'use client';

import React from 'react';
import { formatCurrencyNPR } from '@/lib/nepali-date';

export interface ReceiptData {
  receiptNumber: string;
  tenantName: string;
  roomNumber: number;
  billingPeriodBS: string;
  amount: number;
  paymentMethod: string;
  transactionId?: string;
  issuedDateBS: string;
}

interface ReceiptModalProps {
  receipt: ReceiptData | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden text-xs">
        {/* Action bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 no-print">
          <span className="font-semibold text-slate-900">Payment Receipt</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300"
            >
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 font-bold text-sm"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="p-6 printable-receipt bg-white text-slate-900">
          <div className="text-center pb-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">Payment Receipt</h2>
            <p className="text-xs text-slate-500">House Rental Management</p>
            <div className="inline-block mt-1.5 px-2.5 py-0.5 bg-slate-100 rounded text-xs font-mono text-slate-700">
              Receipt No: {receipt.receiptNumber}
            </div>
          </div>

          <div className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Tenant:</span>
              <span className="font-medium text-slate-900">{receipt.tenantName}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Room:</span>
              <span className="font-medium text-slate-900">Room {receipt.roomNumber}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Billing Period (BS):</span>
              <span className="font-medium text-slate-900">{receipt.billingPeriodBS}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Payment Method:</span>
              <span className="font-medium text-slate-900">{receipt.paymentMethod}</span>
            </div>
            {receipt.transactionId && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Transaction ID:</span>
                <span className="font-mono text-slate-700">{receipt.transactionId}</span>
              </div>
            )}
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Issued Date (BS):</span>
              <span className="font-medium text-slate-900">{receipt.issuedDateBS}</span>
            </div>

            {/* Paid Amount */}
            <div className="mt-4 p-3 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-emerald-700 font-medium">Amount Paid</p>
                <p className="text-lg font-bold text-emerald-800">{formatCurrencyNPR(receipt.amount)}</p>
              </div>
              <span className="px-2 py-0.5 bg-emerald-700 text-white font-semibold text-[10px] rounded">
                VERIFIED
              </span>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
            <p>Official system-generated rental payment receipt.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
