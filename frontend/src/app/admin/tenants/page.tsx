'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS } from '@/lib/nepali-date';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { useAutoSync, broadcastSync } from '@/lib/sync';
import { NepaliDatePicker } from '@/components/NepaliDatePicker';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useToast } from '@/lib/toast-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { SkeletonTable } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Users,
  UserPlus,
  Search,
  Phone,
  DoorOpen,
  Calendar,
  Banknote,
  KeyRound,
  FileText,
  ArrowRightLeft,
  LogOut,
  Trash2,
  Edit,
  PiggyBank,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  UserCheck,
  UserX,
} from 'lucide-react';

export default function AdminTenantsPage() {
  const toast = useToast();
  const [tenants, setTenants] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<'active' | 'moved_out' | 'archived' | 'all'>('active');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [resetPassModalOpen, setResetPassModalOpen] = useState(false);
  const [moveRoomModalOpen, setMoveRoomModalOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [moveOutModalOpen, setMoveOutModalOpen] = useState(false);
  const [tenantForMoveOut, setTenantForMoveOut] = useState<any>(null);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tenantForDelete, setTenantForDelete] = useState<any>(null);

  // Cash payment modal state
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const cashIdempotencyKeyRef = useRef<string | null>(null);
  const [cashForm, setCashForm] = useState({
    tenantId: '',
    tenantName: '',
    roomNumber: '',
    billId: '',
    amount: '',
    maxDue: 0,
    paymentDateBS: '',
    notes: '',
  });

  // Advance summary modal state
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [advanceTenantSummary, setAdvanceTenantSummary] = useState<any>(null);
  const [advanceLoading, setAdvanceLoading] = useState(false);

  // Form states
  const [createForm, setCreateForm] = useState({
    fullName: '',
    username: '',
    password: '',
    phone: '',
    roomId: '',
    numberOfPeople: 1,
    monthlyRent: '',
    moveInDateBS: '',
    internetEnabled: true,
    citizenshipNumber: '',
    notes: '',
  });

  const [editForm, setEditForm] = useState({
    id: '',
    username: '',
    fullName: '',
    phone: '',
    monthlyRent: '',
    numberOfPeople: 1,
    moveInDateBS: '',
    internetEnabled: true,
    citizenshipNumber: '',
    notes: '',
  });

  const [newPassword, setNewPassword] = useState('');
  const [targetRoomId, setTargetRoomId] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docCitizenshipNo, setDocCitizenshipNo] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tData, rData] = await Promise.all([
        api.get('/tenants'),
        api.get('/rooms'),
      ]);
      setTenants(Array.isArray(tData) ? tData : []);
      setRooms(Array.isArray(rData) ? rData : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load tenant data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const today = getTodayBS();
    setCreateForm((prev) => ({ ...prev, moveInDateBS: today.nepaliFormatted }));
  }, []);

  useAutoSync(loadData, ['tenant', 'room', 'bill', 'payment', 'all']);

  const handleOpenAdvance = async (t: any) => {
    setSelectedTenant(t);
    setAdvanceModalOpen(true);
    try {
      setAdvanceLoading(true);
      const data = await api.get(`/billing/advance-summary?tenantId=${t.id}`);
      setAdvanceTenantSummary(Array.isArray(data) ? data[0] : data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load advance summary');
    } finally {
      setAdvanceLoading(false);
    }
  };

  const filteredTenants = tenants.filter((t) => {
    const profile = t.profile || t.tenantProfile;
    const status = profile?.status || (t.status === 'ACTIVE' ? 'ACTIVE' : 'MOVED_OUT');

    if (statusTab === 'active' && status !== 'ACTIVE') return false;
    if (statusTab === 'moved_out' && status !== 'MOVED_OUT') return false;
    if (statusTab === 'archived' && status !== 'ARCHIVED') return false;

    const q = search.toLowerCase();
    const roomNum = String(profile?.roomNumber ?? profile?.room?.roomNumber ?? '');
    return (
      t.fullName?.toLowerCase().includes(q) ||
      t.username?.toLowerCase().includes(q) ||
      t.phone?.includes(q) ||
      roomNum.includes(q) ||
      `room ${roomNum}`.toLowerCase().includes(q)
    );
  });

  const activeCount = tenants.filter(
    (t) => (t.profile?.status || t.tenantProfile?.status) === 'ACTIVE'
  ).length;
  const movedOutCount = tenants.filter(
    (t) => (t.profile?.status || t.tenantProfile?.status) === 'MOVED_OUT'
  ).length;
  const archivedCount = tenants.filter(
    (t) => (t.profile?.status || t.tenantProfile?.status) === 'ARCHIVED'
  ).length;

  const handleOpenDelete = (tenant: any) => {
    setTenantForDelete(tenant);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!tenantForDelete) return;
    try {
      setActionLoading(true);
      const res = await api.delete(`/tenants/${tenantForDelete.id}`);
      broadcastSync('tenant');
      setDeleteModalOpen(false);
      setTenantForDelete(null);
      loadData();
      toast.success(res?.message || 'Tenant record processed.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete or archive tenant');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenCashPayment = (t: any) => {
    const today = getTodayBS();
    const profile = t.profile || t.tenantProfile;
    const roomNum = String(profile?.roomNumber ?? profile?.room?.roomNumber ?? '');
    const due = Number(t.latestBill?.balanceDue ?? 0);

    setCashForm({
      tenantId: t.id,
      tenantName: t.fullName,
      roomNumber: roomNum,
      billId: t.latestBill?.id || '',
      amount: due > 0 ? String(due) : '',
      maxDue: due,
      paymentDateBS: today.nepaliFormatted,
      notes: 'Direct Cash Payment received by Admin',
    });
    setCashModalOpen(true);
  };

  const handleRecordCashPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashForm.tenantId) {
      toast.warning('Please select a tenant.');
      return;
    }
    const amt = parseFloat(cashForm.amount);
    if (isNaN(amt) || amt <= 0) {
      toast.warning('Please enter a valid cash amount.');
      return;
    }

    if (!cashIdempotencyKeyRef.current) {
      cashIdempotencyKeyRef.current = generateIdempotencyKey();
    }
    const idempotencyKey = cashIdempotencyKeyRef.current;

    try {
      setCashSubmitting(true);
      const res = await api.post('/payments/cash-payment', {
        tenantId: cashForm.tenantId,
        billId: cashForm.billId || undefined,
        amount: amt,
        paymentDateBS: cashForm.paymentDateBS,
        notes: cashForm.notes || undefined,
        idempotencyKey,
      });
      cashIdempotencyKeyRef.current = null;
      broadcastSync('payment');
      setCashModalOpen(false);
      loadData();
      toast.success(res?.message || 'Cash payment recorded and dues cleared.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to record cash payment');
    } finally {
      setCashSubmitting(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.roomId) {
      toast.warning('Please select a room');
      return;
    }

    try {
      setActionLoading(true);
      await api.post('/tenants', {
        ...createForm,
        numberOfPeople: Number(createForm.numberOfPeople) || 1,
        monthlyRent: Number(createForm.monthlyRent) || 0,
        internetEnabled: createForm.internetEnabled,
      });
      broadcastSync('tenant');
      broadcastSync('room');
      broadcastSync('bill');
      setCreateModalOpen(false);
      setCreateForm({
        fullName: '',
        username: '',
        password: '',
        phone: '',
        roomId: '',
        numberOfPeople: 1,
        monthlyRent: '',
        moveInDateBS: getTodayBS().nepaliFormatted,
        internetEnabled: true,
        citizenshipNumber: '',
        notes: '',
      });
      loadData();
      toast.success('Tenant created successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create tenant');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenEdit = (t: any) => {
    setSelectedTenant(t);
    const profile = t.profile || t.tenantProfile;
    setEditForm({
      id: t.id,
      username: t.username || '',
      fullName: t.fullName || '',
      phone: t.phone || '',
      monthlyRent: String(profile?.monthlyRent ?? ''),
      numberOfPeople: profile?.numberOfPeople || 1,
      moveInDateBS: profile?.moveInDateBS || '',
      internetEnabled: profile?.internetEnabled !== false,
      citizenshipNumber: profile?.citizenshipNumber || '',
      notes: profile?.notes || '',
    });
    setEditModalOpen(true);
  };

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.id) return;

    try {
      setActionLoading(true);
      await api.put(`/tenants/${editForm.id}`, {
        username: editForm.username.trim() || undefined,
        fullName: editForm.fullName,
        phone: editForm.phone || undefined,
        monthlyRent: Number(editForm.monthlyRent) || undefined,
        numberOfPeople: Number(editForm.numberOfPeople) || 1,
        moveInDateBS: editForm.moveInDateBS || undefined,
        internetEnabled: editForm.internetEnabled,
        citizenshipNumber: editForm.citizenshipNumber || undefined,
        notes: editForm.notes || undefined,
      });
      broadcastSync('tenant');
      broadcastSync('bill');
      setEditModalOpen(false);
      loadData();
      toast.success('Tenant details updated successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update tenant');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant || !newPassword.trim()) return;

    try {
      setActionLoading(true);
      await api.put(`/tenants/${selectedTenant.id}/reset-password`, {
        newPassword: newPassword.trim(),
      });
      setResetPassModalOpen(false);
      setNewPassword('');
      toast.success(`Password updated for ${selectedTenant.fullName}.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMoveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant || !targetRoomId) return;

    try {
      setActionLoading(true);
      await api.put(`/tenants/${selectedTenant.id}/move-room`, {
        newRoomId: targetRoomId,
      });
      broadcastSync('tenant');
      broadcastSync('room');
      broadcastSync('bill');
      setMoveRoomModalOpen(false);
      setTargetRoomId('');
      loadData();
      toast.success(`Tenant moved successfully.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to move room');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;

    const formData = new FormData();
    if (docFile) {
      formData.append('file', docFile);
      formData.append('citizenshipDoc', docFile);
    }
    if (docCitizenshipNo !== undefined) {
      formData.append('citizenshipNumber', docCitizenshipNo);
    }

    try {
      setActionLoading(true);
      await api.post(`/documents/citizenship/${selectedTenant.id}`, formData);
      broadcastSync('tenant');
      setDocModalOpen(false);
      setDocFile(null);
      loadData();
      toast.success('Citizenship information saved successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save citizenship details');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenMoveOut = (tenant: any) => {
    setTenantForMoveOut(tenant);
    setMoveOutModalOpen(true);
  };

  const handleConfirmMoveOut = async () => {
    if (!tenantForMoveOut) return;
    try {
      setActionLoading(true);
      await api.put(`/tenants/${tenantForMoveOut.id}/move-out`);
      broadcastSync('tenant');
      broadcastSync('room');
      broadcastSync('bill');
      setMoveOutModalOpen(false);
      setTenantForMoveOut(null);
      loadData();
      toast.success(`${tenantForMoveOut.fullName} marked as moved out.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to process move-out');
    } finally {
      setActionLoading(false);
    }
  };

  const vacantRooms = rooms.filter((r) => r.status === 'VACANT');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="Directory"
        title="Tenant Management"
        subtitle="Manage active residents, room assignments, login credentials, and records"
        actions={
          <Button
            onClick={() => setCreateModalOpen(true)}
            variant="primary"
            size="sm"
            className="font-bold"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New Tenant</span>
          </Button>
        }
      />

      {/* Filter Tabs & Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        {/* Status Tab Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setStatusTab('active')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              statusTab === 'active'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Active</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                statusTab === 'active'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {activeCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusTab('moved_out')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              statusTab === 'moved_out'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            <span>Moved Out</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                statusTab === 'moved_out'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {movedOutCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusTab('archived')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              statusTab === 'archived'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Archived</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                statusTab === 'archived'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {archivedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusTab('all')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
              statusTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>All ({tenants.length})</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-64 shrink-0">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, room, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white"
          />
        </div>
      </div>

      {/* Tenants Table */}
      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : filteredTenants.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6 text-indigo-500" />}
          title={
            statusTab === 'active'
              ? 'No active tenants'
              : statusTab === 'moved_out'
              ? 'No moved-out tenants'
              : statusTab === 'archived'
              ? 'No archived records'
              : 'No tenants match your search'
          }
          description="Add a new tenant or change your search filter."
          action={
            statusTab === 'active' ? (
              <Button onClick={() => setCreateModalOpen(true)} variant="primary" size="sm">
                <UserPlus className="w-4 h-4" />
                <span>Add Tenant</span>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold">
                  <th className="px-4 py-3">Tenant / Username</th>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Rent</th>
                  <th className="px-4 py-3">Occupancy</th>
                  <th className="px-4 py-3">Move Date</th>
                  <th className="px-4 py-3">Dues & Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {filteredTenants.map((t) => {
                  const profile = t.profile || t.tenantProfile;
                  const roomNumber = profile?.roomNumber ?? profile?.room?.roomNumber;
                  const status =
                    profile?.status || (t.status === 'ACTIVE' ? 'ACTIVE' : 'MOVED_OUT');
                  const isActive = status === 'ACTIVE';
                  const isArchived = status === 'ARCHIVED';
                  const balanceDue = Number(t.latestBill?.balanceDue ?? 0);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Tenant Name / Username & ID */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-200">
                            {t.fullName ? t.fullName.slice(0, 2).toUpperCase() : 'TN'}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 leading-tight">
                              {t.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              @{t.username}
                            </div>
                            {profile?.citizenshipNumber && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                ID: {profile.citizenshipNumber}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Room tag */}
                      <td className="px-4 py-3.5">
                        {roomNumber !== undefined && roomNumber !== null && roomNumber !== '' ? (
                          <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            Room {roomNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Contact phone */}
                      <td className="px-4 py-3.5 font-mono text-slate-600">
                        {t.phone ? (
                          <a
                            href={`tel:${t.phone}`}
                            className="hover:text-indigo-600 hover:underline flex items-center gap-1"
                          >
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{t.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </td>

                      {/* Rent */}
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                        {profile ? (
                          formatCurrencyNPR(profile.monthlyRent)
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </td>

                      {/* Occupancy & Internet */}
                      <td className="px-4 py-3.5 text-slate-600">
                        <div>
                          {profile?.numberOfPeople || 1}{' '}
                          {profile?.numberOfPeople > 1 ? 'people' : 'person'}
                        </div>
                        {profile?.internetEnabled === false ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 mt-1">
                            <WifiOff className="w-3 h-3" />
                            <span>No Net</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
                            <Wifi className="w-3 h-3 text-emerald-600" />
                            <span>Internet</span>
                          </span>
                        )}
                      </td>

                      {/* Move Dates */}
                      <td className="px-4 py-3.5 text-slate-600 font-mono text-[11px]">
                        <div>In: {profile?.moveInDateBS || '&mdash;'}</div>
                        {profile?.moveOutDateBS && (
                          <div className="text-amber-700 font-medium">
                            Out: {profile.moveOutDateBS}
                          </div>
                        )}
                      </td>

                      {/* Status & Dues */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <StatusBadge status={status} />
                          {balanceDue > 0 ? (
                            <div className="text-rose-700 font-mono font-bold text-[11px]">
                              Due: {formatCurrencyNPR(balanceDue)}
                            </div>
                          ) : (
                            <div className="text-emerald-700 font-medium text-[10px] flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              <span>Zero Dues</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                          {/* Pay Cash button */}
                          <Button
                            variant="success"
                            size="xs"
                            onClick={() => handleOpenCashPayment(t)}
                            title="Record Cash Payment"
                          >
                            Pay Cash
                          </Button>

                          {/* Advance Summary */}
                          <button
                            type="button"
                            onClick={() => handleOpenAdvance(t)}
                            className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition"
                            title="View Advance Summary"
                          >
                            Advance
                          </button>

                          {/* Move Room (Active only) */}
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTenant(t);
                                setTargetRoomId('');
                                setMoveRoomModalOpen(true);
                              }}
                              className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
                              title="Move to another room"
                            >
                              Move
                            </button>
                          )}

                          {/* Upload Docs */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTenant(t);
                              setDocFile(null);
                              setDocCitizenshipNo(profile?.citizenshipNumber || '');
                              setDocModalOpen(true);
                            }}
                            className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                            title="Upload Citizenship Document"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit Details */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(t)}
                            className="p-1 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                            title="Edit Tenant Profile & Username"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Move Out (Active only) */}
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => handleOpenMoveOut(t)}
                              className="p-1 rounded-lg text-amber-600 hover:text-amber-800 hover:bg-amber-50 transition"
                              title="Process Move Out"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Reset Password */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTenant(t);
                              setNewPassword('');
                              setResetPassModalOpen(true);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                            title="Reset Password"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete or Archive */}
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(t)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Delete or Archive Tenant"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 1. Add New Tenant Modal */}
      {createModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setCreateModalOpen(false)}
          title="Add New Tenant Agreement"
          description="Register a new resident, assign a room, and configure monthly billing terms"
          icon={<UserPlus className="w-5 h-5 text-indigo-600" />}
          maxWidth="lg"
        >
          <form onSubmit={handleCreateTenant} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Thapa"
                  value={createForm.fullName}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, fullName: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Username <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ramesh"
                  value={createForm.username}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      username: e.target.value.toLowerCase().replace(/\s+/g, ''),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Initial Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Secure password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, password: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  placeholder="e.g. 9841234567"
                  value={createForm.phone}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, phone: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Assign Room <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={createForm.roomId}
                  onChange={(e) => {
                    const rId = e.target.value;
                    const r = rooms.find((rm) => rm.id === rId);
                    setCreateForm({
                      ...createForm,
                      roomId: rId,
                      monthlyRent: r ? String(r.defaultRent) : createForm.monthlyRent,
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white"
                >
                  <option value="">-- Select Vacant Room --</option>
                  {vacantRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.roomNumber} ({r.name}) &mdash; Default: Rs. {r.defaultRent}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Agreed Monthly Rent (NPR) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1000}
                  step={100}
                  placeholder="e.g. 7000"
                  value={createForm.monthlyRent}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, monthlyRent: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Move-In Date (Bikram Sambat BS)
                </label>
                <NepaliDatePicker
                  value={createForm.moveInDateBS}
                  onChange={(formattedBS) =>
                    setCreateForm({ ...createForm, moveInDateBS: formattedBS })
                  }
                  placeholder="Select Move-In Date"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Number of People</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={createForm.numberOfPeople}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      numberOfPeople: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={createForm.internetEnabled}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, internetEnabled: e.target.checked })
                  }
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>Include Internet Service (Billed monthly)</span>
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Citizenship Number / ID
              </label>
              <input
                type="text"
                placeholder="e.g. 27-01-78-12345"
                value={createForm.citizenshipNumber}
                onChange={(e) =>
                  setCreateForm({ ...createForm, citizenshipNumber: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={actionLoading}
                className="font-bold"
              >
                {actionLoading ? 'Creating...' : 'Create Tenant Agreement'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 2. Edit Tenant Modal (Allows changing username!) */}
      {editModalOpen && selectedTenant && (
        <Modal
          isOpen={true}
          onClose={() => setEditModalOpen(false)}
          title={`Edit Tenant — ${selectedTenant.fullName}`}
          description="Update personal details, username, agreed rent, and agreement terms"
          icon={<Edit className="w-5 h-5 text-indigo-600" />}
          maxWidth="lg"
        >
          <form onSubmit={handleUpdateTenant} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, fullName: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Username <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.username}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      username: e.target.value.toLowerCase().replace(/\s+/g, ''),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm({ ...editForm, phone: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Monthly Rent (NPR)
                </label>
                <input
                  type="number"
                  min={1000}
                  step={100}
                  value={editForm.monthlyRent}
                  onChange={(e) =>
                    setEditForm({ ...editForm, monthlyRent: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Number of People</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={editForm.numberOfPeople}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      numberOfPeople: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Move-In Date (BS)
                </label>
                <NepaliDatePicker
                  value={editForm.moveInDateBS}
                  onChange={(formattedBS) =>
                    setEditForm({ ...editForm, moveInDateBS: formattedBS })
                  }
                  placeholder="Move-in date"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={editForm.internetEnabled}
                  onChange={(e) =>
                    setEditForm({ ...editForm, internetEnabled: e.target.checked })
                  }
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>Include Internet Service</span>
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Citizenship Number / ID
              </label>
              <input
                type="text"
                value={editForm.citizenshipNumber}
                onChange={(e) =>
                  setEditForm({ ...editForm, citizenshipNumber: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={actionLoading}
                className="font-bold"
              >
                {actionLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 3. Reset Password Modal */}
      {resetPassModalOpen && selectedTenant && (
        <Modal
          isOpen={true}
          onClose={() => setResetPassModalOpen(false)}
          title={`Reset Password — ${selectedTenant.fullName}`}
          description={`Set a new account login password for @${selectedTenant.username}`}
          icon={<KeyRound className="w-5 h-5 text-indigo-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                New Password <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetPassModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={actionLoading}
                className="font-bold"
              >
                {actionLoading ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 4. Move Room Modal */}
      {moveRoomModalOpen && selectedTenant && (
        <Modal
          isOpen={true}
          onClose={() => setMoveRoomModalOpen(false)}
          title={`Transfer Room — ${selectedTenant.fullName}`}
          description="Select an available vacant room to relocate this tenant"
          icon={<ArrowRightLeft className="w-5 h-5 text-indigo-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handleMoveRoom} className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Target Room <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={targetRoomId}
                onChange={(e) => setTargetRoomId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white"
              >
                <option value="">-- Select Vacant Room --</option>
                {vacantRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Room {r.roomNumber} ({r.name}) &mdash; Rs. {r.defaultRent}
                  </option>
                ))}
              </select>
              {vacantRooms.length === 0 && (
                <p className="text-[11px] text-amber-700 mt-1 font-semibold">
                  No vacant rooms currently available.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMoveRoomModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!targetRoomId}
                loading={actionLoading}
                className="font-bold"
              >
                {actionLoading ? 'Relocating...' : 'Confirm Transfer'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 5. Upload Document Modal */}
      {docModalOpen && selectedTenant && (
        <Modal
          isOpen={true}
          onClose={() => setDocModalOpen(false)}
          title={`Citizenship Document — ${selectedTenant.fullName}`}
          description="Upload citizenship photo/PDF and update national ID number"
          icon={<FileText className="w-5 h-5 text-indigo-600" />}
          maxWidth="md"
        >
          <form onSubmit={handleUploadDoc} className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Citizenship / National ID Number
              </label>
              <input
                type="text"
                placeholder="e.g. 27-01-78-12345"
                value={docCitizenshipNo}
                onChange={(e) => setDocCitizenshipNo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Upload Document File (Photo or PDF)
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDocModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={actionLoading}
                className="font-bold"
              >
                {actionLoading ? 'Saving...' : 'Save Document Details'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 6. Move Out Confirmation Modal */}
      {moveOutModalOpen && tenantForMoveOut && (
        <ConfirmModal
          isOpen={true}
          title={`Process Move-Out for ${tenantForMoveOut.fullName}?`}
          message="This marks the tenant agreement as concluded, sets move-out date to today, and marks their room as vacant for new tenancy."
          confirmText="Confirm Move-Out"
          cancelText="Cancel"
          loading={actionLoading}
          onConfirm={handleConfirmMoveOut}
          onCancel={() => setMoveOutModalOpen(false)}
        />
      )}

      {/* 7. Delete / Archive Tenant Modal */}
      {deleteModalOpen && tenantForDelete && (
        <ConfirmModal
          isOpen={true}
          isDanger={true}
          title={`Remove or Archive ${tenantForDelete.fullName}?`}
          message="If this tenant has existing billing or payment records, they will be safely archived to preserve financial history. If no history exists, the account will be deleted."
          confirmText="Delete / Archive"
          cancelText="Cancel"
          loading={actionLoading}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteModalOpen(false)}
        />
      )}

      {/* 8. Cash Payment Modal */}
      {cashModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setCashModalOpen(false)}
          title={`Record Cash Payment — ${cashForm.tenantName}`}
          description={`Receive physical cash and clear dues for Room ${cashForm.roomNumber || '—'}`}
          icon={<Banknote className="w-5 h-5 text-emerald-600" />}
          maxWidth="sm"
        >
          <form onSubmit={handleRecordCashPayment} className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Cash Amount (NPR) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">Rs.</span>
                <input
                  type="number"
                  required
                  min={1}
                  value={cashForm.amount}
                  onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })}
                  placeholder="Amount"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 font-mono font-bold text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              {cashForm.maxDue > 0 && (
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCashForm({ ...cashForm, amount: String(cashForm.maxDue) })
                    }
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
                  >
                    Clear Full Balance (Rs. {cashForm.maxDue})
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Payment Date (BS)</label>
              <NepaliDatePicker
                value={cashForm.paymentDateBS}
                onChange={(formattedBS) =>
                  setCashForm({ ...cashForm, paymentDateBS: formattedBS })
                }
                placeholder="Payment date"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Notes / Remarks (Optional)
              </label>
              <input
                type="text"
                value={cashForm.notes}
                onChange={(e) => setCashForm({ ...cashForm, notes: e.target.value })}
                placeholder="e.g. Received in cash by Admin"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCashModalOpen(false)}
                disabled={cashSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="success"
                loading={cashSubmitting}
                className="font-bold"
              >
                {cashSubmitting ? 'Recording...' : 'Record Cash'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 9. Advance Summary Modal */}
      {advanceModalOpen && selectedTenant && (
        <Modal
          isOpen={true}
          onClose={() => setAdvanceModalOpen(false)}
          title={`Advance Balance — ${selectedTenant.fullName}`}
          description={`Prepaid ledger breakdown for @${selectedTenant.username}`}
          icon={<PiggyBank className="w-5 h-5 text-purple-600" />}
          maxWidth="md"
        >
          {advanceLoading ? (
            <div className="py-8 text-center text-slate-400">Loading advance summary...</div>
          ) : advanceTenantSummary ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200/80 text-center">
                <div className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">
                  Current Advance Balance
                </div>
                <div className="text-2xl font-extrabold text-purple-900 font-mono mt-1">
                  {formatCurrencyNPR(
                    advanceTenantSummary.advanceBalance ??
                      advanceTenantSummary.balance ??
                      0
                  )}
                </div>
                <div className="text-xs text-purple-700 mt-1">
                  Automatically offsets future monthly billing totals
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 font-medium block">Total Advance Added</span>
                  <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                    {formatCurrencyNPR(advanceTenantSummary.totalAdvanceAdded || 0)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 font-medium block">Total Advance Consumed</span>
                  <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                    {formatCurrencyNPR(advanceTenantSummary.totalAdvanceDeducted || 0)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAdvanceModalOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-slate-400">
              No advance records found for this tenant.
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
