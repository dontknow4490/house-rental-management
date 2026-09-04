'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { SkeletonTable } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ShieldCheck, Search, Clock, User, Globe } from 'lucide-react';

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await api.get('/audit-logs');
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((l) => {
    const q = search.toLowerCase();
    return (
      l.action?.toLowerCase().includes(q) ||
      l.details?.toLowerCase().includes(q) ||
      l.user?.fullName?.toLowerCase().includes(q) ||
      l.user?.username?.toLowerCase().includes(q) ||
      l.ipAddress?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="System Integrity"
        title="Immutable Audit Log"
        subtitle="Security timeline tracking administrative actions, payment verifications, and room modifications"
      />

      {/* Search Filter Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by action, user, or IP address..."
            className="w-full pl-9 pr-3.5 py-1.5 rounded-xl border border-slate-300 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white"
          />
        </div>
        <span className="text-xs text-slate-500 font-medium hidden sm:inline">
          {filteredLogs.length} events logged
        </span>
      </div>

      {/* Audit Log Table */}
      {loading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : filteredLogs.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="w-6 h-6 text-indigo-500" />}
          title="No audit records match your search"
          description="Clear your filter to view all system events."
        />
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold">
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor / User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Event Details</th>
                  <th className="px-4 py-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {filteredLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{new Date(l.createdAt).toLocaleString()}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {l.user ? (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-indigo-500" />
                          <div>
                            <span className="font-bold text-slate-900">{l.user.fullName}</span>
                            <span className="text-[10px] text-slate-500 font-mono block">
                              @{l.user.username}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">System</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200 font-mono">
                        {l.action}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 max-w-md text-slate-700 leading-relaxed">
                      {l.details || <span className="text-slate-400 italic">&mdash;</span>}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Globe className="w-3 h-3 text-slate-400" />
                        <span>{l.ipAddress || '127.0.0.1'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
