import React from 'react';

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const s = (status || '').toUpperCase();

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';
  let label = status;

  switch (s) {
    case 'PAID':
    case 'VERIFIED':
    case 'COMPLETED':
      colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200/90';
      dotColor = 'bg-emerald-500';
      label = s === 'PAID' ? 'Paid' : s === 'VERIFIED' ? 'Verified' : 'Completed';
      break;
    case 'UNPAID':
    case 'REJECTED':
      colorClasses = 'bg-rose-50 text-rose-800 border-rose-200/90';
      dotColor = 'bg-rose-500';
      label = s === 'UNPAID' ? 'Unpaid' : 'Rejected';
      break;
    case 'PARTIALLY_PAID':
      colorClasses = 'bg-amber-50 text-amber-800 border-amber-200/90';
      dotColor = 'bg-amber-500';
      label = 'Partial';
      break;
    case 'PENDING':
    case 'PENDING_VERIFICATION':
      colorClasses = 'bg-amber-50 text-amber-800 border-amber-200/90';
      dotColor = 'bg-amber-500';
      label = s === 'PENDING_VERIFICATION' ? 'Verification Pending' : 'Pending';
      break;
    case 'OCCUPIED':
      colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200/90';
      dotColor = 'bg-emerald-500';
      label = 'Occupied';
      break;
    case 'VACANT':
      colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
      dotColor = 'bg-slate-400';
      label = 'Vacant';
      break;
    case 'ACTIVE':
      colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200/90';
      dotColor = 'bg-emerald-500';
      label = 'Active';
      break;
    case 'INACTIVE':
    case 'MOVED_OUT':
      colorClasses = 'bg-slate-100 text-slate-600 border-slate-200';
      dotColor = 'bg-slate-400';
      label = s === 'MOVED_OUT' ? 'Moved Out' : 'Inactive';
      break;
    case 'IN_PROGRESS':
      colorClasses = 'bg-blue-50 text-blue-800 border-blue-200/90';
      dotColor = 'bg-blue-500';
      label = 'In Progress';
      break;
    case 'NEW':
      colorClasses = 'bg-amber-50 text-amber-800 border-amber-200/90';
      dotColor = 'bg-amber-500';
      label = 'Pending';
      break;
    case 'SETTLED':
      colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200/90';
      dotColor = 'bg-emerald-500';
      label = 'Settled in Bill';
      break;
    case 'UNSETTLED':
      colorClasses = 'bg-purple-50 text-purple-800 border-purple-200/90';
      dotColor = 'bg-purple-500';
      label = 'Unsettled';
      break;
    default:
      label = status;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${colorClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      {label}
    </span>
  );
};
