'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR } from '@/lib/nepali-date';
import { useToast } from '@/lib/toast-context';

export default function AdminRoomsPage() {
  const toast = useToast();
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRoom, setEditingRoom] = useState<any>(null);
  const [newRent, setNewRent] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const data = await api.get('/rooms');
      setRooms(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const handleOpenEdit = (room: any) => {
    setEditingRoom(room);
    setNewRent(room.defaultRent);
  };

  const handleSaveRent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom || newRent <= 0) return;
    setSaving(true);
    try {
      await api.put(`/rooms/${editingRoom.id}/rent`, { defaultRent: Number(newRent) });
      setEditingRoom(null);
      loadRooms();
      toast.success(`Default rent for Room ${editingRoom.roomNumber} updated successfully.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update rent');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Rooms</h2>
          <p className="text-xs text-slate-500">6 Rooms (Ground, First, and Second Floors)</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Floor / Details</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Current Tenant</th>
                <th className="px-4 py-2.5">Default Rent</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading rooms...
                  </td>
                </tr>
              ) : rooms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No rooms found
                  </td>
                </tr>
              ) : (
                rooms.map((room) => {
                  const isOccupied = room.status === 'OCCUPIED';
                  return (
                    <tr key={room.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        Room {room.roomNumber}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {room.name}
                      </td>
                      <td className="px-4 py-3">
                        {isOccupied ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Occupied
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            Vacant
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {room.tenant ? (
                          <div>
                            <div className="font-medium text-slate-900">{room.tenant.fullName}</div>
                            <div className="text-[11px] text-slate-500">{room.tenant.phone}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        {formatCurrencyNPR(room.defaultRent)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleOpenEdit(room)}
                          className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                        >
                          Edit Rent
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Rent Modal */}
      {editingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-sm w-full shadow-lg text-xs space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
              Edit Rent &mdash; Room {editingRoom.roomNumber}
            </h3>

            <form onSubmit={handleSaveRent} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Default Monthly Rent (NPR)
                </label>
                <input
                  type="number"
                  value={newRent}
                  onChange={(e) => setNewRent(Number(e.target.value))}
                  required
                  min={1000}
                  step={100}
                  className="w-full px-3 py-2 rounded border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRoom(null)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
