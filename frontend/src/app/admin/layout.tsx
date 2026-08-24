'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getTodayBS } from '@/lib/nepali-date';
import Link from 'next/link';
import { NotificationBell } from '@/components/NotificationBell';

const ADMIN_NAV_ITEMS = [
  { name: 'Dashboard', href: '/admin' },
  { name: 'Rooms', href: '/admin/rooms' },
  { name: 'Tenants', href: '/admin/tenants' },
  { name: 'Electricity', href: '/admin/electricity' },
  { name: 'Bills', href: '/admin/billing' },
  { name: 'Payments', href: '/admin/payments' },
  { name: 'Water', href: '/admin/water' },
  { name: 'Notices', href: '/admin/notices' },
  { name: 'Maintenance', href: '/admin/maintenance' },
  { name: 'Settings', href: '/admin/settings' },
  { name: 'Audit Log', href: '/admin/audit' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [todayBS, setTodayBS] = useState<{ nepaliFullFormatted: string } | null>(null);

  useEffect(() => {
    setTodayBS(getTodayBS());
    if (!loading && (!user || user.role !== 'ADMIN')) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-900">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-3.5 bg-white border-b border-slate-200">
        <span className="font-bold text-sm text-slate-900">House Rental Admin</span>
        <div className="flex items-center gap-2">
          <NotificationBell role="ADMIN" />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="px-2.5 py-1 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
          >
            {mobileOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky top-0 z-40 h-screen w-52 bg-white border-r border-slate-200 flex flex-col transition-transform duration-150 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-bold text-sm text-slate-900">House Rental</h2>
          <p className="text-[11px] text-slate-500">Administrator</p>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {ADMIN_NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded-md text-xs font-medium transition ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User Status & Logout */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <div className="truncate pr-2">
            <p className="font-medium text-slate-900 truncate">{user.fullName}</p>
            <p className="text-[10px] text-slate-500">@{user.username}</p>
          </div>
          <button
            onClick={() => logout()}
            className="text-xs text-rose-600 hover:text-rose-700 font-medium"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header Bar */}
        <header className="hidden md:flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-30">
          <h1 className="text-sm font-semibold text-slate-900">House Rental Management</h1>

          <div className="flex items-center gap-3">
            {todayBS && (
              <div className="text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded border border-slate-200">
                {todayBS.nepaliFullFormatted}
              </div>
            )}
            <NotificationBell role="ADMIN" />
          </div>
        </header>

        {/* Page Body */}
        <div className="p-4 sm:p-6 flex-1 max-w-6xl w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
