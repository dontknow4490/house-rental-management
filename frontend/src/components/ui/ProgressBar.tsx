import React from 'react';

export interface ProgressSegment {
  label: string;
  value: number;
  colorClass: string;
}

export interface ProgressBarProps {
  segments: ProgressSegment[];
  total?: number;
  height?: string;
  showLabels?: boolean;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  segments,
  total,
  height = 'h-2.5',
  showLabels = true,
  className = '',
}) => {
  const calculatedTotal =
    total ?? segments.reduce((acc, curr) => acc + Math.max(0, curr.value), 0);

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        className={`w-full bg-slate-100 rounded-full overflow-hidden flex ${height}`}
      >
        {calculatedTotal > 0 ? (
          segments.map((seg, idx) => {
            if (seg.value <= 0) return null;
            const pct = Math.min(100, Math.max(0, (seg.value / calculatedTotal) * 100));
            return (
              <div
                key={idx}
                title={`${seg.label}: ${pct.toFixed(1)}%`}
                style={{ width: `${pct}%` }}
                className={`${seg.colorClass} transition-all duration-300 first:rounded-l-full last:rounded-r-full`}
              />
            );
          })
        ) : (
          <div className="w-full bg-slate-200" />
        )}
      </div>

      {showLabels && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
          {segments.map((seg, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${seg.colorClass}`} />
              <span>{seg.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
