import React from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  category?: string;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  category,
  actions,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80 ${className}`}
    >
      <div>
        {category && (
          <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-1 block">
            {category}
          </span>
        )}
        <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <div className="text-xs text-slate-500 mt-1 leading-relaxed">
            {subtitle}
          </div>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
};
