'use client';

import React, { useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS, NEPALI_MONTH_NAMES } from '@/lib/nepali-date';

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
    room?.currentReading ? String(room.currentReading) : '',
  );
  const [previousReading, setPreviousReading] = useState<string>(
    room ? String(room.previousReading) : '0',
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
      setError(`Cannot enter readings for future months (Current month: ${today.yearBS} ${NEPALI_MONTH_NAMES[today.monthBS - 1]}).`);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden text-xs">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="font-semibold text-slate-900">Electricity Reading &mdash; Room {room.roomNumber}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-sm">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
            <div className="text-slate-500 text-[11px]">Tenant & Period</div>
            <div className="font-medium text-slate-900">
              {room.tenantName} &bull; {period.yearBS} {period.monthNameBS}
            </div>
            {room.moveInDateBS && (
              <div className="text-[10px] text-slate-500 mt-0.5">
                Move-in Date: <span className="font-semibold text-slate-700">{room.moveInDateBS}</span>
              </div>
            )}
          </div>

          {isFutureMonth && (
            <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <span className="font-bold block">Future Month Reading Prohibited</span>
              <span>Cannot enter electricity readings for future periods. Current active month is <strong>{today.yearBS} {NEPALI_MONTH_NAMES[today.monthBS - 1]}</strong>.</span>
            </div>
          )}

          {room.isBeforeMoveIn && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              <span className="font-bold block">Invalid Period (Before Move-In)</span>
              <span>This tenant moved in during <strong>{room.moveInDateBS || room.moveInPeriodText}</strong>. Electricity readings cannot be entered for earlier periods.</span>
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Previous Reading (Units)
            </label>
            <input
              type="number"
              step="any"
              value={previousReading}
              onChange={(e) => setPreviousReading(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-slate-900"
              placeholder="e.g. 100"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Current Reading (Units) *
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
              className={`w-full px-2.5 py-1.5 rounded border text-slate-900 text-xs focus:outline-none ${
                isLower
                  ? 'border-rose-500 ring-1 ring-rose-500'
                  : 'border-slate-300 focus:border-slate-900'
              }`}
              placeholder="e.g. 150"
              required
            />
          </div>

          {isLower && (
            <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[11px]">
              Current meter reading cannot be lower than previous reading.
            </div>
          )}

          {error && !isLower && (
            <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[11px]">
              {error}
            </div>
          )}

          {/* Live Calculation Preview */}
          {isValidNumber && !isLower && (
            <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-600">
                <span>Units Used:</span>
                <span className="font-semibold text-slate-900">
                  {currNum} - {prevNum} = {unitsUsed.toFixed(1)} units
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Rate:</span>
                <span>Rs. {room.unitRate}/unit</span>
              </div>
              <div className="pt-1.5 border-t border-slate-200 flex justify-between items-center font-medium">
                <span className="text-slate-800">Total Charge:</span>
                <span className="text-sm font-bold text-slate-900">
                  {formatCurrencyNPR(totalCharge)}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || isLower || !isValidNumber || !!room.isBeforeMoveIn}
              className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Reading'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
