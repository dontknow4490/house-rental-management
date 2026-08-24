'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS, NEPALI_MONTH_NAMES } from '@/lib/nepali-date';
import { ReadingEntryModal } from '@/components/ReadingEntryModal';

export default function AdminElectricityPage() {
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);

  const [selectedYearBS, setSelectedYearBS] = useState(2083);
  const [selectedMonthBS, setSelectedMonthBS] = useState(5);

  const today = getTodayBS();
  const isFuturePeriod =
    selectedYearBS > today.yearBS ||
    (selectedYearBS === today.yearBS && selectedMonthBS > today.monthBS);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const [dashRes, histRes] = await Promise.all([
        api.get(`/electricity/dashboard?yearBS=${selectedYearBS}&monthBS=${selectedMonthBS}`),
        api.get('/electricity/all-readings'),
      ]);
      setData(dashRes);
      setHistory(Array.isArray(histRes) ? histRes : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const today = getTodayBS();
    setSelectedYearBS(today.yearBS);
    setSelectedMonthBS(today.monthBS);
  }, []);

  useEffect(() => {
    loadStatus();
  }, [selectedYearBS, selectedMonthBS]);

  return (
    <div className="space-y-6">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Electricity Sub-Meters</h2>
          <p className="text-xs text-slate-500">
            Log monthly readings per room (Rate: Rs. {data?.unitRate || 15}/unit)
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2 text-xs">
          <select
            value={selectedYearBS}
            onChange={(e) => setSelectedYearBS(Number(e.target.value))}
            className="px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-slate-900 font-medium"
          >
            {[2080, 2081, 2082, 2083, 2084, 2085].map((y) => (
              <option key={y} value={y}>
                {y} BS
              </option>
            ))}
          </select>
          <select
            value={selectedMonthBS}
            onChange={(e) => setSelectedMonthBS(Number(e.target.value))}
            className="px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-slate-900 font-medium"
          >
            {NEPALI_MONTH_NAMES.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>
                {name}
              </option>
            ))}
          </select>
          <button
            onClick={loadStatus}
            className="px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="text-slate-500">Updated Rooms</div>
          <div className="font-semibold text-slate-900 mt-1">
            {data?.updatedRooms || 0} / {data?.totalRooms || 6}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="text-slate-500">Pending Readings</div>
          <div className="font-semibold text-amber-700 mt-1">
            {data?.pendingRooms || 0}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="text-slate-500">Total Units</div>
          <div className="font-semibold text-slate-900 mt-1">
            {(data?.totalUnitsConsumed || 0).toFixed(1)} units
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="text-slate-500">Total Electricity Amount</div>
          <div className="font-semibold text-slate-900 mt-1">
            {formatCurrencyNPR(data?.totalElectricityAmount || data?.totalElectricityCharge || 0)}
          </div>
        </div>
      </div>

      {/* Monthly Readings Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-xs flex items-center gap-2">
            <span>Meter Readings for {selectedYearBS} {NEPALI_MONTH_NAMES[selectedMonthBS - 1]}</span>
            {isFuturePeriod && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                Future Month
              </span>
            )}
          </h3>
        </div>

        {isFuturePeriod && (
          <div className="p-3 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center gap-2">
            <span className="font-bold">Note:</span>
            <span>Electricity meter readings cannot be entered for future months. Select the current month ({today.yearBS} {NEPALI_MONTH_NAMES[today.monthBS - 1]}) or a past month.</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Tenant</th>
                <th className="px-4 py-2.5">Prev Reading</th>
                <th className="px-4 py-2.5">Curr Reading</th>
                <th className="px-4 py-2.5">Units</th>
                <th className="px-4 py-2.5">Rate</th>
                <th className="px-4 py-2.5">Total Charge</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-400">
                    Loading electricity data...
                  </td>
                </tr>
              ) : !data?.rooms || data.rooms.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No records found
                  </td>
                </tr>
              ) : (
                data.rooms.map((r: any) => {
                  const isRecorded = r.isLogged || r.status === 'RECORDED';
                  return (
                    <tr key={r.roomId} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        Room {r.roomNumber}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.tenantName || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {r.previousReading ?? 0}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-900">
                        {isRecorded && r.currentReading !== null && r.currentReading !== undefined ? (
                          <span className="font-semibold">{r.currentReading}</span>
                        ) : (
                          <span className="text-slate-400 italic font-sans">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {isRecorded && r.unitsConsumed !== null && r.unitsConsumed !== undefined ? (
                          `${r.unitsConsumed} units`
                        ) : (
                          <span className="text-slate-400 italic font-sans">Not entered</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        Rs. {r.unitRate || 15}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        {isRecorded && r.totalAmount !== null && r.totalAmount !== undefined ? (
                          formatCurrencyNPR(r.totalAmount)
                        ) : (
                          <span className="text-slate-400 italic font-sans">Not entered</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isFuturePeriod ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-400 border border-slate-200">
                            Future
                          </span>
                        ) : r.isBeforeMoveIn ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200" title={`Tenant moved in on ${r.moveInDateBS || r.moveInPeriodText}`}>
                            Before Move-in
                          </span>
                        ) : isRecorded ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Recorded
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isFuturePeriod ? (
                          <button
                            disabled
                            title="Cannot enter readings for future periods"
                            className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                          >
                            Future Month
                          </button>
                        ) : r.isBeforeMoveIn ? (
                          <button
                            disabled
                            title={`Tenant moved in on ${r.moveInDateBS || r.moveInPeriodText}`}
                            className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                          >
                            Before Move-in
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedRoom(r)}
                            className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 hover:bg-slate-100 text-slate-700 transition"
                          >
                            {isRecorded ? 'Edit Reading' : 'Enter Reading'}
                          </button>
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

      {/* Meter Reading History Table (Visual Rollover Verification) */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 text-xs">Meter Reading History & Rollover Log</h3>
            <p className="text-[11px] text-slate-500">Historical recorded meter readings across all rooms</p>
          </div>
          <span className="text-[11px] font-medium text-slate-600">{history.length} Logged Record(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Period (BS)</th>
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Previous</th>
                <th className="px-4 py-2.5">Current</th>
                <th className="px-4 py-2.5">Units</th>
                <th className="px-4 py-2.5">Rate</th>
                <th className="px-4 py-2.5">Charge</th>
                <th className="px-4 py-2.5">Recorded On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400 italic">
                    No historical electricity meter readings logged yet.
                  </td>
                </tr>
              ) : (
                history.map((h: any) => (
                  <tr key={h.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {h.yearBS} {h.monthNameBS}
                    </td>
                    <td className="px-4 py-2.5 font-medium">
                      Room {h.room?.roomNumber || h.roomId}
                    </td>
                    <td className="px-4 py-2.5 font-mono">{h.previousReading}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">{h.currentReading}</td>
                    <td className="px-4 py-2.5 font-mono">{h.unitsUsed} units</td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">Rs. {h.unitRate}</td>
                    <td className="px-4 py-2.5 font-mono font-medium text-slate-900">{formatCurrencyNPR(h.totalCharge)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{h.readingDateBS || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reading Entry Modal */}
      {selectedRoom && (
        <ReadingEntryModal
          isOpen={!!selectedRoom}
          onClose={() => setSelectedRoom(null)}
          onSuccess={loadStatus}
          room={selectedRoom}
          period={{
            yearBS: selectedYearBS,
            monthBS: selectedMonthBS,
            monthNameBS: NEPALI_MONTH_NAMES[selectedMonthBS - 1],
          }}
        />
      )}
    </div>
  );
}
