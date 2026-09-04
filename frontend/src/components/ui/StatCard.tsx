import React from 'react';

export interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'accent' | 'neutral';
  className?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  badge,
  icon,
  variant = 'neutral',
  className = '',
  onClick,
}) => {
  const variantStyles = {
    primary: {
      card: 'border-indigo-100 hover:border-indigo-300 bg-gradient-to-br from-indigo-50/40 via-white to-white',
      iconBox: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
      value: 'text-indigo-950',
      badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    success: {
      card: 'border-emerald-100 hover:border-emerald-300 bg-gradient-to-br from-emerald-50/40 via-white to-white',
      iconBox: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
      value: 'text-emerald-950',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    warning: {
      card: 'border-amber-100 hover:border-amber-300 bg-gradient-to-br from-amber-50/40 via-white to-white',
      iconBox: 'bg-amber-50 text-amber-600 border border-amber-100',
      value: 'text-amber-950',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    danger: {
      card: 'border-rose-100 hover:border-rose-300 bg-gradient-to-br from-rose-50/40 via-white to-white',
      iconBox: 'bg-rose-50 text-rose-600 border border-rose-100',
      value: 'text-rose-950',
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    accent: {
      card: 'border-purple-100 hover:border-purple-300 bg-gradient-to-br from-purple-50/40 via-white to-white',
      iconBox: 'bg-purple-50 text-purple-600 border border-purple-100',
      value: 'text-purple-950',
      badge: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    neutral: {
      card: 'border-slate-200/80 hover:border-slate-300 bg-white',
      iconBox: 'bg-slate-100 text-slate-700 border border-slate-200',
      value: 'text-slate-900',
      badge: 'bg-slate-100 text-slate-700 border-slate-200',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl border p-4 sm:p-5 shadow-card transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5 ${style.card} ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </span>
        {icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.iconBox}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <div className={`text-xl sm:text-2xl font-extrabold tracking-tight font-mono ${style.value}`}>
          {value}
        </div>
        {badge && (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${style.badge}`}>
            {badge}
          </span>
        )}
      </div>

      {subtitle && (
        <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5 leading-relaxed">
          {subtitle}
        </div>
      )}
    </div>
  );
};
