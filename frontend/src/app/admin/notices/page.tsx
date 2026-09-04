'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useToast } from '@/lib/toast-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SkeletonCard } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  BellRing,
  PlusCircle,
  Calendar,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  Info,
  CreditCard,
  Wrench,
  CheckCircle,
} from 'lucide-react';

export default function AdminNoticesPage() {
  const toast = useToast();
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    content: '',
    category: 'GENERAL',
  });

  const loadNotices = async () => {
    try {
      setLoading(true);
      const data = await api.get('/notices/all');
      setNotices(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load notices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotices();
  }, []);

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      toast.warning('Please fill in title and content');
      return;
    }

    try {
      await api.post('/notices', form);
      setModalOpen(false);
      setForm({ title: '', content: '', category: 'GENERAL' });
      loadNotices();
      toast.success('Notice published to all residents.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to post notice');
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      await api.put(`/notices/${id}/toggle`, {});
      loadNotices();
      toast.success('Notice status updated.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update notice');
    }
  };

  const handleOpenDelete = (id: string) => {
    setDeleteTargetId(id);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await api.delete(`/notices/${deleteTargetId}`);
      setDeleteModalOpen(false);
      setDeleteTargetId(null);
      loadNotices();
      toast.success('Notice deleted.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete notice');
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'URGENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>Urgent Notice</span>
          </span>
        );
      case 'PAYMENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <CreditCard className="w-3 h-3 text-amber-600" />
            <span>Payment Reminder</span>
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
            <Wrench className="w-3 h-3 text-blue-600" />
            <span>Maintenance</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
            <Info className="w-3 h-3 text-indigo-600" />
            <span>General Announcement</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="Communications"
        title="Announcements & Notices"
        subtitle="Broadcast house notices, payment due dates, and maintenance announcements to residents"
        actions={
          <Button
            onClick={() => setModalOpen(true)}
            variant="primary"
            size="sm"
            className="font-bold shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Post New Notice</span>
          </Button>
        }
      />

      {/* Notices Grid */}
      {loading ? (
        <SkeletonCard count={3} />
      ) : notices.length === 0 ? (
        <EmptyState
          icon={<BellRing className="w-6 h-6 text-indigo-500" />}
          title="No notices published"
          description="Create your first house announcement to notify all residents."
          action={
            <Button onClick={() => setModalOpen(true)} variant="primary" size="sm">
              <PlusCircle className="w-4 h-4" />
              <span>Post New Notice</span>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notices.map((n) => {
            const isActive = n.isActive !== false;

            return (
              <div
                key={n.id}
                className={`rounded-2xl border p-5 shadow-card transition-all duration-200 hover:shadow-card-hover flex flex-col justify-between ${
                  isActive
                    ? 'bg-white border-slate-200/80'
                    : 'bg-slate-50/70 border-slate-200 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      {getCategoryBadge(n.category)}
                      <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{n.createdAtBS || new Date(n.createdAt).toLocaleDateString()}</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleActive(n.id)}
                      className={`text-xs font-semibold flex items-center gap-1 ${
                        isActive ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      {isActive ? (
                        <>
                          <ToggleRight className="w-5 h-5 text-emerald-600" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-5 h-5 text-slate-400" />
                          <span>Archived</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="py-3.5 space-y-2">
                    <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                      {n.title}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                      {n.content}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400">
                    Visible on tenant dashboard: {isActive ? 'Yes' : 'No'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenDelete(n.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                    title="Delete notice"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Post Notice Modal */}
      {modalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setModalOpen(false)}
          title="Post Announcement Notice"
          description="Send a message to all tenant dashboards"
          icon={<BellRing className="w-5 h-5 text-indigo-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handleCreateNotice} className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 bg-white"
              >
                <option value="GENERAL">General Notice</option>
                <option value="PAYMENT">Payment Reminder</option>
                <option value="MAINTENANCE">Maintenance / Utility Notice</option>
                <option value="URGENT">Urgent Alert</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Notice Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Water tank cleaning schedule"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Content / Details <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={4}
                placeholder="Write your announcement details here..."
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="font-bold">
                Publish Notice
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <ConfirmModal
          isOpen={true}
          isDanger={true}
          title="Delete Notice?"
          message="This announcement will be permanently removed from all tenant dashboards."
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteModalOpen(false)}
        />
      )}
    </div>
  );
}
