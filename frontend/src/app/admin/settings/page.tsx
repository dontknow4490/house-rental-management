'use client';

import React, { useEffect, useState } from 'react';
import { api, getFileUrl } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { useAutoSync, broadcastSync } from '@/lib/sync';
import {
  Settings,
  User,
  Shield,
  QrCode,
  Zap,
  Droplets,
  CreditCard,
  Building,
  Save,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Trash2,
  Download,
  Eye,
  X,
  HardDrive,
  FileImage,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

export default function AdminSettingsPage() {
  const toast = useToast();
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'payment' | 'system' | 'media'>('profile');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // eSewa & Bank QR files
  const [esewaFile, setEsewaFile] = useState<File | null>(null);
  const [bankQrFile, setBankQrFile] = useState<File | null>(null);
  const [esewaUploading, setEsewaUploading] = useState(false);
  const [bankQrUploading, setBankQrUploading] = useState(false);

  // Image Preview Modal
  const [previewModal, setPreviewModal] = useState<{ title: string; url: string } | null>(null);

  // Admin Profile form
  const [profileForm, setProfileForm] = useState({
    username: '',
    fullName: '',
    phone: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);

  // Security form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passSaving, setPassSaving] = useState(false);

  // Media Audit state
  const [mediaAudit, setMediaAudit] = useState<{ stats: any; media: any[] } | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<any | null>(null);
  const [mediaDeleting, setMediaDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileForm({
        username: user.username || '',
        fullName: user.fullName || '',
        phone: user.phone || '',
      });
    }
  }, [user]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await api.get('/settings');
      setSettings(data || {});
    } catch (err: any) {
      toast.error(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const loadMediaAudit = async () => {
    try {
      setMediaLoading(true);
      const res = await api.get('/media');
      setMediaAudit(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load storage audit');
    } finally {
      setMediaLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useAutoSync(loadSettings, ['settings', 'all']);

  useEffect(() => {
    if (activeTab === 'media') {
      loadMediaAudit();
    }
  }, [activeTab]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.username.trim()) {
      toast.warning('Username is required.');
      return;
    }
    try {
      setProfileSaving(true);
      const res = await api.put('/auth/account', {
        username: profileForm.username.trim(),
        fullName: profileForm.fullName.trim(),
        phone: profileForm.phone.trim() || undefined,
      });
      if (res.accessToken) {
        localStorage.setItem('access_token', res.accessToken);
      }
      await refreshUser();
      toast.success(res.message || 'Admin profile and username updated successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update admin profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast.warning('Please enter current and new password');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.warning('New passwords do not match');
      return;
    }
    try {
      setPassSaving(true);
      await api.put('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Admin password changed successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setPassSaving(false);
    }
  };

  const handleChange = (key: string, val: string) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.put('/settings', settings);
      broadcastSync('settings');
      toast.success('System configuration saved successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // eSewa QR Upload & Remove
  const handleEsewaQrUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!esewaFile || esewaUploading) return;

    const formData = new FormData();
    formData.append('qrImage', esewaFile);

    try {
      setEsewaUploading(true);
      const res = await api.post('/settings/upload-qr', formData);
      const newUrl = res.qrPath || res.url || res.payment_qr_path;
      setSettings((prev) => ({
        ...prev,
        ESEWA_QR_IMAGE: newUrl,
        payment_qr_path: newUrl,
        esewaQrImage: newUrl,
      }));
      setEsewaFile(null);
      broadcastSync('settings');
      toast.success('eSewa QR Code uploaded successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload eSewa QR code');
    } finally {
      setEsewaUploading(false);
    }
  };

  const handleRemoveEsewaQr = async () => {
    try {
      await api.delete('/settings/qr');
      setSettings((prev) => ({
        ...prev,
        ESEWA_QR_IMAGE: '',
        payment_qr_path: '',
        esewaQrImage: '',
      }));
      broadcastSync('settings');
      toast.success('eSewa QR Code removed successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove eSewa QR code');
    }
  };

  // Bank QR Upload & Remove
  const handleBankQrUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankQrFile || bankQrUploading) return;

    const formData = new FormData();
    formData.append('qrImage', bankQrFile);

    try {
      setBankQrUploading(true);
      const res = await api.post('/settings/upload-bank-qr', formData);
      const newUrl = res.qrPath || res.url || res.bank_qr_path;
      setSettings((prev) => ({
        ...prev,
        BANK_QR_IMAGE: newUrl,
        bank_qr_path: newUrl,
        bankQrImage: newUrl,
      }));
      setBankQrFile(null);
      broadcastSync('settings');
      toast.success('Bank QR Code uploaded successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload Bank QR code');
    } finally {
      setBankQrUploading(false);
    }
  };

  const handleRemoveBankQr = async () => {
    try {
      await api.delete('/settings/bank-qr');
      setSettings((prev) => ({
        ...prev,
        BANK_QR_IMAGE: '',
        bank_qr_path: '',
        bankQrImage: '',
      }));
      broadcastSync('settings');
      toast.success('Bank QR Code removed successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove Bank QR code');
    }
  };

  // Download high-resolution QR resource directly
  const handleDownloadQr = async (url: string, filename: string) => {
    try {
      const fullUrl = getFileUrl(url);
      const res = await fetch(fullUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success('QR Code downloaded successfully.');
    } catch {
      window.open(getFileUrl(url), '_blank');
    }
  };

  // Delete Cloudinary Media Asset
  const handleDeleteMedia = async (publicId: string, force: boolean) => {
    try {
      setMediaDeleting(true);
      await api.delete(`/media?publicId=${encodeURIComponent(publicId)}&force=${force ? 'true' : 'false'}`);
      toast.success('Media file deleted successfully.');
      setDeleteConfirmItem(null);
      loadMediaAudit();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete media asset');
    } finally {
      setMediaDeleting(false);
    }
  };

  const esewaQrPath = settings.ESEWA_QR_IMAGE || settings.payment_qr_path || settings.esewaQrImage;
  const bankQrPath = settings.BANK_QR_IMAGE || settings.bank_qr_path || settings.bankQrImage;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="Configuration"
        title="Settings & Administration"
        subtitle="Manage administrator profile, credentials, payment QR codes, tariffs, and storage"
      />

      {/* Navigation Tabs */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'profile'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Admin Profile</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'security'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Security</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payment')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'payment'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Payment QRs & Accounts</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'system'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Tariffs & Rates</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'media'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Storage & Media</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Admin Profile & Username */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          <Card className="md:col-span-1">
            <CardContent className="flex flex-col items-center text-center p-6 space-y-3">
              <div className="w-20 h-20 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-2xl flex items-center justify-center border-2 border-indigo-200 shadow-xs">
                {user?.fullName ? user.fullName.slice(0, 2).toUpperCase() : 'AD'}
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">{user?.fullName}</h3>
                <p className="text-xs text-slate-500 font-mono">@{user?.username}</p>
                <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 mt-2">
                  System Administrator
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-slate-100">
                You hold full administrative control over rooms, tenants, billing calculations, and ledgers.
              </p>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Edit Admin Profile & Username</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update your display name and login username
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Admin Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.username}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        username: e.target.value.toLowerCase().replace(/\s+/g, ''),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-bold"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Used to sign in to the administrative portal. Must be unique.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={profileForm.fullName}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, fullName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Phone Number</label>
                  <input
                    type="text"
                    value={profileForm.phone}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, phone: e.target.value })
                    }
                    placeholder="e.g. 9841234567"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" variant="primary" loading={profileSaving} className="font-bold">
                    <Save className="w-4 h-4" />
                    <span>Save Profile Changes</span>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Security & Password */}
      {activeTab === 'security' && (
        <Card className="max-w-xl text-xs">
          <CardHeader>
            <div>
              <CardTitle>Change Administrator Password</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Ensure account security by updating your password regularly
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" variant="primary" loading={passSaving} className="font-bold">
                  <Shield className="w-4 h-4" />
                  <span>Update Password</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Payment QRs & Accounts */}
      {activeTab === 'payment' && (
        <div className="space-y-6 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. eSewa QR Management Card */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>eSewa Payment QR</span>
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Displayed to tenants selecting eSewa digital wallet payment
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  {esewaQrPath ? (
                    <div className="text-center space-y-3">
                      <div
                        onClick={() => setPreviewModal({ title: 'eSewa QR Code', url: getFileUrl(esewaQrPath) })}
                        className="w-44 h-44 rounded-xl overflow-hidden border border-slate-200 bg-white p-2 shadow-xs mx-auto cursor-pointer group relative"
                        title="Click to view large preview"
                      >
                        <img
                          src={getFileUrl(esewaQrPath)}
                          alt="eSewa QR code"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white font-bold text-xs gap-1.5">
                          <Eye className="w-4 h-4" />
                          <span>Preview</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Active eSewa QR</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-center gap-2 pt-1">
                        <Button
                          type="button"
                          variant="secondary"
                          size="xs"
                          onClick={() => setPreviewModal({ title: 'eSewa QR Code', url: getFileUrl(esewaQrPath) })}
                          className="font-bold"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="xs"
                          onClick={() => handleDownloadQr(esewaQrPath, 'esewa_qr.png')}
                          className="font-bold"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="xs"
                          onClick={handleRemoveEsewaQr}
                          className="font-bold"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-400 space-y-1">
                      <QrCode className="w-12 h-12 mx-auto text-slate-300" />
                      <div className="text-xs font-semibold text-slate-500">
                        No eSewa QR Code Uploaded Yet
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleEsewaQrUpload} className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 text-xs">
                      {esewaQrPath ? 'Replace eSewa QR Code Image' : 'Upload eSewa QR Code Image'}
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setEsewaFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!esewaFile}
                    loading={esewaUploading}
                    className="w-full font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Save className="w-4 h-4" />
                    <span>{esewaQrPath ? 'Replace eSewa QR Code' : 'Upload eSewa QR Code'}</span>
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* 2. Bank QR Management Card */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    <span>Bank Transfer QR</span>
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Displayed to tenants selecting Bank Transfer payment
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  {bankQrPath ? (
                    <div className="text-center space-y-3">
                      <div
                        onClick={() => setPreviewModal({ title: 'Bank Transfer QR Code', url: getFileUrl(bankQrPath) })}
                        className="w-44 h-44 rounded-xl overflow-hidden border border-slate-200 bg-white p-2 shadow-xs mx-auto cursor-pointer group relative"
                        title="Click to view large preview"
                      >
                        <img
                          src={getFileUrl(bankQrPath)}
                          alt="Bank Transfer QR code"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white font-bold text-xs gap-1.5">
                          <Eye className="w-4 h-4" />
                          <span>Preview</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <span className="text-[11px] font-semibold text-indigo-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Active Bank QR</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-center gap-2 pt-1">
                        <Button
                          type="button"
                          variant="secondary"
                          size="xs"
                          onClick={() => setPreviewModal({ title: 'Bank Transfer QR Code', url: getFileUrl(bankQrPath) })}
                          className="font-bold"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="xs"
                          onClick={() => handleDownloadQr(bankQrPath, 'bank_qr.png')}
                          className="font-bold"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="xs"
                          onClick={handleRemoveBankQr}
                          className="font-bold"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-400 space-y-1">
                      <QrCode className="w-12 h-12 mx-auto text-slate-300" />
                      <div className="text-xs font-semibold text-slate-500">
                        No Bank QR Code Uploaded Yet
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleBankQrUpload} className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 text-xs">
                      {bankQrPath ? 'Replace Bank QR Code Image' : 'Upload Bank QR Code Image'}
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setBankQrFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!bankQrFile}
                    loading={bankQrUploading}
                    className="w-full font-bold"
                  >
                    <Save className="w-4 h-4" />
                    <span>{bankQrPath ? 'Replace Bank QR Code' : 'Upload Bank QR Code'}</span>
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Payment Account Details */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Bank & Wallet Account Details</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Account instructions provided to residents for manual transfers
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSettings} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={settings.BANK_NAME || settings.bank_name || ''}
                      onChange={(e) => handleChange('BANK_NAME', e.target.value)}
                      placeholder="e.g. Nabil Bank"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={settings.BANK_ACCOUNT_NAME || settings.bank_account_holder || ''}
                      onChange={(e) => handleChange('BANK_ACCOUNT_NAME', e.target.value)}
                      placeholder="e.g. Ramesh Thapa"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Bank Account Number
                    </label>
                    <input
                      type="text"
                      value={settings.BANK_ACCOUNT_NUMBER || settings.bank_account_number || ''}
                      onChange={(e) => handleChange('BANK_ACCOUNT_NUMBER', e.target.value)}
                      placeholder="e.g. 01234567890123"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Bank Branch</label>
                    <input
                      type="text"
                      value={settings.BANK_BRANCH || settings.bank_branch || ''}
                      onChange={(e) => handleChange('BANK_BRANCH', e.target.value)}
                      placeholder="e.g. Kathmandu"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">eSewa Account Name</label>
                    <input
                      type="text"
                      value={settings.ESEWA_ACCOUNT_NAME || settings.esewa_account_name || ''}
                      onChange={(e) => handleChange('ESEWA_ACCOUNT_NAME', e.target.value)}
                      placeholder="e.g. House Rental Admin"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">eSewa ID / Phone</label>
                    <input
                      type="text"
                      value={settings.ESEWA_ID || settings.esewa_id || ''}
                      onChange={(e) => handleChange('ESEWA_ID', e.target.value)}
                      placeholder="e.g. 9800000000"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" variant="primary" loading={saving} className="font-bold">
                    <Save className="w-4 h-4" />
                    <span>Save Account Details</span>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 4: Tariffs & System Rates */}
      {activeTab === 'system' && (
        <Card className="max-w-2xl text-xs">
          <CardHeader>
            <div>
              <CardTitle>Utility Rates & Fixed Fees</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Default calculation tariffs applied during monthly bill generation
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Electricity Rate per Unit (NPR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-bold">Rs.</span>
                    <input
                      type="number"
                      value={settings.ELECTRICITY_UNIT_RATE || settings.electricity_rate || '15'}
                      onChange={(e) => handleChange('ELECTRICITY_UNIT_RATE', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Default Water Jar Price (NPR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-bold">Rs.</span>
                    <input
                      type="number"
                      value={settings.DRINKING_WATER_DEFAULT_PRICE || settings.default_water_price || '45'}
                      onChange={(e) => handleChange('DRINKING_WATER_DEFAULT_PRICE', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Fixed Garbage Fee per Room (NPR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-bold">Rs.</span>
                    <input
                      type="number"
                      value={settings.GARBAGE_CHARGE || settings.garbage_fee || '100'}
                      onChange={(e) => handleChange('GARBAGE_CHARGE', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Internet Rate per Person (NPR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-bold">Rs.</span>
                    <input
                      type="number"
                      value={settings.INTERNET_PER_PERSON_RATE || settings.internet_fee || '250'}
                      onChange={(e) => handleChange('INTERNET_PER_PERSON_RATE', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" variant="primary" loading={saving} className="font-bold">
                  <Save className="w-4 h-4" />
                  <span>Save Utility Tariffs</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tab 5: Storage & Media Audit Management */}
      {activeTab === 'media' && (
        <div className="space-y-6 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Cloudinary Media & Storage Management</h2>
              <p className="text-xs text-slate-500">Safely view, audit, and clean up application upload assets</p>
            </div>
            <Button type="button" variant="secondary" size="xs" onClick={loadMediaAudit} loading={mediaLoading}>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Audit</span>
            </Button>
          </div>

          {/* Audit Summary Statistics */}
          {mediaAudit?.stats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 text-[11px] block">Total Files</span>
                <span className="text-lg font-extrabold text-slate-900 font-mono">
                  {mediaAudit.stats.totalFiles}
                </span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 text-[11px] block">Referenced</span>
                <span className="text-lg font-extrabold text-emerald-600 font-mono">
                  {mediaAudit.stats.referencedFiles}
                </span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 text-[11px] block">Orphaned</span>
                <span className="text-lg font-extrabold text-amber-600 font-mono">
                  {mediaAudit.stats.orphanedFiles}
                </span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 text-[11px] block">Public Assets</span>
                <span className="text-lg font-extrabold text-indigo-600 font-mono">
                  {mediaAudit.stats.publicFiles}
                </span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 text-[11px] block">Private / Signed</span>
                <span className="text-lg font-extrabold text-slate-700 font-mono">
                  {mediaAudit.stats.privateFiles}
                </span>
              </div>
            </div>
          )}

          {/* Media Table */}
          <Card>
            <CardHeader>
              <CardTitle>Uploaded Assets Audit List</CardTitle>
            </CardHeader>
            <CardContent>
              {mediaLoading ? (
                <div className="p-8 text-center text-slate-400">Loading storage audit data...</div>
              ) : !mediaAudit?.media || mediaAudit.media.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No media assets found in system records.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/70">
                        <th className="py-2.5 px-3">Asset</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Referenced By</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {mediaAudit.media.map((item) => (
                        <tr key={item.publicId || item.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5">
                              <div
                                onClick={() => setPreviewModal({ title: item.categoryLabel, url: item.url })}
                                className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 bg-white flex-shrink-0 cursor-pointer p-0.5 hover:opacity-80"
                              >
                                <img
                                  src={item.url}
                                  alt={item.categoryLabel}
                                  className="w-full h-full object-cover rounded"
                                />
                              </div>
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-900 truncate block max-w-[180px]" title={item.publicId}>
                                  {item.publicId}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {item.isPrivate ? 'Protected (Signed Access)' : 'Public Asset'}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-3">
                            <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {item.categoryLabel}
                            </span>
                          </td>

                          <td className="py-2.5 px-3">
                            {item.isReferenced ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                Referenced
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <AlertCircle className="w-3 h-3" />
                                Orphaned
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                            {item.referencedBy || '—'}
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="secondary"
                                size="xs"
                                onClick={() => setPreviewModal({ title: item.categoryLabel, url: item.url })}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="xs"
                                onClick={() => handleDownloadQr(item.url, `${item.publicId.split('/').pop()}.jpg`)}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="danger"
                                size="xs"
                                onClick={() => setDeleteConfirmItem(item)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal for Storage Audit */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 text-xs animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">Confirm Asset Deletion</h3>
                <p className="text-slate-500 text-[11px]">Permanent cloud storage deletion</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-slate-700">
              <div><span className="font-semibold text-slate-900">Asset:</span> <span className="font-mono text-slate-800">{deleteConfirmItem.publicId}</span></div>
              <div><span className="font-semibold text-slate-900">Category:</span> {deleteConfirmItem.categoryLabel}</div>
              {deleteConfirmItem.isReferenced && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 font-semibold text-[11px] mt-2">
                  Warning: This asset is actively referenced by {deleteConfirmItem.referencedBy}. Deleting it will cause missing image errors on that record.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setDeleteConfirmItem(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={mediaDeleting}
                onClick={() => handleDeleteMedia(deleteConfirmItem.publicId, deleteConfirmItem.isReferenced)}
              >
                Confirm Delete Asset
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Size Image Preview Modal */}
      {previewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
              <span className="font-bold text-xs">{previewModal.title}</span>
              <button
                onClick={() => setPreviewModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 bg-slate-950 flex items-center justify-center overflow-auto flex-1">
              <img
                src={previewModal.url}
                alt={previewModal.title}
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
              />
            </div>
            <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => handleDownloadQr(previewModal.url, `${previewModal.title.toLowerCase().replace(/\s+/g, '_')}.png`)}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download High-Res Original</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
