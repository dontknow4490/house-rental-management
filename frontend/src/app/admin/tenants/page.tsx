'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyNPR, getTodayBS } from '@/lib/nepali-date';
import { NepaliDatePicker } from '@/components/NepaliDatePicker';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useToast } from '@/lib/toast-context';

export default function AdminTenantsPage() {
  const toast = useToast();
  const [tenants, setTenants] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [resetPassModalOpen, setResetPassModalOpen] = useState(false);
  const [moveRoomModalOpen, setMoveRoomModalOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [moveOutModalOpen, setMoveOutModalOpen] = useState(false);
  const [tenantForMoveOut, setTenantForMoveOut] = useState<any>(null);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);

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
      setTenants(tData);
      setRooms(rData);
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

  const [statusTab, setStatusTab] = useState<'active' | 'moved_out' | 'archived' | 'all'>('active');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tenantForDelete, setTenantForDelete] = useState<any>(null);

  // Cash payment modal state
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [cashSubmitting, setCashSubmitting] = useState(false);
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

  const activeCount = tenants.filter((t) => (t.profile?.status || t.tenantProfile?.status) === 'ACTIVE').length;
  const movedOutCount = tenants.filter((t) => (t.profile?.status || t.tenantProfile?.status) === 'MOVED_OUT').length;
  const archivedCount = tenants.filter((t) => (t.profile?.status || t.tenantProfile?.status) === 'ARCHIVED').length;

  const handleOpenDelete = (tenant: any) => {
    setTenantForDelete(tenant);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!tenantForDelete) return;
    try {
      setActionLoading(true);
      const res = await api.delete(`/tenants/${tenantForDelete.id}`);
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

    try {
      setCashSubmitting(true);
      const res = await api.post('/payments/cash-payment', {
        tenantId: cashForm.tenantId,
        billId: cashForm.billId || undefined,
        amount: amt,
        paymentDateBS: cashForm.paymentDateBS,
        notes: cashForm.notes || undefined,
      });
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
        fullName: editForm.fullName,
        phone: editForm.phone || undefined,
        monthlyRent: Number(editForm.monthlyRent) || undefined,
        numberOfPeople: Number(editForm.numberOfPeople) || 1,
        moveInDateBS: editForm.moveInDateBS || undefined,
        internetEnabled: editForm.internetEnabled,
        citizenshipNumber: editForm.citizenshipNumber || undefined,
        notes: editForm.notes || undefined,
      });
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Tenants</h2>
          <p className="text-xs text-slate-500">Tenant directory and room assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900 text-xs focus:outline-none focus:border-slate-900"
          />
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition"
          >
            Add Tenant
          </button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs">
        <button
          type="button"
          onClick={() => setStatusTab('active')}
          className={`pb-2 px-3 font-semibold transition border-b-2 flex items-center gap-1.5 ${
            statusTab === 'active'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Active Tenants</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-900 font-mono">
            {activeCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setStatusTab('moved_out')}
          className={`pb-2 px-3 font-semibold transition border-b-2 flex items-center gap-1.5 ${
            statusTab === 'moved_out'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Moved Out</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-900 font-mono">
            {movedOutCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setStatusTab('archived')}
          className={`pb-2 px-3 font-semibold transition border-b-2 flex items-center gap-1.5 ${
            statusTab === 'archived'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Archived Records</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono">
            {archivedCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setStatusTab('all')}
          className={`pb-2 px-3 font-semibold transition border-b-2 flex items-center gap-1.5 ${
            statusTab === 'all'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>All ({tenants.length})</span>
        </button>
      </div>

      {/* Tenants Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Name / Username</th>
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Phone</th>
                <th className="px-4 py-2.5">Monthly Rent</th>
                <th className="px-4 py-2.5">Occupants</th>
                <th className="px-4 py-2.5">Move-In / Out Date</th>
                <th className="px-4 py-2.5">Status & Dues</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Loading tenants...
                  </td>
                </tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    {statusTab === 'active'
                      ? 'No active tenants'
                      : statusTab === 'moved_out'
                      ? 'No moved-out tenants'
                      : statusTab === 'archived'
                      ? 'No archived tenants'
                      : 'No tenants found'}
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => {
                  const profile = t.profile || t.tenantProfile;
                  const roomNumber = profile?.roomNumber ?? profile?.room?.roomNumber;
                  const status = profile?.status || (t.status === 'ACTIVE' ? 'ACTIVE' : 'MOVED_OUT');
                  const isActive = status === 'ACTIVE';
                  const isArchived = status === 'ARCHIVED';
                  const balanceDue = Number(t.latestBill?.balanceDue ?? 0);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{t.fullName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">@{t.username}</div>
                        {profile?.citizenshipNumber && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            ID: {profile.citizenshipNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {roomNumber !== undefined && roomNumber !== null && roomNumber !== '' ? (
                          `Room ${roomNumber}`
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono">
                        {t.phone || <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        {profile ? formatCurrencyNPR(profile.monthlyRent) : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>{profile?.numberOfPeople || 1} {profile?.numberOfPeople > 1 ? 'people' : 'person'}</div>
                        {profile?.internetEnabled === false ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 mt-1">
                            No Internet
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
                            Internet
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>In: {profile?.moveInDateBS || '-'}</div>
                        {profile?.moveOutDateBS && (
                          <div className="text-[11px] text-rose-600 font-mono">Out: {profile.moveOutDateBS}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {isActive ? (
                            <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 self-start">
                              Active
                            </span>
                          ) : isArchived ? (
                            <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 self-start">
                              Archived Record
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 self-start">
                              Moved Out
                            </span>
                          )}

                          {balanceDue > 0 && (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200 self-start">
                              Due: {formatCurrencyNPR(balanceDue)}
                            </span>
                          )}

                          {Number(profile?.advanceBalance) > 0 && (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 self-start">
                              Adv: {formatCurrencyNPR(profile.advanceBalance)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleOpenAdvance(t)}
                            title="View Advance Balance & History"
                            className="px-2 py-1 text-[11px] rounded border border-emerald-300 hover:bg-emerald-50 text-emerald-800 font-medium"
                          >
                            Advance
                          </button>
                          {isActive ? (
                            <>
                              <button
                                onClick={() => handleOpenEdit(t)}
                                title="Edit Tenant Details"
                                className="px-2 py-1 text-[11px] rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedTenant(t);
                                  setMoveRoomModalOpen(true);
                                }}
                                title="Move Room"
                                className="px-2 py-1 text-[11px] rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium"
                              >
                                Move Room
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedTenant(t);
                                  setDocCitizenshipNo(profile?.citizenshipNumber || '');
                                  setDocModalOpen(true);
                                }}
                                title="Citizenship Details & Document"
                                className="px-2 py-1 text-[11px] rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium"
                              >
                                Citizenship
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedTenant(t);
                                  setResetPassModalOpen(true);
                                }}
                                title="Reset Password"
                                className="px-2 py-1 text-[11px] rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium"
                              >
                                Reset Pass
                              </button>
                              <button
                                onClick={() => handleOpenMoveOut(t)}
                                title="Move Out"
                                className="px-2 py-1 text-[11px] rounded border border-rose-200 hover:bg-rose-50 text-rose-700 font-medium"
                              >
                                Move Out
                              </button>
                            </>
                          ) : (
                            <>
                              {balanceDue > 0 && (
                                <button
                                  onClick={() => handleOpenCashPayment(t)}
                                  title="Record Cash Payment"
                                  className="px-2 py-1 text-[11px] rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
                                >
                                  Pay Cash
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenDelete(t)}
                                title="Safe Archive or Delete Tenant"
                                className="px-2 py-1 text-[11px] rounded border border-rose-200 text-rose-700 hover:bg-rose-50 font-medium"
                              >
                                {isArchived ? 'Delete / Purge' : 'Archive / Delete'}
                              </button>
                            </>
                          )}
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

      {/* Add Tenant Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-md w-full shadow-lg text-xs space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
              Add New Tenant
            </h3>

            <form onSubmit={handleCreateTenant} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={createForm.fullName}
                    onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                    placeholder="e.g. Ramesh KC"
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Phone *</label>
                  <input
                    type="text"
                    required
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="98XXXXXXXX"
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={createForm.username}
                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value.toLowerCase() })}
                    placeholder="e.g. ramesh_kc"
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Initial password"
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Assign Room *</label>
                  <select
                    required
                    value={createForm.roomId}
                    onChange={(e) => {
                      const sel = vacantRooms.find((r) => r.id === e.target.value);
                      setCreateForm({
                        ...createForm,
                        roomId: e.target.value,
                        monthlyRent: sel ? String(sel.defaultRent) : createForm.monthlyRent,
                      });
                    }}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 bg-white focus:outline-none focus:border-slate-900"
                  >
                    <option value="">
                      {vacantRooms.length === 0 ? 'No vacant rooms available' : 'Select vacant room'}
                    </option>
                    {vacantRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.roomNumber} ({formatCurrencyNPR(r.defaultRent)})
                      </option>
                    ))}
                  </select>
                  {vacantRooms.length === 0 && (
                    <p className="text-[10px] text-rose-500 mt-1">
                      All rooms are currently occupied. Move out an existing tenant first to free up a room.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Monthly Rent (NPR) *</label>
                  <input
                    type="number"
                    required
                    min={1000}
                    value={createForm.monthlyRent}
                    onChange={(e) => setCreateForm({ ...createForm, monthlyRent: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Number of People</label>
                  <input
                    type="number"
                    min={1}
                    value={createForm.numberOfPeople}
                    onChange={(e) => setCreateForm({ ...createForm, numberOfPeople: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Move-In Date (BS) *</label>
                  <NepaliDatePicker
                    value={createForm.moveInDateBS}
                    onChange={(formattedBS) => setCreateForm({ ...createForm, moveInDateBS: formattedBS })}
                    placeholder="Select move-in date"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <label htmlFor="create-internet-toggle" className="text-slate-800 font-medium block cursor-pointer">Internet Charge</label>
                  <span className="text-[10px] text-slate-500">Monthly internet fee (Rs. 250/person)</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="create-internet-toggle"
                    type="checkbox"
                    checked={createForm.internetEnabled}
                    onChange={(e) => setCreateForm({ ...createForm, internetEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-slate-900"></div>
                  <span className="ml-2 text-[11px] font-medium text-slate-700">
                    {createForm.internetEnabled ? 'Enabled' : 'No Internet'}
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Citizenship Number</label>
                <input
                  type="text"
                  value={createForm.citizenshipNumber}
                  onChange={(e) => setCreateForm({ ...createForm, citizenshipNumber: e.target.value })}
                  placeholder="e.g. 27-01-75-XXXXX"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="Optional notes..."
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium disabled:opacity-50"
                >
                  {actionLoading ? 'Creating...' : 'Save Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Tenant Modal */}
      {editModalOpen && selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-md w-full shadow-lg text-xs space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
              Edit Tenant &mdash; {selectedTenant.fullName}
            </h3>

            <form onSubmit={handleUpdateTenant} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="98XXXXXXXX"
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Monthly Rent (NPR)</label>
                  <input
                    type="number"
                    min={1000}
                    value={editForm.monthlyRent}
                    onChange={(e) => setEditForm({ ...editForm, monthlyRent: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Number of People</label>
                  <input
                    type="number"
                    min={1}
                    value={editForm.numberOfPeople}
                    onChange={(e) => setEditForm({ ...editForm, numberOfPeople: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Move-In Date (BS)</label>
                  <NepaliDatePicker
                    value={editForm.moveInDateBS}
                    onChange={(formattedBS) => setEditForm({ ...editForm, moveInDateBS: formattedBS })}
                    placeholder="Select move-in date"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Citizenship Number</label>
                  <input
                    type="text"
                    value={editForm.citizenshipNumber}
                    onChange={(e) => setEditForm({ ...editForm, citizenshipNumber: e.target.value })}
                    placeholder="e.g. 27-01-75-XXXXX"
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <label htmlFor="edit-internet-toggle" className="text-slate-800 font-medium block cursor-pointer">Internet Charge</label>
                  <span className="text-[10px] text-slate-500">Apply to future monthly bills</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="edit-internet-toggle"
                    type="checkbox"
                    checked={editForm.internetEnabled}
                    onChange={(e) => setEditForm({ ...editForm, internetEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-slate-900"></div>
                  <span className="ml-2 text-[11px] font-medium text-slate-700">
                    {editForm.internetEnabled ? 'Enabled' : 'No Internet'}
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Optional notes..."
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPassModalOpen && selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-xs w-full shadow-lg text-xs space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
              Reset Password &mdash; {selectedTenant.fullName}
            </h3>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetPassModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium disabled:opacity-50"
                >
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Room Modal */}
      {moveRoomModalOpen && selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-xs w-full shadow-lg text-xs space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
              Move Room &mdash; {selectedTenant.fullName}
            </h3>
            <form onSubmit={handleMoveRoom} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Select New Room</label>
                <select
                  required
                  value={targetRoomId}
                  onChange={(e) => setTargetRoomId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 bg-white focus:outline-none focus:border-slate-900"
                >
                  <option value="">
                    {vacantRooms.length === 0 ? 'No vacant rooms available' : 'Select vacant room'}
                  </option>
                  {vacantRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.roomNumber} ({formatCurrencyNPR(r.defaultRent)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMoveRoomModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !targetRoomId}
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium disabled:opacity-50"
                >
                  Move
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Citizenship Document Modal */}
      {docModalOpen && selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-sm w-full shadow-lg text-xs space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
              Citizenship &mdash; {selectedTenant.fullName}
            </h3>

            {(selectedTenant.tenantProfile?.citizenshipDocPath || selectedTenant.profile?.citizenshipDocPath) && (
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 flex items-center justify-between text-xs">
                <span>Document Uploaded</span>
                <a
                  href={`/api/documents/citizenship/${selectedTenant.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 underline font-semibold hover:text-emerald-900"
                >
                  View Document ↗
                </a>
              </div>
            )}

            <form onSubmit={handleUploadDoc} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Citizenship Number</label>
                <input
                  type="text"
                  value={docCitizenshipNo}
                  onChange={(e) => setDocCitizenshipNo(e.target.value)}
                  placeholder="27-01-75-XXXXX"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Upload Document (Image / PDF)</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDocModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Out Confirmation Modal */}
      <ConfirmModal
        isOpen={moveOutModalOpen}
        title="Confirm Tenant Move-Out"
        message={
          tenantForMoveOut
            ? `Are you sure you want to mark ${tenantForMoveOut.fullName} as moved out? Their assigned room will become vacant immediately.`
            : 'Are you sure you want to mark this tenant as moved out?'
        }
        confirmText="Confirm Move-Out"
        cancelText="Cancel"
        isDanger={true}
        loading={actionLoading}
        onConfirm={handleConfirmMoveOut}
        onCancel={() => {
          setMoveOutModalOpen(false);
          setTenantForMoveOut(null);
        }}
      />

      {/* Delete / Safe Archive Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        title={
          tenantForDelete && (tenantForDelete.profile?.status === 'ARCHIVED' || tenantForDelete.tenantProfile?.status === 'ARCHIVED')
            ? 'Permanently Delete Tenant Record'
            : 'Delete / Archive Tenant Record'
        }
        message={
          tenantForDelete
            ? (tenantForDelete.profile?.status === 'ARCHIVED' || tenantForDelete.tenantProfile?.status === 'ARCHIVED')
              ? `⚠️ PERMANENT DELETION: Are you sure you want to permanently delete ${tenantForDelete.fullName} and ALL associated records (bills, payments, receipts, water records, electricity readings)? This action CANNOT be undone.`
              : `Are you sure you want to remove ${tenantForDelete.fullName}? If this tenant has historical billing or payment records, their profile will be safely archived to preserve financial records. If they have no financial records, they will be permanently deleted.`
            : 'Are you sure you want to remove this tenant record?'
        }
        confirmText={
          tenantForDelete && (tenantForDelete.profile?.status === 'ARCHIVED' || tenantForDelete.tenantProfile?.status === 'ARCHIVED')
            ? 'Permanently Delete'
            : 'Confirm Removal'
        }
        cancelText="Cancel"
        isDanger={true}
        loading={actionLoading}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setTenantForDelete(null);
        }}
      />

      {/* Cash Payment Modal */}
      {cashModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full shadow-2xl text-xs space-y-4 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-xs">Rs</span>
                  <span>Record Direct Cash Payment</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Receive cash directly and clear tenant dues
                </p>
              </div>
              <button
                onClick={() => setCashModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base p-1"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRecordCashPayment} className="space-y-3.5">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                <div className="font-semibold text-slate-900">{cashForm.tenantName}</div>
                <div className="text-[11px] text-slate-500">Room: {cashForm.roomNumber || 'Former Room'}</div>
              </div>

              {cashForm.maxDue > 0 && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-center justify-between">
                  <span className="font-medium">Outstanding Due:</span>
                  <span className="font-bold font-mono text-sm">{formatCurrencyNPR(cashForm.maxDue)}</span>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Cash Amount Received (NPR) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 font-bold">Rs.</span>
                  <input
                    type="number"
                    required
                    min={1}
                    value={cashForm.amount}
                    onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })}
                    placeholder="e.g. 6500"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-mono font-bold text-sm focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Payment Date (Bikram Sambat BS)
                </label>
                <NepaliDatePicker
                  value={cashForm.paymentDateBS}
                  onChange={(formattedBS) => setCashForm({ ...cashForm, paymentDateBS: formattedBS })}
                  placeholder="Select payment date"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Remarks / Notes (Optional)
                </label>
                <input
                  type="text"
                  value={cashForm.notes}
                  onChange={(e) => setCashForm({ ...cashForm, notes: e.target.value })}
                  placeholder="e.g. Received in cash by Yubraj"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCashModalOpen(false)}
                  disabled={cashSubmitting}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cashSubmitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition"
                >
                  {cashSubmitting ? 'Recording...' : 'Record Cash Payment & Clear Dues'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Advance Summary & Traceability Modal */}
      {advanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-2xl w-full shadow-xl text-xs space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Advance & Credit Summary &mdash; {selectedTenant?.fullName}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Room {selectedTenant?.profile?.roomNumber ?? selectedTenant?.tenantProfile?.room?.roomNumber ?? '-'} &bull; @{selectedTenant?.username}
                </p>
              </div>
              <button
                onClick={() => {
                  setAdvanceModalOpen(false);
                  setAdvanceTenantSummary(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold text-base"
              >
                &times;
              </button>
            </div>

            {advanceLoading ? (
              <div className="py-12 text-center text-slate-400">Loading advance statement...</div>
            ) : (
              <div className="space-y-4">
                {/* 4 Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-[11px] text-slate-500 font-medium">Total Paid (All-Time)</div>
                    <div className="text-sm font-bold font-mono text-slate-900 mt-1">
                      {formatCurrencyNPR(advanceTenantSummary?.totalAdvancePaid || 0)}
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-[11px] text-slate-500 font-medium">Charges Covered</div>
                    <div className="text-sm font-bold font-mono text-slate-700 mt-1">
                      {formatCurrencyNPR(advanceTenantSummary?.advanceConsumed || 0)}
                    </div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <div className="text-[11px] text-emerald-800 font-medium">Remaining Advance Credit</div>
                    <div className="text-sm font-bold font-mono text-emerald-900 mt-1">
                      {formatCurrencyNPR(advanceTenantSummary?.remainingAdvance || 0)}
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="text-[11px] text-amber-800 font-medium">Current Amount Due</div>
                    <div className="text-sm font-bold font-mono text-amber-900 mt-1">
                      {formatCurrencyNPR(advanceTenantSummary?.currentAmountDue || 0)}
                    </div>
                  </div>
                </div>

                {/* Verified Payments Table */}
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-900 text-xs">Verified Payment Transactions (Advance Source)</h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-3 py-2">Date (BS)</th>
                          <th className="px-3 py-2">Receipt #</th>
                          <th className="px-3 py-2">Method</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {advanceTenantSummary?.advancePayments?.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-4 text-center text-slate-400">
                              No verified payments found.
                            </td>
                          </tr>
                        ) : (
                          advanceTenantSummary?.advancePayments?.map((p: any) => (
                            <tr key={p.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-mono">{p.paymentDateBS}</td>
                              <td className="px-3 py-2 font-mono text-slate-600">{p.receiptNumber || '-'}</td>
                              <td className="px-3 py-2">{p.paymentMethod}</td>
                              <td className="px-3 py-2 font-mono font-bold text-emerald-700 text-right">
                                {formatCurrencyNPR(p.amount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bills Consumption History */}
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-900 text-xs">Charges & Consumption Breakdown</h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-3 py-2">Period</th>
                          <th className="px-3 py-2">Water</th>
                          <th className="px-3 py-2">Total Charge</th>
                          <th className="px-3 py-2">Paid / Covered</th>
                          <th className="px-3 py-2">Balance Due</th>
                          <th className="px-3 py-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {advanceTenantSummary?.billsHistory?.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                              No bills generated yet.
                            </td>
                          </tr>
                        ) : (
                          advanceTenantSummary?.billsHistory?.map((b: any) => (
                            <tr key={b.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-mono">{b.yearBS} {b.monthNameBS}</td>
                              <td className="px-3 py-2 font-mono">{formatCurrencyNPR(b.waterAmount)}</td>
                              <td className="px-3 py-2 font-mono font-medium">{formatCurrencyNPR(b.totalAmount)}</td>
                              <td className="px-3 py-2 font-mono text-emerald-700 font-medium">
                                {formatCurrencyNPR(b.paidAmount)}
                              </td>
                              <td className="px-3 py-2 font-mono font-bold">
                                {b.balanceDue > 0 ? (
                                  <span className="text-amber-700">{formatCurrencyNPR(b.balanceDue)}</span>
                                ) : (
                                  <span className="text-emerald-600">Rs. 0</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  b.status === 'PAID'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : b.status === 'PARTIALLY_PAID'
                                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}>
                                  {b.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setAdvanceModalOpen(false);
                      setAdvanceTenantSummary(null);
                    }}
                    className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg text-xs transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
