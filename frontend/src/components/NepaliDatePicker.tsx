'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  NEPALI_MONTH_NAMES,
  NEPALI_DAYS_SHORT,
  getTodayBS,
  getDaysInMonthBS,
  getFirstDayOfWeekBS,
  parseBsDate,
} from '@/lib/nepali-date';

interface NepaliDatePickerProps {
  value?: string;
  onChange: (formattedBS: string, isoBS: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export const NepaliDatePicker: React.FC<NepaliDatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select Nepali Date',
  required = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const today = getTodayBS();

  // Parse initial state or fallback to today
  const parsed = parseBsDate(value);
  const [viewYear, setViewYear] = useState<number>(parsed?.yearBS || today.yearBS);
  const [viewMonth, setViewMonth] = useState<number>(parsed?.monthBS || today.monthBS);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Update view when value changes externally
  useEffect(() => {
    const p = parseBsDate(value);
    if (p) {
      setViewYear(p.yearBS);
      setViewMonth(p.monthBS);
    }
  }, [value]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 280;
    const popoverHeight = 320;
    const padding = 12;

    // Horizontal clamping
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - popoverWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    // Vertical positioning & clamping
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top = rect.bottom + 6;
    if (spaceBelow < popoverHeight + padding && spaceAbove > popoverHeight + padding) {
      top = rect.top - popoverHeight - 6;
    } else if (spaceBelow < popoverHeight + padding && spaceAbove < popoverHeight + padding) {
      // Center vertically in viewport if tight
      top = Math.max(padding, (window.innerHeight - popoverHeight) / 2);
    }

    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // Close popup on click outside or Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const daysInMonth = getDaysInMonthBS(viewYear, viewMonth);
  const firstDayOfWeek = getFirstDayOfWeekBS(viewYear, viewMonth);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 1) {
      setViewYear((prev) => prev - 1);
      setViewMonth(12);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 12) {
      setViewYear((prev) => prev + 1);
      setViewMonth(1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const monthName = NEPALI_MONTH_NAMES[viewMonth - 1];
    const formattedBS = `${viewYear} ${monthName} ${day}`;
    const isoBS = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(formattedBS, isoBS);
    setIsOpen(false);
  };

  const handleSelectToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(today.nepaliFormatted, today.isoFormatted);
    setViewYear(today.yearBS);
    setViewMonth(today.monthBS);
    setIsOpen(false);
  };

  const yearOptions = [];
  for (let y = 2000; y <= 2099; y++) {
    yearOptions.push(y);
  }

  const selectedDate = parseBsDate(value);

  const calendarPopover = isOpen && mounted ? (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 99999,
        width: '280px',
      }}
      onClick={(e) => e.stopPropagation()}
      className="bg-white border border-slate-300 rounded-xl shadow-2xl p-3 text-xs animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      {/* Header Navigation */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="w-6 h-6 rounded hover:bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-sm transition"
          title="Previous Month"
        >
          &larr;
        </button>

        <div className="flex items-center gap-1.5">
          <select
            value={viewMonth}
            onChange={(e) => setViewMonth(Number(e.target.value))}
            className="px-1.5 py-1 rounded border border-slate-300 bg-white text-slate-900 font-semibold text-xs focus:outline-none focus:border-slate-900"
          >
            {NEPALI_MONTH_NAMES.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={viewYear}
            onChange={(e) => setViewYear(Number(e.target.value))}
            className="px-1.5 py-1 rounded border border-slate-300 bg-white text-slate-900 font-semibold text-xs focus:outline-none focus:border-slate-900"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          className="w-6 h-6 rounded hover:bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-sm transition"
          title="Next Month"
        >
          &rarr;
        </button>
      </div>

      {/* Days of Week Header */}
      <div className="grid grid-cols-7 gap-1 text-center font-bold text-slate-400 text-[10px] pb-1">
        {NEPALI_DAYS_SHORT.map((day) => (
          <div key={day} className="py-0.5">
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {/* Empty slots for first day offset */}
        {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
          <div key={`empty-${idx}`} className="h-7" />
        ))}

        {/* Days of current month */}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const dayNum = idx + 1;
          const isToday =
            today.yearBS === viewYear &&
            today.monthBS === viewMonth &&
            today.dayBS === dayNum;

          const isSelected =
            selectedDate &&
            selectedDate.yearBS === viewYear &&
            selectedDate.monthBS === viewMonth &&
            selectedDate.dayBS === dayNum;

          return (
            <button
              key={`day-${dayNum}`}
              type="button"
              onClick={() => handleSelectDay(dayNum)}
              className={`h-7 w-7 mx-auto rounded-full flex items-center justify-center font-medium transition text-xs ${
                isSelected
                  ? 'bg-slate-900 text-white font-bold shadow-xs'
                  : isToday
                  ? 'bg-slate-100 text-slate-900 font-bold border border-slate-300 hover:bg-slate-200'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {dayNum}
            </button>
          );
        })}
      </div>

      {/* Footer Controls */}
      <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <button
          type="button"
          onClick={handleSelectToday}
          className="text-slate-600 hover:text-slate-900 font-semibold px-2 py-0.5 rounded hover:bg-slate-100 transition"
        >
          Today ({today.yearBS} {NEPALI_MONTH_NAMES[today.monthBS - 1]} {today.dayBS})
        </button>

        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('', '');
              setIsOpen(false);
            }}
            className="text-rose-600 hover:text-rose-700 px-1.5 py-0.5 rounded hover:bg-rose-50 transition"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className={`relative ${className}`} ref={triggerRef}>
      {/* Input Field Trigger */}
      <div
        onClick={() => {
          if (!isOpen) updatePosition();
          setIsOpen(!isOpen);
        }}
        className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 text-xs flex items-center justify-between cursor-pointer hover:border-slate-400 focus-within:border-slate-900 transition-colors select-none"
      >
        <span className={value ? 'text-slate-900 font-medium truncate' : 'text-slate-400 truncate'}>
          {value || placeholder}
        </span>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1 py-0.5 rounded font-mono select-none ml-1 shrink-0">
          BS
        </span>
      </div>

      {/* Hidden input for form requirement if needed */}
      {required && (
        <input
          type="text"
          value={value || ''}
          required={required}
          className="sr-only"
          tabIndex={-1}
          onChange={() => {}}
        />
      )}

      {/* Portal-rendered Calendar */}
      {mounted && typeof document !== 'undefined' && calendarPopover && createPortal(calendarPopover, document.body)}
    </div>
  );
};
