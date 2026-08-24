'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatCurrencyNPR } from '@/lib/nepali-date';
import Link from 'next/link';

export default function TenantDashboardPage() {
  const { user } = useAuth();
  const [bill, setBill] = useState<any>(null);
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTenantData = async () => {
    try {
      setLoading(true);
      const [billData, noticeData] = await Promise.all([
        api.get('/billing/my-active'),
        api.get('/notices/active'),
      ]);
      setBill(billData);
      setNotices(noticeData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenantData();
  }, []);

  const totalDue = bill?.totalOutstanding !== undefined ? bill.totalOutstanding : (bill?.balanceDue ?? 0);
  const isPaid = bill?.allBillsPaid || totalDue === 0;
  const isPending = !isPaid && (bill?.isPendingVerification || bill?.status === 'PENDING_VERIFICATION');
  const isPartial = !isPaid && !isPending && (bill?.paidAmount > 0 || (bill?.unpaidBills && bill.unpaidBills.some((b: any) => b.paidAmount > 0)));

  const recentBills = bill?.recentBills || (bill ? [bill] : []);

  return (
    <div className="space-y-6 text-xs">
      {/* Active Notices Banner */}
      {notices.length > 0 && (
        <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-slate-800 space-y-1.5 shadow-sm">
          <div className="flex items-center gap-1.5 font-bold text-blue-900 text-xs">
            <svg className="w-4 h-4 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
            <span>House Notices</span>
          </div>
          {notices.map((n) => (
            <div key={n.id} className="text-slate-700 pl-5">
              <span className="font-semibold text-slate-900">{n.title}: </span>
              <span>{n.content}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Status & Due Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <span className="text-slate-500 text-[11px] font-medium uppercase tracking-wider">Account Balance</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-extrabold text-slate-900 font-mono">
                {formatCurrencyNPR(totalDue)}
              </span>
              <span className="text-xs text-slate-500">Total Outstanding</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPaid && (
              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Paid in Full
              </span>
            )}
            {isPending && (
              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Verification Pending
              </span>
            )}
            {isPartial && (
              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Partially Paid
              </span>
            )}
            {!isPaid && !isPending && !isPartial && (
              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                Payment Due
              </span>
            )}
          </div>
        </div>

        {/* Advance Balance Pill Card */}
        {bill?.advanceBalance > 0 && (
          <div className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                Rs
              </div>
              <div>
                <span className="font-bold text-emerald-900 block text-xs">Advance Balance Credit</span>
                <span className="text-[11px] text-emerald-700">Auto-deducted from your upcoming bills.</span>
              </div>
            </div>
            <div className="text-sm font-bold font-mono text-emerald-900">
              {formatCurrencyNPR(bill.advanceBalance)}
            </div>
          </div>
        )}

        {/* Summary note & Pay Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="text-slate-600 text-xs">
            {isPaid ? (
              <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                All rent and utility dues are fully paid.
              </span>
            ) : bill?.unpaidBills && bill.unpaidBills.length > 1 ? (
              <span className="text-amber-800 font-medium">
                Includes {bill.unpaidBills.length} outstanding periods (Combined payment ready).
              </span>
            ) : (
              <span>Monthly rent and utilities calculation active.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isPaid ? (
              <Link
                href="/tenant/pay"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition shadow-sm"
              >
                <span>Pay Total ({formatCurrencyNPR(totalDue)})</span>
                <span>&rarr;</span>
              </Link>
            ) : (
              <Link
                href="/tenant/pay"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg transition"
              >
                <span>Pay in Advance</span>
                <span>&rarr;</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/tenant/pay"
          className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 shadow-sm transition flex flex-col items-center text-center group"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-slate-900 group-hover:text-white text-slate-700 flex items-center justify-center transition mb-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div className="font-bold text-slate-900">Pay Bill</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Scan QR & upload proof</div>
        </Link>

        <Link
          href="/tenant/bills"
          className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 shadow-sm transition flex flex-col items-center text-center group"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-slate-900 group-hover:text-white text-slate-700 flex items-center justify-center transition mb-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="font-bold text-slate-900">Billing History</div>
          <div className="text-[10px] text-slate-500 mt-0.5">View all past months</div>
        </Link>

        <Link
          href="/tenant/receipts"
          className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 shadow-sm transition flex flex-col items-center text-center group"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-slate-900 group-hover:text-white text-slate-700 flex items-center justify-center transition mb-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="font-bold text-slate-900">Digital Receipts</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Verified receipts</div>
        </Link>

        <Link
          href="/tenant/maintenance"
          className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 shadow-sm transition flex flex-col items-center text-center group"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-slate-900 group-hover:text-white text-slate-700 flex items-center justify-center transition mb-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="font-bold text-slate-900">Report Issue</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Plumbing, electric, etc.</div>
        </Link>
      </div>

      {/* Complete Electricity & Bill Details for Latest Billing Periods */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Recent Billing Periods & Electricity Details</h2>
            <p className="text-[11px] text-slate-500">Itemized calculations and meter readings for your latest periods</p>
          </div>
          <Link href="/tenant/bills" className="text-[11px] text-slate-700 hover:text-slate-900 font-semibold hover:underline">
            View All &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
            Loading bill details...
          </div>
        ) : recentBills.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
            <p className="font-semibold text-slate-800">No monthly bills generated yet</p>
            <p className="text-[11px] text-slate-400 mt-1">Bills will appear here once generated by the owner.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentBills.map((b: any) => {
              const isBillPaid = b.status === 'PAID' || b.balanceDue === 0;
              const isBillPending = !isBillPaid && b.status === 'PENDING_VERIFICATION';
              const isBillPartial = !isBillPaid && !isBillPending && b.paidAmount > 0;
              const elec = b.electricityReading;

              return (
                <div
                  key={b.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4"
                >
                  {/* Bill Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          {b.billingPeriodBS || `${b.yearBS} ${b.monthNameBS}`}
                        </span>
                        {b.isOngoing && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            Ongoing Period
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Bill No: {b.billNumber} {b.correctionReason && <span className="text-amber-700 ml-1 font-sans italic">(Corrected: {b.correctionReason})</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isBillPaid && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Paid
                        </span>
                      )}
                      {isBillPending && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          Verification Pending
                        </span>
                      )}
                      {isBillPartial && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          Partially Paid
                        </span>
                      )}
                      {!isBillPaid && !isBillPending && !isBillPartial && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          Unpaid
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Electricity Meter Section */}
                  <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-[11px] flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Electricity Meter Consumption
                      </span>
                      <span className="font-mono font-semibold text-slate-900 text-xs">
                        {formatCurrencyNPR(b.electricityAmount)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                      <div className="bg-white p-2 rounded border border-slate-200">
                        <div className="text-slate-500 text-[10px]">Previous Reading</div>
                        <div className="font-mono font-semibold text-slate-900 mt-0.5">
                          {elec?.previousReading !== null && elec?.previousReading !== undefined ? elec.previousReading : '—'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded border border-slate-200">
                        <div className="text-slate-500 text-[10px]">Current Reading</div>
                        <div className="font-mono font-semibold text-slate-900 mt-0.5">
                          {elec?.currentReading !== null && elec?.currentReading !== undefined ? elec.currentReading : '—'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded border border-slate-200">
                        <div className="text-slate-500 text-[10px]">Total Units Used</div>
                        <div className="font-mono font-semibold text-slate-900 mt-0.5">
                          {elec?.unitsUsed ?? (b.electricityAmount > 0 ? Math.round(b.electricityAmount / 15) : 0)} units
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded border border-slate-200">
                        <div className="text-slate-500 text-[10px]">Rate per Unit</div>
                        <div className="font-mono font-semibold text-slate-900 mt-0.5">
                          Rs. {elec?.unitRate ?? 15}/unit
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Itemized Charges & Balances Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    {/* Left: Charges */}
                    <div className="space-y-1.5 text-slate-700">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Line Items
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Room Rent</span>
                        <span className="font-mono font-semibold text-slate-900">{formatCurrencyNPR(b.rentAmount)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Internet Charge</span>
                        <span className="font-mono font-semibold text-slate-900">{formatCurrencyNPR(b.internetAmount)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Garbage Charge</span>
                        <span className="font-mono font-semibold text-slate-900">{formatCurrencyNPR(b.garbageAmount ?? 100)}</span>
                      </div>
                      {b.waterAmount > 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span>Drinking Water</span>
                          <span className="font-mono font-semibold text-slate-900">{formatCurrencyNPR(b.waterAmount)}</span>
                        </div>
                      )}
                      {b.borrowingAmount > 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span>Borrowed Money Included</span>
                          <span className="font-mono font-semibold text-slate-900">{formatCurrencyNPR(b.borrowingAmount)}</span>
                        </div>
                      )}
                      {b.adjustmentsAmount !== 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span>Adjustments / Discounts</span>
                          <span className="font-mono font-semibold text-slate-900">{formatCurrencyNPR(b.adjustmentsAmount)}</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Payment & Balance Status */}
                    <div className="bg-slate-50/60 p-3 rounded-lg border border-slate-200 flex flex-col justify-between space-y-2">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold text-slate-900 pb-1 border-b border-slate-200">
                          <span>Final Bill Total:</span>
                          <span className="font-mono">{formatCurrencyNPR(b.totalAmount)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Paid Amount:</span>
                          <span className="font-mono font-semibold text-emerald-700">{formatCurrencyNPR(b.paidAmount)}</span>
                        </div>
                        <div className="flex justify-between text-xs font-bold text-rose-700">
                          <span>Remaining Balance Due:</span>
                          <span className="font-mono">{formatCurrencyNPR(b.balanceDue)}</span>
                        </div>
                      </div>

                      {b.balanceDue > 0 && b.status !== 'PENDING_VERIFICATION' && (
                        <div className="pt-2">
                          <Link
                            href="/tenant/pay"
                            className="w-full inline-flex items-center justify-center py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[11px] rounded transition"
                          >
                            Pay Outstanding ({formatCurrencyNPR(b.balanceDue)})
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
