import React from 'react';

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const s = (status || '').toUpperCase();

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
  let label = status;

  switch (s) {
    case 'PAID':
    case 'VERIFIED':
    case 'COMPLETED':
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      label = s === 'PAID' ? 'Paid' : s === 'VERIFIED' ? 'Verified' : 'Completed';
      break;
    case 'UNPAID':
    case 'REJECTED':
      colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
      label = s === 'UNPAID' ? 'Unpaid' : 'Rejected';
      break;
    case 'PARTIALLY_PAID':
      colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
      label = 'Partial';
      break;
    case 'PENDING':
    case 'PENDING_VERIFICATION':
      colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
      label = s === 'PENDING_VERIFICATION' ? 'Verification Pending' : 'Pending';
      break;
    case 'OCCUPIED':
      colorClasses = 'bg-slate-100 text-slate-800 border-slate-300';
      label = 'Occupied';
      break;
    case 'VACANT':
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      label = 'Vacant';
      break;
    case 'ACTIVE':
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      label = 'Active';
      break;
    case 'INACTIVE':
    case 'MOVED_OUT':
      colorClasses = 'bg-slate-100 text-slate-500 border-slate-200';
      label = s === 'MOVED_OUT' ? 'Moved Out' : 'Inactive';
      break;
    case 'IN_PROGRESS':
      colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
      label = 'In Progress';
      break;
    case 'NEW':
      colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
      label = 'Pending';
      break;
    default:
      label = status;
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${colorClasses} ${className}`}
    >
      {label}
    </span>
  );
};
