'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useAutoSync, broadcastSync } from '@/lib/sync';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SkeletonTable } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ShieldCheck,
  Search,
  Clock,
  User,
  Globe,
  Filter,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FileText,
  Calendar,
  Sparkles,
} from 'lucide-react';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  ROOM_CREATED: { label: 'Room Created', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  ROOM_UPDATED: { label: 'Room Updated', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  ROOM_DELETED: { label: 'Room Deleted', color: 'bg-rose-100 text-rose-800 border-rose-200' },
  TENANT_CREATED: { label: 'Tenant Created', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  TENANT_UPDATED: { label: 'Tenant Updated', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  TENANT_ROOM_MOVED: { label: 'Tenant Room Moved', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  TENANT_MOVED_OUT: { label: 'Tenant Moved Out', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  TENANT_DELETED: { label: 'Tenant Deleted', color: 'bg-rose-100 text-rose-800 border-rose-200' },
  TENANT_PASSWORD_RESET: { label: 'Password Reset', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  BILL_GENERATED: { label: 'Bill Generated', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  BILL_CORRECTED: { label: 'Bill Corrected', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  PAYMENT_SUBMITTED: { label: 'Payment Submitted', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  PAYMENT_VERIFIED: { label: 'Payment Verified', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  PAYMENT_REJECTED: { label: 'Payment Rejected', color: 'bg-rose-100 text-rose-800 border-rose-200' },
  PAYMENT_CASH_RECORDED: { label: 'Cash Payment Recorded', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  ELECTRICITY_READING_UPDATED: { label: 'Electricity Meter Updated', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  WATER_PURCHASE_CREATED: { label: 'Water Purchase Created', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  CUSTOM_PURCHASE_CREATED: { label: 'Custom Charge Added', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  MAINTENANCE_STATUS_UPDATED: { label: 'Maintenance Updated', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  NOTICE_CREATED: { label: 'Notice Created', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  AUDIT_LOGS_PURGED: { label: 'Audit Logs Cleaned Up', color: 'bg-rose-100 text-rose-800 border-rose-200' },
};

function formatDetailsSummary(detailsJson?: string | null): string {
  if (!detailsJson) return 'No additional payload details';
  try {
    const obj = JSON.parse(detailsJson);
    if (typeof obj === 'string') return obj;
    const parts: string[] = [];

    if (obj.roomNumber) parts.push(`Room ${obj.roomNumber}`);
    if (obj.fullName) parts.push(`Tenant: ${obj.fullName}`);
    if (obj.amount) parts.push(`Amount: Rs. ${obj.amount}`);
    if (obj.rent) parts.push(`Rent: Rs. ${obj.rent}`);
    if (obj.defaultRent) parts.push(`Base Rent: Rs. ${obj.defaultRent}`);
    if (obj.newRoomNumber) parts.push(`Moved to Room ${obj.newRoomNumber}`);
    if (obj.oldTotal !== undefined && obj.newTotal !== undefined) {
      parts.push(`Bill Total: Rs. ${obj.oldTotal} → Rs. ${obj.newTotal}`);
    }
    if (obj.reason) parts.push(`Reason: "${obj.reason}"`);
    if (obj.notes) parts.push(`Notes: "${obj.notes}"`);
    if (obj.filter) parts.push(`Cleanup filter applied`);

    if (parts.length > 0) return parts.join(' • ');

    // Fallback key-value pairs summary
    return Object.entries(obj)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' | ');
  } catch {
    return detailsJson;
  }
}

export default function AdminAuditPage() {
  const toast = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination & Filtering state
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Delete / Cleanup Modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [purgeOption, setPurgeOption] = useState<'30' | '60' | '90' | 'all'>('30');
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search.trim()) params.set('search', search.trim());
      if (actionFilter) params.set('action', actionFilter);

      const res = await api.get(`/audit-logs?${params.toString()}`);
      if (res && Array.isArray(res.data)) {
        setLogs(res.data);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      } else if (Array.isArray(res)) {
        setLogs(res);
        setTotal(res.length);
        setTotalPages(1);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page, actionFilter]);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadLogs();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useAutoSync(loadLogs, ['audit', 'all']);

  const handlePurgeLogs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmPurge) {
      toast.warning('Please check the confirmation box before deleting audit logs.');
      return;
    }

    setPurging(true);
    try {
      const payload: any = {};
      if (purgeOption === '30') payload.olderThanDays = 30;
      else if (purgeOption === '60') payload.olderThanDays = 60;
      else if (purgeOption === '90') payload.olderThanDays = 90;
      else if (purgeOption === 'all') payload.deleteAllConfirmed = true;

      const res = await api.delete('/audit-logs', payload);
      broadcastSync('audit');
      toast.success(res.message || 'Audit logs cleaned up successfully.');
      setIsDeleteModalOpen(false);
      setConfirmPurge(false);
      setPage(1);
      loadLogs();
    } catch (err: any) {
      toast.error(err.message || 'Failed to clean up audit logs');
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="System Integrity"
        title="Audit Logs & Governance"
        subtitle="Security timeline tracking administrative actions, billing corrections, and system events"
        actions={
          <Button
            onClick={() => setIsDeleteModalOpen(true)}
            variant="outline"
            size="sm"
            className="font-bold border-rose-200 text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span>Clean Up Audit Logs</span>
          </Button>
        }
      />

      {/* Filter & Search Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by action, user, or details..."
              className="w-full pl-9 pr-3.5 py-1.5 rounded-xl border border-slate-300 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white font-medium"
            />
          </div>

          <div className="relative w-full sm:w-56">
            <Filter className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-slate-900 text-xs bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-medium"
            >
              <option value="">All Action Types</option>
              <option value="ROOM_CREATED">Room Created</option>
              <option value="ROOM_UPDATED">Room Updated</option>
              <option value="TENANT_CREATED">Tenant Created</option>
              <option value="TENANT_ROOM_MOVED">Tenant Room Moved</option>
              <option value="TENANT_MOVED_OUT">Tenant Moved Out</option>

              <option value="BILL_GENERATED">Bill Generated</option>
              <option value="BILL_CORRECTED">Bill Corrected</option>
              <option value="PAYMENT_CASH_RECORDED">Cash Payment Recorded</option>
              <option value="PAYMENT_VERIFIED">Payment Verified</option>
              <option value="PAYMENT_REJECTED">Payment Rejected</option>
              <option value="ELECTRICITY_READING_UPDATED">Electricity Meter Updated</option>
              <option value="AUDIT_LOGS_PURGED">Audit Logs Cleaned Up</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-semibold shrink-0">
          Showing <span className="text-slate-900 font-bold font-mono">{logs.length}</span> of{' '}
          <span className="text-slate-900 font-bold font-mono">{total}</span> events
        </div>
      </div>

      {/* Audit Log Table */}
      {loading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="w-6 h-6 text-indigo-500" />}
          title="No audit logs match your search"
          description="Clear your search filters to view system event logs."
        />
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold">
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Performed By</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Human Summary</th>
                  <th className="px-4 py-3">IP Info</th>
                  <th className="px-3 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {logs.map((l) => {
                  const meta = ACTION_LABELS[l.action] || {
                    label: l.action.replace(/_/g, ' '),
                    color: 'bg-slate-100 text-slate-800 border-slate-200',
                  };
                  const isExpanded = expandedId === l.id;
                  const summaryText = formatDetailsSummary(l.details);

                  return (
                    <React.Fragment key={l.id}>
                      <tr
                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-slate-50/90' : ''
                        }`}
                        onClick={() => setExpandedId(isExpanded ? null : l.id)}
                      >
                        <td className="px-4 py-3.5 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(l.createdAt).toLocaleString()}</span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {l.user ? (
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[11px] flex items-center justify-center border border-indigo-100">
                                {l.user.fullName.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 block leading-tight">
                                  {l.user.fullName}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  @{l.user.username} &bull; {l.user.role}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-slate-500 italic">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <span>System Automated</span>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold border shadow-2xs ${meta.color}`}
                          >
                            {meta.label}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 max-w-xs sm:max-w-sm text-slate-700 leading-relaxed truncate font-medium">
                          {summaryText}
                        </td>

                        <td className="px-4 py-3.5 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Globe className="w-3 h-3 text-slate-400" />
                            <span>{l.ipAddress || 'Internal'}</span>
                          </div>
                        </td>

                        <td className="px-3 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(isExpanded ? null : l.id);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 transition"
                          >
                            <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Technical Payload Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-900 text-slate-100">
                          <td colSpan={6} className="p-4 sm:p-5">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                                <span className="font-bold text-slate-300 flex items-center gap-1.5 font-mono">
                                  <FileText className="w-4 h-4 text-indigo-400" />
                                  Technical Audit Record Payload &mdash; Event #{l.id.slice(-8)}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  Logged at {new Date(l.createdAt).toISOString()}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 text-[11px]">
                                  <div className="text-slate-400 font-bold mb-1 border-b border-slate-800 pb-1">
                                    Event Parameters
                                  </div>
                                  <div>
                                    <span className="text-indigo-400">Action:</span> {l.action}
                                  </div>
                                  <div>
                                    <span className="text-indigo-400">User ID:</span> {l.userId || 'N/A'}
                                  </div>
                                  <div>
                                    <span className="text-indigo-400">Username:</span> {l.username || l.user?.username || 'N/A'}
                                  </div>
                                  <div>
                                    <span className="text-indigo-400">IP Address:</span> {l.ipAddress || 'Internal'}
                                  </div>
                                </div>

                                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                                  <div className="text-slate-400 font-bold mb-1 border-b border-slate-800 pb-1">
                                    Parsed Details JSON
                                  </div>
                                  <pre className="text-[11px] text-emerald-400 overflow-x-auto whitespace-pre-wrap font-mono max-h-40">
                                    {l.details
                                      ? JSON.stringify(JSON.parse(l.details), null, 2)
                                      : 'No payload data stored'}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Server-Side Pagination Bar */}
          {totalPages > 1 && (
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs">
              <div className="text-slate-600 font-medium">
                Page <span className="font-bold text-slate-900 font-mono">{page}</span> of{' '}
                <span className="font-bold text-slate-900 font-mono">{totalPages}</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="font-bold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </Button>

                <Button
                  variant="outline"
                  size="xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="font-bold"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete / Cleanup Audit Logs Modal */}
      {isDeleteModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Clean Up Audit Logs"
          description="Safely purge historical administrative logs while maintaining business data integrity"
          icon={<AlertTriangle className="w-5 h-5 text-rose-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handlePurgeLogs} className="space-y-4 text-xs">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 space-y-1 leading-relaxed">
              <div className="font-bold flex items-center gap-1.5 text-rose-950">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Audit Trail Notice
              </div>
              <p className="text-[11px] text-rose-800">
                Audit log cleanup will permanently delete log history records. Financial bills, payments, and room data will remain completely untouched.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Select Retention Cleanup Option <span className="text-rose-500">*</span>
              </label>
              <select
                value={purgeOption}
                onChange={(e: any) => setPurgeOption(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white"
              >
                <option value="30">Delete logs older than 30 days (Recommended)</option>
                <option value="60">Delete logs older than 60 days</option>
                <option value="90">Delete logs older than 90 days</option>
                <option value="all">Purge all existing audit logs</option>
              </select>
            </div>

            <div className="pt-2">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmPurge}
                  onChange={(e) => setConfirmPurge(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span className="text-slate-700 font-medium text-[11px]">
                  I confirm that I want to delete the selected audit logs and understand this action cannot be undone.
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={purging}
              >
                Cancel
              </Button>
              <button
                type="submit"
                disabled={!confirmPurge || purging}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {purging ? 'Purging Logs...' : 'Confirm Purge Audit Logs'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
