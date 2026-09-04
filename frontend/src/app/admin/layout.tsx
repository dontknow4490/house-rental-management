'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getTodayBS } from '@/lib/nepali-date';
import Link from 'next/link';
import { NotificationBell } from '@/components/NotificationBell';
import {
  LayoutDashboard,
  Home,
  Users,
  Receipt,
  CreditCard,
  ShoppingBag,
  Zap,
  Droplets,
  BellRing,
  Wrench,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  Building2,
  Calendar,
} from 'lucide-react';

interface NavGroup {
  groupName: string;
  items: {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}

const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    groupName: 'Overview',
    items: [{ name: 'Dashboard', href: '/admin', icon: LayoutDashboard }],
  },
  {
    groupName: 'Property & Tenants',
    items: [
      { name: 'Rooms', href: '/admin/rooms', icon: Home },
      { name: 'Tenants', href: '/admin/tenants', icon: Users },
    ],
  },
  {
    groupName: 'Finances & Billing',
    items: [
      { name: 'Monthly Bills', href: '/admin/billing', icon: Receipt },
      { name: 'Payments', href: '/admin/payments', icon: CreditCard },
      { name: 'Purchases / Extras', href: '/admin/custom-purchases', icon: ShoppingBag },
    ],
  },
  {
    groupName: 'Utilities',
    items: [
      { name: 'Electricity', href: '/admin/electricity', icon: Zap },
      { name: 'Water Tracker', href: '/admin/water', icon: Droplets },
    ],
  },
  {
    groupName: 'Operations & System',
    items: [
      { name: 'Notices', href: '/admin/notices', icon: BellRing },
      { name: 'Maintenance', href: '/admin/maintenance', icon: Wrench },
      { name: 'Settings', href: '/admin/settings', icon: Settings },
      { name: 'Audit Log', href: '/admin/audit', icon: ShieldCheck },
    ],
  },
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

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [mobileOpen]);

  if (loading || !user || user.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-500 font-medium">Authenticating Admin...</p>
        </div>
      </div>
    );
  }

  // Find active nav item name for breadcrumb
  let activePageName = 'Dashboard';
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.href) {
        activePageName = item.name;
        break;
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col md:flex-row text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Mobile Top App Bar */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-xs tracking-tight text-slate-900 block leading-tight">
              House Rental
            </span>
            <span className="text-[10px] font-semibold text-indigo-600 block leading-tight">
              Admin Portal
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell role="ADMIN" />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition"
            aria-label="Toggle Navigation Drawer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fadeIn"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar (Desktop sticky + Mobile slide-in drawer) */}
      <aside
        className={`fixed md:sticky top-0 z-50 md:z-40 h-screen w-64 bg-white border-r border-slate-200/80 flex flex-col transition-transform duration-200 ease-out shadow-lg md:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white flex items-center justify-center shadow-xs shadow-indigo-200">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-slate-900 tracking-tight leading-tight">
                House Rental
              </h2>
              <p className="text-[11px] font-semibold text-indigo-600 leading-tight">
                Management System
              </p>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {ADMIN_NAV_GROUPS.map((group) => (
            <div key={group.groupName} className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {group.groupName}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 relative ${
                        isActive
                          ? 'bg-indigo-50/80 text-indigo-700 font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      {/* Active Indicator bar */}
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-indigo-600" />
                      )}
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive
                            ? 'text-indigo-600'
                            : 'text-slate-400 group-hover:text-slate-700'
                        }`}
                      />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Admin Profile & Logout Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200 shrink-0">
                {user.fullName ? user.fullName.slice(0, 2).toUpperCase() : 'AD'}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-xs text-slate-900 truncate leading-tight">
                {user.fullName}
              </p>
              <p className="text-[10px] text-slate-500 truncate leading-tight">
                @{user.username}
              </p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            title="Log Out"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
            aria-label="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Desktop Sticky Header */}
        <header className="hidden md:flex items-center justify-between px-6 py-3.5 bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Admin</span>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-bold text-slate-800">{activePageName}</span>
          </div>

          <div className="flex items-center gap-3">
            {todayBS && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-slate-700 bg-slate-100/90 border border-slate-200">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>{todayBS.nepaliFullFormatted}</span>
              </div>
            )}
            <NotificationBell role="ADMIN" />
          </div>
        </header>

        {/* Page Body Container */}
        <div className="p-4 sm:p-6 lg:p-8 flex-1 max-w-7xl w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
