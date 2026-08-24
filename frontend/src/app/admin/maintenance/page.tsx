'use client';

import React, { useEffect, useState } from 'react';
import { api, getFileUrl } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

export default function AdminMaintenancePage() {
  const toast = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState('');

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await api.get('/maintenance');
      setRequests(data);
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
    try {
      await api.put(`/maintenance/${id}/status`, { status: newStatus });
      loadRequests();
      toast.success(`Request status updated to ${newStatus.replace('_', ' ')}.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  const handleSaveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    try {
      await api.put(`/maintenance/${selectedReq.id}/status`, {
        status: selectedReq.status,
        adminNotes,
      });
      setNotesModalOpen(false);
      setSelectedReq(null);
      loadRequests();
      toast.success('Admin notes updated.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save notes');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Maintenance & Repairs</h2>
          <p className="text-xs text-slate-500">Track and resolve repair requests submitted by tenants</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Date (BS)</th>
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Tenant</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Issue & Description</th>
                <th className="px-4 py-2.5">Photo</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Admin Notes</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Loading maintenance requests...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No maintenance requests
                  </td>
                </tr>
              ) : (
                requests.map((r) => {
                  const isOpen = r.status === 'NEW';
                  const isInProgress = r.status === 'IN_PROGRESS';
                  const isCompleted = r.status === 'COMPLETED';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono">{r.createdDateBS}</td>
                      <td className="px-4 py-3 font-medium">Room {r.room?.roomNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{r.tenant?.fullName}</div>
                        <div className="text-[11px] text-slate-500">{r.tenant?.phone}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {r.category || 'General'}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-semibold text-slate-900">{r.title || r.description}</div>
                        {r.title && <div className="text-[11px] text-slate-600 mt-0.5 whitespace-pre-line">{r.description}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {r.photoPath ? (
                          <button
                            onClick={() => setSelectedPhoto(getFileUrl(r.photoPath))}
                            className="px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-100 text-[11px] text-slate-700 font-medium"
                          >
                            View Photo
                          </button>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
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
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.adminNotes ? (
                          <span className="italic">{r.adminNotes}</span>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <select
                            value={r.status}
                            onChange={(e) => handleUpdateStatus(r.id, e.target.value)}
                            className="px-1.5 py-1 rounded border border-slate-300 text-[11px] bg-white text-slate-800 focus:outline-none"
                          >
                            <option value="NEW">Pending</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="COMPLETED">Completed</option>
                          </select>
                          <button
                            onClick={() => {
                              setSelectedReq(r);
                              setAdminNotes(r.adminNotes || '');
                              setNotesModalOpen(true);
                            }}
                            className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 text-[11px] text-slate-700"
                          >
                            Notes
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Photo Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white border border-slate-200 rounded-lg p-4 max-w-lg w-full shadow-lg text-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-semibold text-slate-900">Maintenance Photo Attachment</span>
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

      {/* Notes Modal */}
      {notesModalOpen && selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-sm w-full shadow-lg text-xs space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
              Admin Notes &mdash; {selectedReq.title || 'Request'}
            </h3>
            <form onSubmit={handleSaveNotes} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Resolution / Update Notes</label>
                <textarea
                  rows={3}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="e.g. Plumber scheduled for Saturday 10 AM..."
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setNotesModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium"
                >
                  Save Notes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
