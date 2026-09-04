'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { getTodayBS } from '@/lib/nepali-date';
import { Building2, User, Lock, ArrowRight, Calendar, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [todayBS, setTodayBS] = useState<{ nepaliFullFormatted: string } | null>(null);

  const { login, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setTodayBS(getTodayBS());
    if (user) {
      if (user.role === 'ADMIN') router.push('/admin');
      else router.push('/tenant');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const loggedUser = await login(username.trim().toLowerCase(), password);
      if (loggedUser.role === 'ADMIN') {
        router.push('/admin');
      } else {
        router.push('/tenant');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/20 to-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 mb-3 transform transition hover:scale-105">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            House Rental Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Private 6-Room Rental Portal &mdash; Electricity &middot; Bills &middot; Payments
          </p>

          {todayBS && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-semibold text-slate-600 bg-white/80 border border-slate-200/90 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              <span>{todayBS.nepaliFullFormatted}</span>
            </div>
          )}
        </div>

        {/* Card */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-card">
          <div className="mb-5 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Sign in to your account</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your credentials to access the dashboard
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  placeholder="admin or tenant username"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50/50 border border-slate-300/80 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Password"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50/50 border border-slate-300/80 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all font-medium"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={submitting}
              className="w-full mt-2 font-bold justify-center"
            >
              <span>{submitting ? 'Signing in...' : 'Sign In'}</span>
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </Button>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-400 mt-6">
          Bikram Sambat Calendar &bull; Financial Reconciliation Ledger &bull; Secure Auth
        </p>
      </div>
    </div>
  );
}
