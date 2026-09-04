'use client';

import React, { useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS, NEPALI_MONTH_NAMES } from '@/lib/nepali-date';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Zap, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';

interface ReadingEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  room: {
    roomId: string;
    roomNumber: number;
    roomName: string;
    tenantName: string;
    previousReading: number;
    currentReading?: number | null;
    unitRate: number;
    isBeforeMoveIn?: boolean;
    moveInDateBS?: string | null;
    moveInPeriodText?: string;
  } | null;
  period: {
    yearBS: number;
    monthBS: number;
    monthNameBS: string;
  };
}

export const ReadingEntryModal: React.FC<ReadingEntryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  room,
  period,
}) => {
  const [currentReading, setCurrentReading] = useState<string>(
    room?.currentReading ? String(room.currentReading) : ''
  );
  const [previousReading, setPreviousReading] = useState<string>(
    room ? String(room.previousReading) : '0'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !room) return null;

  const today = getTodayBS();
  const isFutureMonth =
    period.yearBS > today.yearBS ||
    (period.yearBS === today.yearBS && period.monthBS > today.monthBS);

  const prevNum = parseFloat(previousReading) || 0;
  const currNum = parseFloat(currentReading);

  const isValidNumber = !isNaN(currNum);
  const isLower = isValidNumber && currNum < prevNum;
  const unitsUsed = isValidNumber && !isLower ? Math.max(0, currNum - prevNum) : 0;
  const totalCharge = unitsUsed * (room.unitRate || 15);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFutureMonth) {
      setError(
        `Cannot enter readings for future months (Current month: ${today.yearBS} ${
          NEPALI_MONTH_NAMES[today.monthBS - 1]
        }).`
      );
      return;
    }
    if (!isValidNumber) {
      setError('Please enter a valid meter reading number');
      return;
    }
    if (isLower) {
      setError('Current meter reading cannot be lower than the previous reading.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.post('/electricity/reading', {
        roomId: room.roomId,
        yearBS: period.yearBS,
        monthBS: period.monthBS,
        currentReading: currNum,
        previousReading: prevNum,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save electricity reading');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Electricity Reading — Room ${room.roomNumber}`}
      description={`${room.tenantName} • ${period.monthNameBS} ${period.yearBS} BS`}
      icon={<Zap className="w-5 h-5 text-amber-500" />}
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {room.moveInDateBS && (
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600">
            Tenant Move-in Date: <strong className="text-slate-900">{room.moveInDateBS}</strong>
          </div>
        )}

        {isFutureMonth && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Future Month Reading Prohibited</strong>
              <span>
                Active current month is{' '}
                <strong>
                  {today.yearBS} {NEPALI_MONTH_NAMES[today.monthBS - 1]}
                </strong>
                .
              </span>
            </div>
          </div>
        )}

        {room.isBeforeMoveIn && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Invalid Period (Before Move-In)</strong>
              <span>
                Tenant moved in during{' '}
                <strong>{room.moveInDateBS || room.moveInPeriodText}</strong>.
              </span>
            </div>
          </div>
        )}

        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Previous Reading (Units)
          </label>
          <input
            type="number"
            step="any"
            value={previousReading}
            onChange={(e) => setPreviousReading(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500"
            placeholder="e.g. 100"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Current Reading (Units) <span className="text-rose-500">*</span>
          </label>
          <input
            type="number"
            step="any"
            autoFocus
            value={currentReading}
            onChange={(e) => {
              setCurrentReading(e.target.value);
              setError(null);
            }}
            className={`w-full px-3 py-2 rounded-xl border font-mono font-bold text-sm text-slate-900 focus:outline-none ${
              isLower
                ? 'border-rose-500 ring-2 ring-rose-100'
                : 'border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
            }`}
            placeholder="e.g. 150"
            required
          />
        </div>

        {isLower && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            Current meter reading cannot be lower than previous reading ({prevNum}).
          </div>
        )}

        {error && !isLower && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        {/* Live Calculation Preview */}
        {isValidNumber && !isLower && (
          <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200/80 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Units Consumed:</span>
              <span className="font-mono font-bold text-slate-900">
                {currNum} &minus; {prevNum} = {unitsUsed.toFixed(1)} units
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Unit Rate:</span>
              <span className="font-mono">Rs. {room.unitRate || 15} / unit</span>
            </div>
            <div className="pt-2 border-t border-amber-200/60 flex justify-between items-center font-bold">
              <span className="text-slate-800">Total Electricity Bill:</span>
              <span className="text-sm font-extrabold text-amber-900 font-mono">
                {formatCurrencyNPR(totalCharge)}
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={loading || isLower || !isValidNumber || !!room.isBeforeMoveIn}
            className="font-bold"
          >
            {loading ? 'Saving...' : 'Save Reading'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
