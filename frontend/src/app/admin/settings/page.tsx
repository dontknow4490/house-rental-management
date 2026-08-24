'use client';

import React, { useEffect, useState } from 'react';
import { api, getFileUrl } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

export default function AdminSettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrFile, setQrFile] = useState<File | null>(null);

  // Security form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passSaving, setPassSaving] = useState(false);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await api.get('/settings');
      setSettings(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleChange = (key: string, val: string) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.put('/settings', settings);
      toast.success('Settings saved successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleQrUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrFile) return;

    // Validate image format
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(qrFile.type) && !/\.(jpg|jpeg|png)$/i.test(qrFile.name)) {
      toast.warning('Only JPG, JPEG, and PNG image files are allowed.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('qrImage', qrFile);
      await api.post('/settings/upload-qr', formData);
      toast.success('QR Code image uploaded successfully.');
      setQrFile(null);
      loadSettings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload QR code');
    }
  };

  const handleQrRemove = async () => {
    if (!window.confirm('Are you sure you want to remove the payment QR Code?')) return;
    try {
      await api.delete('/settings/qr');
      toast.success('QR Code removed successfully.');
      loadSettings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove QR code');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
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
      toast.success('Admin password updated successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setPassSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="pb-3 border-b border-slate-200">
        <h2 className="text-base font-bold text-slate-900">Settings & Rates</h2>
        <p className="text-xs text-slate-500">Configure house utility rates, bank details, and admin security</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400 text-xs">
          Loading settings...
        </div>
      ) : (
        <div className="space-y-6 text-xs">
          {/* Utility Rates Form */}
          <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-4">
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
              Utility Rates & Billing Defaults
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Electricity Rate (Rs. / Unit)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={settings['ELECTRICITY_UNIT_RATE'] || '15'}
                  onChange={(e) => handleChange('ELECTRICITY_UNIT_RATE', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Internet (Rs. / Person / Month)
                </label>
                <input
                  type="number"
                  value={settings['INTERNET_PER_PERSON_RATE'] || '250'}
                  onChange={(e) => handleChange('INTERNET_PER_PERSON_RATE', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Garbage Charge (Rs. / Room / Month)
                </label>
                <input
                  type="number"
                  value={settings['GARBAGE_CHARGE'] || '100'}
                  onChange={(e) => handleChange('GARBAGE_CHARGE', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Water Jar Price (Rs. / Jar)
                </label>
                <input
                  type="number"
                  value={settings['DRINKING_WATER_DEFAULT_PRICE'] || '45'}
                  onChange={(e) => handleChange('DRINKING_WATER_DEFAULT_PRICE', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>
            </div>

            {/* Bank & eSewa Settings */}
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider pt-2 pb-2 border-b border-slate-100">
              Payment & Bank Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  eSewa ID / Wallet Number
                </label>
                <input
                  type="text"
                  value={settings['ESEWA_ID'] || '9761848471'}
                  onChange={(e) => handleChange('ESEWA_ID', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  eSewa Account Name
                </label>
                <input
                  type="text"
                  value={settings['ESEWA_ACCOUNT_NAME'] || 'Yubraj Shrestha'}
                  onChange={(e) => handleChange('ESEWA_ACCOUNT_NAME', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={settings['BANK_NAME'] || 'Nabil Bank'}
                  onChange={(e) => handleChange('BANK_NAME', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Bank Account Number
                </label>
                <input
                  type="text"
                  value={settings['BANK_ACCOUNT_NUMBER'] || '15310017504670'}
                  onChange={(e) => handleChange('BANK_ACCOUNT_NUMBER', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Bank Account Name
                </label>
                <input
                  type="text"
                  value={settings['BANK_ACCOUNT_NAME'] || 'Yubraj Shrestha'}
                  onChange={(e) => handleChange('BANK_ACCOUNT_NAME', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Bank Branch
                </label>
                <input
                  type="text"
                  value={settings['BANK_BRANCH'] || 'Imadol'}
                  onChange={(e) => handleChange('BANK_BRANCH', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Payment Instructions for Tenants
              </label>
              <textarea
                rows={2}
                value={settings['PAYMENT_INSTRUCTIONS'] || ''}
                onChange={(e) => handleChange('PAYMENT_INSTRUCTIONS', e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded font-medium disabled:opacity-50 transition"
              >
                {saving ? 'Saving...' : 'Save Settings & Rates'}
              </button>
            </div>
          </form>

          {/* QR Code Upload Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
              Payment QR Code (eSewa / Fonepay)
            </h3>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              {settings['ESEWA_QR_IMAGE'] ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="p-1.5 bg-white rounded border border-slate-200 shrink-0 shadow-sm">
                    <img
                      src={getFileUrl(settings['ESEWA_QR_IMAGE'])}
                      alt="Payment QR"
                      className="w-28 h-28 object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleQrRemove}
                    className="px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 rounded transition"
                  >
                    Remove QR Code
                  </button>
                </div>
              ) : (
                <div className="w-28 h-28 rounded border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-center p-2">
                  No QR Uploaded
                </div>
              )}

              <form onSubmit={handleQrUpload} className="flex-1 space-y-2">
                <p className="text-slate-500">
                  Upload your personal Fonepay or eSewa QR image. Tenants will scan this on the payment page. It remains active permanently until explicitly changed or removed.
                </p>

                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  onChange={(e) => setQrFile(e.target.files?.[0] || null)}
                  className="w-full text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                />

                <button
                  type="submit"
                  disabled={!qrFile}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded font-medium disabled:opacity-50"
                >
                  {settings['ESEWA_QR_IMAGE'] ? 'Replace QR Code' : 'Upload QR Code'}
                </button>
              </form>
            </div>
          </div>

          {/* Admin Change Password Form */}
          <form onSubmit={handleChangePassword} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
              Change Administrator Password
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="submit"
                disabled={passSaving}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded font-medium disabled:opacity-50"
              >
                {passSaving ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
