import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-slate-200/70 rounded ${className}`} />
);

export const SkeletonCard: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs space-y-3"
      >
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-6 rounded-md" />
        </div>
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-3 w-48" />
      </div>
    ))}
  </div>
);

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 5,
}) => (
  <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
    <div className="p-4 border-b border-slate-100 flex justify-between">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-20" />
    </div>
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3.5 flex items-center justify-between gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-4 ${c === 0 ? 'w-28' : 'w-20'}`} />
          ))}
        </div>
      ))}
    </div>
  </div>
);
