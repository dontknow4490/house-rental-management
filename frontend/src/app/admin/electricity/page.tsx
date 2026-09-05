'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS, NEPALI_MONTH_NAMES } from '@/lib/nepali-date';
import { ReadingEntryModal } from '@/components/ReadingEntryModal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { SkeletonCard, SkeletonTable } from '@/components/ui/LoadingSkeleton';
import { useAutoSync } from '@/lib/sync';
import {
  Zap,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Home,
  TrendingUp,
  RefreshCw,
  Gauge,
  ArrowRight,
  Clock,
} from 'lucide-react';

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
    const todayBS = getTodayBS();
    setSelectedYearBS(todayBS.yearBS);
    setSelectedMonthBS(todayBS.monthBS);
  }, []);

  useEffect(() => {
    loadStatus();
  }, [selectedYearBS, selectedMonthBS]);

  // Automatically refresh when electricity, bills, or payments update
  useAutoSync(loadStatus, ['electricity', 'bill', 'payment', 'all']);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="Utilities"
        title="Electricity Sub-Meters"
        subtitle={`Track room sub-meters and calculate consumption (Rate: Rs. ${
          data?.unitRate || 15
        }/unit)`}
        actions={
          <div className="flex items-center gap-2 text-xs">
            <select
              value={selectedYearBS}
              onChange={(e) => setSelectedYearBS(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
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
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
            >
              {NEPALI_MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={loadStatus}>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </Button>
          </div>
        }
      />

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          variant="primary"
          title="Updated Readings"
          value={`${data?.updatedRooms || 0} / ${data?.totalRooms ?? 0}`}
          badge={data?.totalRooms && data?.updatedRooms >= data?.totalRooms ? '100% Done' : 'In Progress'}
          icon={<Gauge className="w-5 h-5" />}
          subtitle="Rooms recorded for this month"
        />

        <StatCard
          variant="warning"
          title="Total Units Consumed"
          value={`${(data?.totalUnitsConsumed || 0).toFixed(1)} Units`}
          badge="Monthly Total"
          icon={<Zap className="w-5 h-5" />}
          subtitle="Net units across all sub-meters"
        />

        <StatCard
          variant="success"
          title="Total Electricity Bill"
          value={formatCurrencyNPR(data?.totalElectricityAmount ?? data?.totalCost ?? 0)}
          badge={`Rs. ${data?.unitRate || 15}/unit`}
          icon={<TrendingUp className="w-5 h-5" />}
          subtitle="Will auto-attach to bills"
        />

        <StatCard
          variant="neutral"
          title="Sub-Meter Tariff"
          value={`Rs. ${data?.unitRate || 15}`}
          badge="Standard NEA"
          icon={<Calendar className="w-5 h-5" />}
          subtitle="Rate configured in Settings"
        />
      </div>

      {/* Room Sub-Meters Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Room Sub-Meter Loggers ({NEPALI_MONTH_NAMES[selectedMonthBS - 1]} {selectedYearBS})
          </h3>
          {isFuturePeriod && (
            <span className="text-xs text-amber-700 font-semibold bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
              Future Month (Read-Only)
            </span>
          )}
        </div>

        {loading ? (
          <SkeletonCard count={6} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(data?.rooms || []).map((room: any) => {
              const isUpdated = !!(room.isUpdated || room.isLogged);
              const roomCost = room.totalCost ?? room.totalAmount ?? 0;

              return (
                <div
                  key={room.roomId}
                  className={`rounded-2xl border p-5 shadow-card transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5 flex flex-col justify-between ${
                    isUpdated
                      ? 'border-emerald-200/90 bg-gradient-to-br from-emerald-50/20 via-white to-white'
                      : 'border-amber-200/90 bg-gradient-to-br from-amber-50/20 via-white to-white'
                  }`}
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-extrabold text-slate-900">
                            Room {room.roomNumber < 10 ? `0${room.roomNumber}` : room.roomNumber}
                          </span>
                          {isUpdated ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          )}
                        </div>
                        <span className="text-xs text-slate-500 font-medium">
                          {room.tenantName ? (
                            room.tenantName
                          ) : (
                            <span className="text-slate-400 italic">No tenant assigned</span>
                          )}
                        </span>
                      </div>

                      {isUpdated ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Logged</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <AlertCircle className="w-3 h-3" />
                          <span>Pending Reading</span>
                        </span>
                      )}
                    </div>

                    {/* Meter Readings Comparison */}
                    <div className="py-4 space-y-2.5 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Previous Reading
                          </span>
                          <span className="font-mono font-bold text-slate-800 text-sm mt-0.5 block">
                            {room.previousReading ?? 0} units
                          </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Current Reading
                          </span>
                          <span
                            className={`font-mono font-bold text-sm mt-0.5 block ${
                              isUpdated ? 'text-indigo-900' : 'text-slate-400 italic text-xs'
                            }`}
                          >
                            {isUpdated ? `${room.currentReading} units` : 'Not recorded'}
                          </span>
                        </div>
                      </div>

                      {/* Calculated Units & Cost */}
                      <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                            Units Consumed
                          </span>
                          <span className="font-mono font-extrabold text-slate-900 text-sm">
                            {isUpdated ? `${(room.unitsConsumed || 0).toFixed(1)} units` : '0 units'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                            Calculated Cost
                          </span>
                          <span className="font-mono font-extrabold text-amber-900 text-sm">
                            {formatCurrencyNPR(roomCost)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {room.readingDateBS ? `Logged on ${room.readingDateBS}` : 'Awaiting input'}
                    </span>
                    <Button
                      variant={isUpdated ? 'outline' : 'primary'}
                      size="xs"
                      disabled={isFuturePeriod}
                      onClick={() =>
                        setSelectedRoom({
                          roomId: room.roomId,
                          roomNumber: room.roomNumber,
                          roomName: `Room ${room.roomNumber}`,
                          tenantName: room.tenantName || 'Resident',
                          previousReading: room.previousReading ?? 0,
                          currentReading: room.currentReading,
                          unitRate: data?.unitRate || 15,
                          isBeforeMoveIn: room.isBeforeMoveIn,
                          moveInDateBS: room.moveInDateBS,
                        })
                      }
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{isUpdated ? 'Edit Reading' : 'Log Reading'}</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Historical Readings Log */}
      <Card>
        <CardHeader>
          <CardTitle>Historical Electricity Readings Log</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold">
                <th className="px-4 py-3">Room & Tenant</th>
                <th className="px-4 py-3">Period BS</th>
                <th className="px-4 py-3">Previous Reading</th>
                <th className="px-4 py-3">Current Reading</th>
                <th className="px-4 py-3">Units Used</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Total Cost</th>
                <th className="px-4 py-3">Entry Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No historical readings recorded yet.
                  </td>
                </tr>
              ) : (
                history.map((h: any) => (
                  <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-slate-900">
                      Room {h.room?.roomNumber || h.roomNumber}
                    </td>
                    <td className="px-4 py-3.5 font-mono">
                      {h.monthNameBS} {h.yearBS} BS
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-600">
                      {h.previousReading} units
                    </td>
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                      {h.currentReading} units
                    </td>
                    <td className="px-4 py-3.5 font-mono font-bold text-indigo-700">
                      {(h.unitsConsumed || 0).toFixed(1)} units
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-600">
                      Rs. {h.rate || 15}
                    </td>
                    <td className="px-4 py-3.5 font-mono font-extrabold text-slate-900">
                      {formatCurrencyNPR(h.totalCost)}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 font-mono text-[11px]">
                      {h.readingDateBS || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Reading Entry Modal */}
      {selectedRoom && (
        <ReadingEntryModal
          isOpen={true}
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
