'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR } from '@/lib/nepali-date';
import { useToast } from '@/lib/toast-context';
import { useAutoSync, broadcastSync } from '@/lib/sync';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { SkeletonCard } from '@/components/ui/LoadingSkeleton';
import Link from 'next/link';
import {
  Home,
  DoorOpen,
  Users,
  Phone,
  Zap,
  Edit3,
  UserPlus,
  Coins,
  CheckCircle2,
  Building,
  Plus,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

export default function AdminRoomsPage() {
  const toast = useToast();
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRoom, setEditingRoom] = useState<any>(null);
  const [newRent, setNewRent] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // Add Room Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addRoomNumber, setAddRoomNumber] = useState<number | ''>('');
  const [addRoomName, setAddRoomName] = useState('');
  const [addRoomRent, setAddRoomRent] = useState<number>(8000);
  const [adding, setAdding] = useState(false);

  // Delete Room Modal State
  const [roomToDelete, setRoomToDelete] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const data = await api.get('/rooms');
      setRooms(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  useAutoSync(loadRooms, ['room', 'tenant', 'bill', 'all']);

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
      broadcastSync('room');
      setEditingRoom(null);
      loadRooms();
      toast.success(`Default rent for Room ${editingRoom.roomNumber} updated successfully.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update rent');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addRoomNumber || Number(addRoomNumber) <= 0 || addRoomRent <= 0) {
      toast.error('Please enter a valid room number and default rent');
      return;
    }
    setAdding(true);
    try {
      await api.post('/rooms', {
        roomNumber: Number(addRoomNumber),
        name: addRoomName.trim() ? addRoomName.trim() : `Room ${addRoomNumber}`,
        defaultRent: Number(addRoomRent),
      });
      broadcastSync('room');
      toast.success(`Room ${addRoomNumber} created successfully!`);
      setIsAddModalOpen(false);
      setAddRoomNumber('');
      setAddRoomName('');
      setAddRoomRent(8000);
      loadRooms();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create room');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!roomToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/rooms/${roomToDelete.id}`);
      broadcastSync('room');
      toast.success(`Room ${roomToDelete.roomNumber} deleted successfully.`);
      setRoomToDelete(null);
      loadRooms();
    } catch (err: any) {
      toast.error(err.message || 'Cannot delete room');
    } finally {
      setDeleting(false);
    }
  };

  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((r) => r.status === 'OCCUPIED').length;
  const vacantRooms = totalRooms - occupiedRooms;
  const totalCapacityRevenue = rooms.reduce((sum, r) => {
    const rent = r.tenantProfiles?.[0]?.monthlyRent || r.defaultRent || 0;
    return sum + rent;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="Property Structure"
        title="Room Management"
        subtitle="Manage property rooms, monitor occupancy, and configure rental rates"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => setIsAddModalOpen(true)}>
              <Building className="w-4 h-4" />
              <span>Add Room</span>
            </Button>
            <Link href="/admin/tenants">
              <Button variant="outline" size="sm">
                <UserPlus className="w-4 h-4" />
                <span>Assign Tenant</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-xs">
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-card">
          <div className="flex items-center justify-between text-slate-500 font-semibold">
            <span>Total Units</span>
            <Building className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">{totalRooms}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{totalRooms} units configured</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-card">
          <div className="flex items-center justify-between text-slate-500 font-semibold">
            <span>Occupied</span>
            <DoorOpen className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-extrabold text-emerald-700 mt-1 font-mono">
            {occupiedRooms}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {Math.round((occupiedRooms / (totalRooms || 1)) * 100)}% occupancy rate
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-card">
          <div className="flex items-center justify-between text-slate-500 font-semibold">
            <span>Vacant</span>
            <Home className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-extrabold text-slate-700 mt-1 font-mono">{vacantRooms}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Ready for new tenant</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-card">
          <div className="flex items-center justify-between text-slate-500 font-semibold">
            <span>Monthly Capacity</span>
            <Coins className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
            {formatCurrencyNPR(totalCapacityRevenue)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Potential full rent revenue</div>
        </div>
      </div>

      {/* Room Attractive Cards Grid */}
      {loading ? (
        <SkeletonCard count={totalRooms > 0 ? totalRooms : 4} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {rooms.map((room) => {
            const isOccupied = room.status === 'OCCUPIED';
            const tenant = room.tenant || room.tenantProfiles?.[0]?.user;
            const profile = room.tenantProfiles?.[0];
            const activeRent = profile ? profile.monthlyRent : room.defaultRent;

            return (
              <div
                key={room.id}
                className={`relative rounded-2xl border p-5 shadow-card transition-all duration-200 hover:shadow-card-hover hover:-translate-y-1 flex flex-col justify-between ${
                  isOccupied
                    ? 'bg-gradient-to-br from-emerald-50/20 via-white to-white border-emerald-200/90'
                    : 'bg-gradient-to-br from-slate-50/50 via-white to-white border-dashed border-slate-300'
                }`}
              >
                <div>
                  {/* Card Header: Room Number & Status */}
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-slate-900 tracking-tight">
                          ROOM {room.roomNumber < 10 ? `0${room.roomNumber}` : room.roomNumber}
                        </span>
                        {isOccupied && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                      </div>
                      <span className="text-xs text-slate-500 font-medium">{room.name}</span>
                    </div>
                    <StatusBadge status={room.status} />
                  </div>

                  {/* Card Body: Tenant details if occupied, else available state */}
                  <div className="py-4 space-y-3">
                    {isOccupied && tenant ? (
                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 space-y-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-200">
                            {tenant.fullName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-slate-900 truncate">
                              {tenant.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono truncate">
                              @{tenant.username}
                            </div>
                          </div>
                        </div>

                        {tenant.phone && (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium pt-1 border-t border-slate-200/60">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <a
                              href={`tel:${tenant.phone}`}
                              className="hover:text-indigo-600 hover:underline"
                            >
                              {tenant.phone}
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-5 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-slate-400 space-y-1">
                        <Home className="w-8 h-8 mx-auto opacity-50 text-slate-400" />
                        <div className="text-xs font-semibold text-slate-600">
                          Vacant & Available
                        </div>
                        <div className="text-[11px] text-slate-400">Ready for occupancy</div>
                      </div>
                    )}

                    {/* Financial & Meter Info Row */}
                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Monthly Rent
                        </span>
                        <span className="text-sm font-extrabold text-slate-900 font-mono mt-0.5 block">
                          {formatCurrencyNPR(activeRent)}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Electricity Meter
                        </span>
                        <span className="text-xs font-semibold text-slate-800 mt-1 flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          {room.currentReading !== null && room.currentReading !== undefined ? (
                            <span className="font-mono">{room.currentReading} units</span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Unrecorded</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Quick Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(room)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
                      title="Edit Room Rent"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Rent</span>
                    </button>
                    {!isOccupied && (
                      <button
                        onClick={() => setRoomToDelete(room)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Delete Room"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>

                  {isOccupied ? (
                    <Link href="/admin/billing">
                      <Button variant="outline" size="xs">
                        View Bill &rarr;
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/admin/tenants">
                      <Button variant="primary" size="xs">
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Assign Tenant</span>
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Default Rent Modal */}
      {editingRoom && (
        <Modal
          isOpen={true}
          onClose={() => setEditingRoom(null)}
          title={`Edit Rent — Room ${editingRoom.roomNumber}`}
          description={`Update the base monthly rent configuration for ${editingRoom.name}`}
          icon={<Coins className="w-5 h-5 text-indigo-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handleSaveRent} className="space-y-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1.5">
                Default Monthly Rent (NPR) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">Rs.</span>
                <input
                  type="number"
                  value={newRent}
                  onChange={(e) => setNewRent(Number(e.target.value))}
                  required
                  min={1000}
                  step={100}
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 font-mono font-bold text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Applies as the standard baseline rate for new tenant agreements.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingRoom(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving} className="font-bold">
                {saving ? 'Saving...' : 'Update Rent'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Room Modal */}
      {isAddModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsAddModalOpen(false)}
          title="Add New Room"
          description="Expand your property capacity by creating an additional room"
          icon={<Plus className="w-5 h-5 text-indigo-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handleCreateRoom} className="space-y-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1.5 text-xs">
                Room Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                value={addRoomNumber}
                onChange={(e) => setAddRoomNumber(e.target.value === '' ? '' : Number(e.target.value))}
                required
                min={1}
                step={1}
                placeholder="e.g. 7"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono font-bold text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1.5 text-xs">
                Room Display Name <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={addRoomName}
                onChange={(e) => setAddRoomName(e.target.value)}
                placeholder="e.g. Room 7"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1.5 text-xs">
                Default Monthly Rent (NPR) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">Rs.</span>
                <input
                  type="number"
                  value={addRoomRent}
                  onChange={(e) => setAddRoomRent(Number(e.target.value))}
                  required
                  min={500}
                  step={100}
                  className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono font-bold text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddModalOpen(false)}
                disabled={adding}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={adding} className="font-bold">
                {adding ? 'Creating...' : 'Create Room'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Room Confirmation Modal */}
      {roomToDelete && (
        <Modal
          isOpen={true}
          onClose={() => setRoomToDelete(null)}
          title={`Delete Room ${roomToDelete.roomNumber}?`}
          description="Safety verification: checking room usage and historical records"
          icon={<AlertTriangle className="w-5 h-5 text-rose-600" />}
          maxWidth="sm"
        >
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
              <div className="font-bold flex items-center gap-1.5 text-amber-950 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Data Integrity Protection
              </div>
              Rooms with historical billing, electricity/water meter readings, or purchases cannot be deleted to preserve financial audit trails.
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to permanently delete <strong>{roomToDelete.name || `Room ${roomToDelete.roomNumber}`}</strong>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRoomToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleDeleteRoom}
                disabled={deleting}
                className="font-bold bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
