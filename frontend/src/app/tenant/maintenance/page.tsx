'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api, getFileUrl } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { useAutoSync, broadcastSync } from '@/lib/sync';

const CATEGORIES = [
  'Electrical',
  'Internet',
  'Door / Window',
  'Other',
];

export default function TenantMaintenancePage() {
  const toast = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    category: 'Electrical',
    description: '',
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);

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

  // Real-time synchronization for tenant maintenance view
  useAutoSync(loadRequests, ['maintenance', 'all']);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      toast.warning('Please fill in title and description');
      return;
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
    }
    const idempotencyKey = idempotencyKeyRef.current;

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('title', form.title.trim());
      formData.append('category', form.category);
      formData.append('description', form.description.trim());
      formData.append('idempotencyKey', idempotencyKey);
      if (photoFile) {
        formData.append('photo', photoFile);
      }

      await api.post('/maintenance', formData);
      idempotencyKeyRef.current = null;
      broadcastSync('maintenance');
      setModalOpen(false);
      setForm({ title: '', category: 'Electrical', description: '' });
      setPhotoFile(null);
      loadRequests();
      toast.success('Maintenance issue submitted to owner.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Maintenance & Repairs</h2>
          <p className="text-xs text-slate-500">Report repair issues in your room to the house owner</p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition self-start sm:self-auto"
        >
          + Report an Issue
        </button>
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="flex justify-center py-16 text-slate-400 text-xs">
          Loading requests...
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-slate-500 shadow-sm">
          <p className="font-semibold text-slate-900">No maintenance requests</p>
          <p className="text-xs text-slate-400 mt-1">
            If you experience plumbing, electrical, or structural issues, click Report an Issue above.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const isOpen = r.status === 'NEW';
            const isInProgress = r.status === 'IN_PROGRESS';
            const isCompleted = r.status === 'COMPLETED';

            return (
              <div
                key={r.id}
                className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900">{r.title}</span>
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-medium">
                        {r.category || 'General'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Submitted on {r.createdDateBS}
                    </div>
                  </div>

                  <div>
                    {isOpen && (
                      <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        Pending
                      </span>
                    )}
                    {isInProgress && (
                      <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        In Progress
                      </span>
                    )}
                    {isCompleted && (
                      <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Completed
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-slate-700 whitespace-pre-line leading-relaxed">{r.description}</p>

                {r.photoPath && (
                  <div className="pt-1">
                    <button
                      onClick={() => setSelectedPhoto(getFileUrl(r.photoPath))}
                      className="px-2 py-1 text-[11px] rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium"
                    >
                      View Attached Photo
                    </button>
                  </div>
                )}

                {r.adminNotes && (
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-[11px] text-slate-700">
                    <span className="font-semibold text-slate-900">Owner Update: </span>
                    <span>{r.adminNotes}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Request Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-5 shadow-lg space-y-3 text-xs">
            <h3 className="font-semibold text-sm text-slate-900 pb-2 border-b border-slate-100">
              Report Maintenance Issue
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Issue Category *</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 bg-white focus:outline-none focus:border-slate-900"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Issue Title *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Bathroom tap leaking"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Description *</label>
                <textarea
                  required
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Please describe what needs to be fixed..."
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Optional Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                  className="w-full text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white border border-slate-200 rounded-lg p-4 max-w-md w-full shadow-lg text-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-semibold text-slate-900">Issue Photo</span>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                &times;
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-slate-50 rounded p-2">
              <img
                src={selectedPhoto}
                alt="Issue Attachment"
                className="max-w-full h-auto object-contain rounded"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setSelectedPhoto(null)}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
