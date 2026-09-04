'use client';

import React, { useEffect, useState } from 'react';
import { api, getFileUrl } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
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
} from 'lucide-react';

export default function AdminSettingsPage() {
  const toast = useToast();
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'system' | 'payment'>('profile');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrFile, setQrFile] = useState<File | null>(null);

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

  useEffect(() => {
    loadSettings();
  }, []);

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
      toast.success('System configuration saved successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleQrUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrFile) return;

    const formData = new FormData();
    formData.append('qrCode', qrFile);

    try {
      setSaving(true);
      const res = await api.post('/settings/qr-code', formData);
      setSettings((prev) => ({ ...prev, payment_qr_path: res.qrPath }));
      setQrFile(null);
      toast.success('Payment QR Code image updated successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload QR code');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="Configuration"
        title="Settings & Administration"
        subtitle="Manage administrator profile, username credentials, system tariffs, and payment QR code"
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
            <span>Payment QR & Accounts</span>
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
        </div>
      </div>

      {/* Tab 1: Admin Profile & Username */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={profileSaving}
                    className="font-bold"
                  >
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
        <Card className="max-w-xl">
          <CardHeader>
            <div>
              <CardTitle>Change Admin Password</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Ensure your account is protected with a secure password
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Current Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  New Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Confirm New Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  loading={passSaving}
                  className="font-bold"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Update Password</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Payment QR & Accounts */}
      {activeTab === 'payment' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* QR Code Upload & Live Preview */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Payment QR Code</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Displayed to tenants on their payment page for scanning
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center p-5 bg-slate-50 rounded-2xl border border-slate-200">
                {settings.payment_qr_path ? (
                  <div className="text-center space-y-2">
                    <div className="w-48 h-48 rounded-xl overflow-hidden border border-slate-200 bg-white p-2 shadow-xs mx-auto">
                      <img
                        src={getFileUrl(settings.payment_qr_path)}
                        alt="Payment QR code"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Active QR Code in Use</span>
                    </span>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-400 space-y-1">
                    <QrCode className="w-12 h-12 mx-auto text-slate-300" />
                    <div className="text-xs font-semibold text-slate-500">
                      No QR Code Uploaded Yet
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleQrUpload} className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-xs">
                    Upload New QR Code Image
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setQrFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!qrFile}
                  loading={saving}
                  className="w-full font-bold"
                >
                  <Save className="w-4 h-4" />
                  <span>Update Payment QR Code</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Payment Account Details */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Bank & Wallet Accounts</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Account instructions provided to residents for transfer
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSettings} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={settings.bank_name || ''}
                    onChange={(e) => handleChange('bank_name', e.target.value)}
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
                    value={settings.bank_account_holder || ''}
                    onChange={(e) => handleChange('bank_account_holder', e.target.value)}
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
                    value={settings.bank_account_number || ''}
                    onChange={(e) => handleChange('bank_account_number', e.target.value)}
                    placeholder="e.g. 01234567890123"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">eSewa ID</label>
                  <input
                    type="text"
                    value={settings.esewa_id || ''}
                    onChange={(e) => handleChange('esewa_id', e.target.value)}
                    placeholder="e.g. 9841234567"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Khalti ID</label>
                  <input
                    type="text"
                    value={settings.khalti_id || ''}
                    onChange={(e) => handleChange('khalti_id', e.target.value)}
                    placeholder="e.g. 9841234567"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono"
                  />
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
        <Card className="max-w-2xl">
          <CardHeader>
            <div>
              <CardTitle>Utility Rates & Fixed Fees</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Default calculation tariffs applied during monthly bill generation
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Electricity Rate per Unit (NPR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-bold">Rs.</span>
                    <input
                      type="number"
                      value={settings.electricity_rate || '15'}
                      onChange={(e) => handleChange('electricity_rate', e.target.value)}
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
                      value={settings.default_water_price || '45'}
                      onChange={(e) => handleChange('default_water_price', e.target.value)}
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
                      value={settings.garbage_fee || '100'}
                      onChange={(e) => handleChange('garbage_fee', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Internet Monthly Charge (NPR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-bold">Rs.</span>
                    <input
                      type="number"
                      value={settings.internet_fee || '500'}
                      onChange={(e) => handleChange('internet_fee', e.target.value)}
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
    </div>
  );
}
