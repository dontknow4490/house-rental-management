'use client';

import React, { useEffect, useState } from 'react';
import { api, getFileUrl } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS } from '@/lib/nepali-date';
import { useToast } from '@/lib/toast-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function TenantPayPage() {
  const router = useRouter();
  const toast = useToast();
  const [bill, setBill] = useState<any>(null);
  const [pubSettings, setPubSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [paymentMethod, setPaymentMethod] = useState('ESEWA');
  const [amount, setAmount] = useState<string>('');
  const [transactionId, setTransactionId] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [todayBS, setTodayBS] = useState<{ nepaliFullFormatted: string; nepaliFormatted: string } | null>(null);
  const [isAdvanceMode, setIsAdvanceMode] = useState(false);

  useEffect(() => {
    setTodayBS(getTodayBS());
    const load = async (isBackground = false) => {
      try {
        if (!isBackground) setLoading(true);
        const [bData, sData] = await Promise.all([
          api.get('/billing/my-active'),
          api.get('/settings/public-payment'),
        ]);
        setBill(bData);
        setPubSettings(sData);
        if (bData && !isBackground) {
          const totalDue = bData.totalOutstanding !== undefined ? bData.totalOutstanding : (bData.balanceDue || 0);
          setAmount(String(totalDue));
        }
      } catch (err: any) {
        if (!isBackground) toast.error(err.message || 'Failed to load billing details');
      } finally {
        if (!isBackground) setLoading(false);
      }
    };
    load();

    // Auto-refresh every 5s for real-time payment/verification synchronization
    const interval = setInterval(() => load(true), 5000);
    const onFocus = () => load(true);
    const onPaymentUpdated = () => load(true);

    window.addEventListener('focus', onFocus);
    window.addEventListener('payment_updated', onPaymentUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('payment_updated', onPaymentUpdated);
    };
  }, []);

  const totalDue = bill?.totalOutstanding !== undefined ? bill.totalOutstanding : (bill?.balanceDue || 0);
  const isPaidInFull = (bill?.allBillsPaid || totalDue === 0) && !isAdvanceMode;
  const payAmountNum = parseFloat(amount) || 0;
  const advanceAmount = Math.max(0, payAmountNum - totalDue);

  const unpaidBills = bill?.unpaidBills && bill.unpaidBills.length > 0 ? bill.unpaidBills : (bill && totalDue > 0 ? [bill] : []);

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bill && !isAdvanceMode) {
      toast.error('No active bill or outstanding balance to pay.');
      return;
    }

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      toast.error('Please enter a valid payment amount.');
      return;
    }

    if (!proofFile) {
      toast.error('Please upload your payment screenshot/slip as proof.');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('billId', bill?.id || '');
      formData.append('amount', String(payAmount));
      formData.append('paymentMethod', paymentMethod);
      formData.append('paymentDateBS', todayBS?.nepaliFormatted || '2083 Bhadra 1');
      if (transactionId) formData.append('transactionId', transactionId);
      formData.append('proofImage', proofFile);

      await api.post('/payments/submit', formData);
      toast.success('Payment submitted successfully! The administrator has been notified.');
      router.push('/tenant');
    } catch (err: any) {
      toast.error(err.message || 'Payment submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto text-xs">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-base font-bold text-slate-900">Pay Rent & Utilities</h1>
          <p className="text-xs text-slate-500">Review bill breakdown, scan QR or transfer, and submit payment proof</p>
        </div>
        <Link href="/tenant" className="text-slate-500 hover:text-slate-900 font-medium">
          &larr; Back to Dashboard
        </Link>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 shadow-sm">
          Loading payment details...
        </div>
      ) : isPaidInFull ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-sm font-bold text-slate-900">All Bills Paid in Full</h2>
          <p className="text-slate-600 text-xs">
            You have no outstanding rent or utility balance due (Total Due: Rs. 0).
          </p>
          {bill?.advanceBalance > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 font-semibold text-xs inline-block">
              Current Advance Balance: {formatCurrencyNPR(bill.advanceBalance)}
            </div>
          )}
          <div className="pt-2 flex items-center justify-center gap-2">
            <Link
              href="/tenant"
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-xs transition"
            >
              Return to Dashboard
            </Link>
            <button
              onClick={() => {
                setIsAdvanceMode(true);
                setAmount('5000');
              }}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg text-xs transition shadow-sm"
            >
              Make Advance Payment
            </button>
          </div>
        </div>
      ) : bill || isAdvanceMode ? (
        <form onSubmit={handleSubmitPayment} className="space-y-5">
          {/* Detailed Breakdown of Every Unpaid Bill */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Unpaid Bill Breakdown ({unpaidBills.length} {unpaidBills.length === 1 ? 'Period' : 'Periods'})
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Detailed meter readings & charges
              </span>
            </div>

            {unpaidBills.map((b: any, idx: number) => {
              const elec = b.electricityReading;

              return (
                <div
                  key={b.id || idx}
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">
                        {b.billingPeriodBS || `${b.yearBS} ${b.monthNameBS}`}
                      </span>
                      {b.isOngoing && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          Ongoing
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 text-[11px] mr-1.5">Period Due:</span>
                      <span className="font-mono font-bold text-slate-900 text-xs">
                        {formatCurrencyNPR(b.balanceDue)}
                      </span>
                    </div>
                  </div>

                  {/* Electricity Meter Data */}
                  <div className="bg-slate-50/90 rounded-lg p-2.5 border border-slate-200 text-[11px]">
                    <div className="flex justify-between font-semibold text-slate-900 pb-1 mb-1.5 border-b border-slate-200/60">
                      <span className="flex items-center gap-1 text-slate-800">
                        <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Electricity Meter
                      </span>
                      <span className="font-mono text-slate-900">
                        {formatCurrencyNPR(b.electricityAmount)}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      <div className="bg-white p-1.5 rounded border border-slate-200">
                        <div className="text-slate-400 text-[9px]">Prev</div>
                        <div className="font-mono font-medium text-slate-800">{elec?.previousReading ?? '—'}</div>
                      </div>
                      <div className="bg-white p-1.5 rounded border border-slate-200">
                        <div className="text-slate-400 text-[9px]">Current</div>
                        <div className="font-mono font-medium text-slate-800">{elec?.currentReading ?? '—'}</div>
                      </div>
                      <div className="bg-white p-1.5 rounded border border-slate-200">
                        <div className="text-slate-400 text-[9px]">Units</div>
                        <div className="font-mono font-medium text-slate-800">{elec?.unitsUsed ?? 0} u</div>
                      </div>
                      <div className="bg-white p-1.5 rounded border border-slate-200">
                        <div className="text-slate-400 text-[9px]">Rate</div>
                        <div className="font-mono font-medium text-slate-800">Rs. {elec?.unitRate ?? 15}</div>
                      </div>
                    </div>
                  </div>

                  {/* Charges Breakdown */}
                  <div className="space-y-1 text-slate-700 text-[11px] pt-1">
                    <div className="flex justify-between py-0.5">
                      <span>Room Rent:</span>
                      <span className="font-mono font-medium text-slate-900">{formatCurrencyNPR(b.rentAmount)}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span>Internet Charge:</span>
                      <span className="font-mono font-medium text-slate-900">{formatCurrencyNPR(b.internetAmount)}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span>Garbage Charge:</span>
                      <span className="font-mono font-medium text-slate-900">{formatCurrencyNPR(b.garbageAmount ?? 100)}</span>
                    </div>
                    {b.waterAmount > 0 && (
                      <div className="flex justify-between py-0.5">
                        <span>Water:</span>
                        <span className="font-mono font-medium text-slate-900">{formatCurrencyNPR(b.waterAmount)}</span>
                      </div>
                    )}
                    {b.adjustmentsAmount !== 0 && (
                      <div className="flex justify-between py-0.5">
                        <span>Adjustments:</span>
                        <span className="font-mono font-medium text-slate-900">{formatCurrencyNPR(b.adjustmentsAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-t border-slate-100 font-semibold text-slate-900">
                      <span>Total Period Cost:</span>
                      <span className="font-mono">{formatCurrencyNPR(b.totalAmount)}</span>
                    </div>
                    {b.paidAmount > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Paid So Far:</span>
                        <span className="font-mono font-semibold">-{formatCurrencyNPR(b.paidAmount)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Combined Total Due Banner */}
            <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-slate-400 text-[11px] block font-medium">Combined Total Outstanding Due</span>
                <span className="text-xl font-extrabold font-mono text-white">
                  {formatCurrencyNPR(totalDue)}
                </span>
              </div>
              <div className="text-right text-[11px] text-slate-300">
                <span>Single payment pays all unpaid periods</span>
              </div>
            </div>

            {/* Advance credit preview if paying more */}
            {payAmountNum > totalDue && totalDue > 0 && (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 space-y-1">
                <div className="flex justify-between">
                  <span>Applied to outstanding dues:</span>
                  <span className="font-mono font-medium">{formatCurrencyNPR(totalDue)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-800">
                  <span>Credit saved to Advance Balance:</span>
                  <span className="font-mono">+{formatCurrencyNPR(advanceAmount)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
            <label className="block font-bold text-slate-900 text-xs pb-1 border-b border-slate-100">
              Select Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'ESEWA', label: 'eSewa' },
                { id: 'BANK_TRANSFER', label: 'Bank Transfer' },
                { id: 'CASH', label: 'Cash in Hand' },
              ].map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id)}
                  className={`p-2.5 rounded-lg text-center border font-semibold text-xs transition ${
                    paymentMethod === m.id
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* QR / Details Display */}
            {paymentMethod === 'ESEWA' && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2.5">
                {pubSettings?.paymentQrCode || pubSettings?.esewaQrImage ? (
                  <div className="flex justify-center">
                    <img
                      src={getFileUrl(pubSettings.paymentQrCode || pubSettings.esewaQrImage)}
                      alt="Owner QR Code"
                      className="w-40 h-40 object-contain rounded-lg bg-white p-2 border border-slate-200 shadow-sm"
                    />
                  </div>
                ) : null}
                <div className="text-slate-700">
                  <div className="font-bold text-slate-900 text-sm">eSewa ID: {pubSettings?.esewaId || '9761848471'}</div>
                  <div className="text-xs text-slate-500 font-medium">Account Name: {pubSettings?.esewaAccountName || 'Yubraj Shrestha'}</div>
                </div>
              </div>
            )}

            {paymentMethod === 'BANK_TRANSFER' && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-slate-700">
                <div><span className="text-slate-500">Bank:</span> <span className="font-bold text-slate-900">{pubSettings?.bankName || 'Nabil Bank'}</span></div>
                <div><span className="text-slate-500">Account No:</span> <span className="font-mono font-bold text-slate-900">{pubSettings?.bankAccountNumber || '15310017504670'}</span></div>
                <div><span className="text-slate-500">Account Name:</span> <span className="font-bold text-slate-900">{pubSettings?.bankAccountName || 'Yubraj Shrestha'}</span></div>
                <div><span className="text-slate-500">Branch:</span> <span className="text-slate-800 font-medium">{pubSettings?.bankBranch || 'Imadol'}</span></div>
              </div>
            )}

            {paymentMethod === 'CASH' && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-slate-700">
                Please hand the cash directly to the house owner. Submit this form with amount to register payment proof.
              </div>
            )}
          </div>

          {/* Payment Proof Form */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-3.5">
            <h3 className="font-bold text-slate-900 text-xs pb-1 border-b border-slate-100">
              Payment Submission Form
            </h3>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Amount Paid (NPR) *
              </label>
              <input
                type="number"
                required
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-slate-900 font-mono font-medium"
              />
            </div>

            {paymentMethod !== 'CASH' && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Transaction ID / Reference Number
                </label>
                <input
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. 7X3892018"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-slate-900 font-mono"
                />
              </div>
            )}

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Payment Proof Screenshot * (Compulsory)
              </label>
              <input
                type="file"
                required
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                className="w-full text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Please attach a screenshot or slip of your payment confirmation (JPG or PNG).
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs transition disabled:opacity-50 shadow-sm flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting Payment...</span>
                </>
              ) : (
                <span>Submit Payment for Verification &rarr;</span>
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500 shadow-sm">
          <p className="font-semibold text-slate-900">No active bill due</p>
          <p className="text-xs text-slate-400 mt-1">You do not have any pending bills to pay right now.</p>
        </div>
      )}
    </div>
  );
}
