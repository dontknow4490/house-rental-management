'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useToast } from '@/lib/toast-context';

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
      setNotices(data);
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
      toast.success('Notice posted successfully.');
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
      toast.success('Notice removed.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete notice');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Notices</h2>
          <p className="text-xs text-slate-500">Publish house notices and announcements</p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition"
        >
          Post Notice
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400 text-xs">
          Loading notices...
        </div>
      ) : notices.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-400 text-xs shadow-sm">
          No notices yet
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <div
              key={n.id}
              className={`bg-white border rounded-lg p-4 shadow-sm text-xs space-y-2 transition ${
                n.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">{n.title}</span>
                    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">
                      {n.category || 'General'}
                    </span>
                    {!n.isActive && (
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 font-medium">
                        Archived
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                    Posted on {n.createdDateBS}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(n.id)}
                    className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 text-[11px] text-slate-700"
                  >
                    {n.isActive ? 'Archive' : 'Publish'}
                  </button>
                  <button
                    onClick={() => handleOpenDelete(n.id)}
                    className="px-2 py-1 rounded border border-rose-200 hover:bg-rose-50 text-[11px] text-rose-700 font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <p className="text-slate-700 whitespace-pre-line leading-relaxed">{n.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Post Notice Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-md w-full shadow-lg text-xs space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
              Post House Notice
            </h3>
            <form onSubmit={handleCreateNotice} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Tank cleaning scheduled for Saturday"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 bg-white"
                >
                  <option value="GENERAL">General Announcement</option>
                  <option value="WATER">Water Supply</option>
                  <option value="ELECTRICITY">Electricity</option>
                  <option value="URGENT">Urgent Alert</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Content *</label>
                <textarea
                  rows={4}
                  required
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Write notice details for tenants..."
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium"
                >
                  Publish Notice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Delete House Notice"
        message="Are you sure you want to delete this notice? This action cannot be undone."
        confirmText="Delete Notice"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeleteTargetId(null);
        }}
      />
    </div>
  );
}
