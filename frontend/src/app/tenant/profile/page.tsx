'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { formatCurrencyNPR } from '@/lib/nepali-date';

export default function TenantProfilePage() {
  const { user } = useAuth();
  const roomNo = user?.tenantProfile?.roomNumber ?? (user?.tenantProfile as any)?.room?.roomNumber ?? '—';

  return (
    <div className="space-y-5 max-w-md mx-auto text-xs">
      <div className="pb-3 border-b border-slate-200">
        <h2 className="text-base font-bold text-slate-900">Tenant Profile</h2>
        <p className="text-xs text-slate-500">Room details and account information</p>
      </div>

      {/* Room Details Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{user?.fullName}</h3>
            <p className="text-[11px] text-slate-500 font-mono">@{user?.username}</p>
          </div>
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            Room {roomNo}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 block">Monthly Rent</span>
            <span className="font-semibold text-slate-900">
              {formatCurrencyNPR(user?.tenantProfile?.monthlyRent || 0)}
            </span>
          </div>

          <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 block">Move In Date</span>
            <span className="font-semibold text-slate-900">{user?.tenantProfile?.moveInDateBS || '—'}</span>
          </div>

          <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 block">Occupants</span>
            <span className="font-semibold text-slate-900">{user?.tenantProfile?.numberOfPeople || 1} Person(s)</span>
          </div>

          <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 block">Phone Number</span>
            <span className="font-semibold text-slate-900 font-mono">{user?.phone || '—'}</span>
          </div>
        </div>
      </div>

      {/* Account Security Information */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-2">
        <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider pb-1 border-b border-slate-100">
          Account Security
        </h3>
        <p className="text-slate-600 leading-relaxed">
          Tenant account security and login credentials are managed directly by the administrator.
        </p>
        <p className="text-slate-500 text-[11px]">
          If you need to change your password or update your registration details, please contact the house administrator.
        </p>
      </div>
    </div>
  );
}
