'use client';

import React from 'react';
import { formatCurrencyNPR } from '@/lib/nepali-date';
import { Printer, X, CheckCircle2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

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
  isOpen?: boolean;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose, isOpen }) => {
  if (!receipt || isOpen === false) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-white border border-slate-200/80 rounded-2xl shadow-modal overflow-hidden text-xs animate-scaleUp">
        {/* Action bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 no-print">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-brand-600" />
            <span className="font-semibold text-slate-900 text-sm">Payment Receipt</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={handlePrint}
              leftIcon={<Printer className="w-3.5 h-3.5" />}
            >
              Print / Save PDF
            </Button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="p-6 printable-receipt bg-white text-slate-900">
          <div className="text-center pb-5 border-b border-slate-200/80">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/60 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Payment Receipt</h2>
            <p className="text-xs text-slate-500 font-medium">House Rental Management System</p>
            <div className="inline-block mt-2 px-3 py-1 bg-slate-100 rounded-lg text-xs font-mono font-medium text-slate-700 border border-slate-200">
              Receipt No: {receipt.receiptNumber}
            </div>
          </div>

          <div className="mt-5 space-y-2.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Tenant Name:</span>
              <span className="font-semibold text-slate-900">{receipt.tenantName}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Room Unit:</span>
              <span className="font-semibold text-slate-900">Room {receipt.roomNumber}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Billing Period (BS):</span>
              <span className="font-semibold text-slate-900">{receipt.billingPeriodBS}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Payment Method:</span>
              <span className="font-semibold text-slate-900">{receipt.paymentMethod}</span>
            </div>
            {receipt.transactionId && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Transaction Reference:</span>
                <span className="font-mono text-slate-800 font-medium">{receipt.transactionId}</span>
              </div>
            )}
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Issued Date (BS):</span>
              <span className="font-semibold text-slate-900">{receipt.issuedDateBS}</span>
            </div>

            {/* Paid Amount Highlight */}
            <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50/50 border border-emerald-200/80 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-emerald-700 font-semibold uppercase tracking-wider">Amount Paid</p>
                <p className="text-xl font-bold text-emerald-900 tracking-tight mt-0.5">{formatCurrencyNPR(receipt.amount)}</p>
              </div>
              <span className="px-2.5 py-1 bg-emerald-600 text-white font-bold text-[10px] rounded-full shadow-sm tracking-wider">
                VERIFIED
              </span>
            </div>
          </div>

          <div className="mt-6 pt-3.5 border-t border-slate-200/80 text-center text-[10px] text-slate-400">
            <p>Official system-generated rental payment receipt.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
