'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getTodayBS } from '@/lib/nepali-date';
import Link from 'next/link';
import { NotificationBell } from '@/components/NotificationBell';

const TENANT_NAV_ITEMS = [
  { name: 'Dashboard', href: '/tenant' },
  { name: 'Bills & Pay', href: '/tenant/bills' },
  { name: 'Maintenance', href: '/tenant/maintenance' },
  { name: 'Notices', href: '/tenant/notices' },
  { name: 'Profile', href: '/tenant/profile' },
];

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [todayBS, setTodayBS] = useState<{ nepaliFullFormatted: string } | null>(null);

  useEffect(() => {
    setTodayBS(getTodayBS());
    if (!loading && (!user || user.role !== 'TENANT')) {
      if (user?.role === 'ADMIN') router.push('/admin');
      else router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const roomNo = user?.tenantProfile?.roomNumber ?? (user?.tenantProfile as any)?.room?.roomNumber ?? '—';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col pb-16 md:pb-0">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 py-3 sm:px-6 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900">{user.fullName}</span>
              <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                Room {roomNo}
              </span>
            </div>
            {todayBS && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                {todayBS.nepaliFullFormatted}
              </p>
            )}
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
            {TENANT_NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href === '/tenant/bills' && (pathname === '/tenant/pay' || pathname === '/tenant/receipts'));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md transition ${
                    isActive
                      ? 'bg-slate-900 text-white font-semibold shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <NotificationBell role="TENANT" />

            <button
              onClick={() => logout()}
              className="px-2.5 py-1 text-xs text-rose-600 hover:text-rose-700 font-medium hover:bg-rose-50 rounded border border-rose-200 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Tenant Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6">
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-40 px-2 py-1.5 md:hidden">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {TENANT_NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href === '/tenant/bills' && (pathname === '/tenant/pay' || pathname === '/tenant/receipts'));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center py-1 px-2 rounded text-xs transition ${
                  isActive
                    ? 'text-slate-900 font-bold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span className="text-[11px]">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
