'use client';

import React, { useEffect, useState } from 'react';
import { api, getFileUrl } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { SkeletonTable } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Wrench,
  AlertCircle,
  Clock,
  CheckCircle2,
  Calendar,
  Image as ImageIcon,
  MessageSquare,
  ExternalLink,
  Filter,
} from 'lucide-react';

export default function AdminMaintenancePage() {
  const toast = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await api.get('/maintenance');
      setRequests(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load maintenance requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    // Optimistic UI update: perceived 0ms latency
    const prevRequests = [...requests];
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
    );

    try {
      await api.put(`/maintenance/${id}/status`, { status: newStatus });
      const displayLabel = newStatus === 'NEW' ? 'New' : newStatus === 'IN_PROGRESS' ? 'In Progress' : 'Completed';
      toast.success(`Request status updated to ${displayLabel}.`);
    } catch (err: any) {
      setRequests(prevRequests); // Revert on failure
      toast.error(err.message || 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq || savingNotes) return;
    try {
      setSavingNotes(true);
      await api.put(`/maintenance/${selectedReq.id}/status`, {
        status: selectedReq.status,
        adminNotes,
      });
      // Optimistic update
      setRequests((prev) =>
        prev.map((r) => (r.id === selectedReq.id ? { ...r, adminNotes } : r))
      );
      setNotesModalOpen(false);
      setSelectedReq(null);
      toast.success('Admin notes updated.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'NEW' || r.status === 'PENDING').length;
  const inProgressCount = requests.filter((r) => r.status === 'IN_PROGRESS').length;
  const resolvedCount = requests.filter((r) => r.status === 'COMPLETED' || r.status === 'RESOLVED').length;

  const filteredRequests = requests.filter((r) => {
    if (!filterStatus) return true;
    if (filterStatus === 'NEW') return r.status === 'NEW' || r.status === 'PENDING';
    if (filterStatus === 'COMPLETED') return r.status === 'COMPLETED' || r.status === 'RESOLVED';
    return r.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="Operations"
        title="Maintenance & Repairs"
        subtitle="Track repair tickets, inspect reported photos, coordinate technicians, and log resolution notes"
      />

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          variant={pendingCount > 0 ? 'warning' : 'neutral'}
          title="Pending Requests"
          value={pendingCount}
          badge={pendingCount > 0 ? 'Needs Attention' : 'Clear'}
          icon={<AlertCircle className="w-5 h-5" />}
          subtitle="Awaiting technician review"
        />

        <StatCard
          variant="primary"
          title="In Progress"
          value={inProgressCount}
          badge="Under Repair"
          icon={<Wrench className="w-5 h-5" />}
          subtitle="Work currently underway"
        />

        <StatCard
          variant="success"
          title="Resolved Tickets"
          value={resolvedCount}
          badge="Completed"
          icon={<CheckCircle2 className="w-5 h-5" />}
          subtitle="Fixed and confirmed"
        />

        <StatCard
          variant="neutral"
          title="Total Maintenance Log"
          value={requests.length}
          badge="All Time"
          icon={<Clock className="w-5 h-5" />}
          subtitle="Lifetime ticket records"
        />
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setFilterStatus('')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all ${
              filterStatus === '' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>All Requests ({requests.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('NEW')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              filterStatus === 'NEW'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>New (Pending)</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                filterStatus === 'NEW' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {pendingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('IN_PROGRESS')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              filterStatus === 'IN_PROGRESS'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>In Progress</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                filterStatus === 'IN_PROGRESS' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {inProgressCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('COMPLETED')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              filterStatus === 'COMPLETED'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Completed</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                filterStatus === 'COMPLETED' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {resolvedCount}
            </span>
          </button>
        </div>
      </div>

      {/* Maintenance Tickets Table */}
      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : filteredRequests.length === 0 ? (
        <EmptyState
          icon={<Wrench className="w-6 h-6 text-indigo-500" />}
          title="No maintenance requests"
          description="Residents have not submitted any repair tickets under this filter."
        />
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold">
                  <th className="px-4 py-3">Room & Resident</th>
                  <th className="px-4 py-3">Issue Title & Description</th>
                  <th className="px-4 py-3">Reported Date</th>
                  <th className="px-4 py-3">Photo Proof</th>
                  <th className="px-4 py-3">Status Pipeline</th>
                  <th className="px-4 py-3">Admin Notes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {filteredRequests.map((r) => {
                  const roomNum = r.room?.roomNumber || '—';
                  const tenantName = r.tenant?.fullName || 'Tenant';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">Room {roomNum}</div>
                        <div className="text-[11px] text-slate-500">{tenantName}</div>
                      </td>

                      <td className="px-4 py-3.5 max-w-xs">
                        <div className="font-bold text-slate-900">{r.title}</div>
                        <p className="text-slate-600 text-[11px] mt-0.5 line-clamp-2">
                          {r.description}
                        </p>
                      </td>

                      <td className="px-4 py-3.5 font-mono text-slate-600">
                        {r.reportedDateBS || new Date(r.createdAt).toLocaleDateString()}
                      </td>

                      <td className="px-4 py-3.5">
                        {r.photoPath ? (
                          <button
                            type="button"
                            onClick={() => setSelectedPhoto(getFileUrl(r.photoPath))}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-indigo-600 font-semibold text-[11px] shadow-xs"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>View Photo</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <select
                          value={r.status === 'PENDING' ? 'NEW' : r.status === 'RESOLVED' ? 'COMPLETED' : r.status}
                          disabled={updatingId === r.id}
                          onChange={(e) => handleUpdateStatus(r.id, e.target.value)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-bold focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                        >
                          <option value="NEW">New (Pending)</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Completed</option>
                        </select>
                      </td>

                      <td className="px-4 py-3.5 max-w-[180px]">
                        {r.adminNotes ? (
                          <span className="text-[11px] text-slate-600 truncate block">
                            {r.adminNotes}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">No notes</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            setSelectedReq(r);
                            setAdminNotes(r.adminNotes || '');
                            setNotesModalOpen(true);
                          }}
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Notes</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedPhoto(null)}
          title="Maintenance Attachment Photo"
          description="Tenant submitted repair photo"
          icon={<ImageIcon className="w-5 h-5 text-indigo-600" />}
          maxWidth="lg"
        >
          <div className="space-y-3">
            <div className="rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center max-h-[65vh]">
              <img
                src={selectedPhoto}
                alt="Maintenance inspection"
                className="max-w-full max-h-[65vh] object-contain"
              />
            </div>
            <div className="flex justify-between items-center pt-2">
              <a
                href={selectedPhoto}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                <span>Open Original Image</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedPhoto(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Admin Notes Modal */}
      {notesModalOpen && selectedReq && (
        <Modal
          isOpen={true}
          onClose={() => setNotesModalOpen(false)}
          title={`Admin Notes — Ticket #${selectedReq.id.slice(-4).toUpperCase()}`}
          description={`Room ${selectedReq.room?.roomNumber || '—'} • ${selectedReq.title}`}
          icon={<MessageSquare className="w-5 h-5 text-indigo-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handleSaveNotes} className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Resolution & Progress Notes
              </label>
              <textarea
                rows={4}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="e.g. Electrician scheduled for tomorrow at 2 PM..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setNotesModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="font-bold">
                Save Notes
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
