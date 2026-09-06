import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

export const DEFAULT_SETTINGS: Record<string, { value: string; description: string }> = {
  ELECTRICITY_UNIT_RATE: { value: '15', description: 'Electricity charge per unit in NPR' },
  INTERNET_PER_PERSON_RATE: { value: '250', description: 'Internet charge per person per month in NPR' },
  GARBAGE_CHARGE: { value: '100', description: 'Fixed garbage charge per room per month in NPR' },
  DRINKING_WATER_DEFAULT_PRICE: { value: '45', description: 'Drinking water jar price in NPR' },
  ESEWA_ACCOUNT_NAME: { value: 'House Rental Admin', description: 'eSewa account display name' },
  ESEWA_ID: { value: '9800000000', description: 'eSewa phone/ID' },
  ESEWA_QR_IMAGE: { value: '', description: 'Uploaded eSewa QR Code image path' },
  BANK_QR_IMAGE: { value: '', description: 'Uploaded Bank QR Code image path' },
  BANK_NAME: { value: 'Standard Chartered Bank', description: 'Bank Name' },
  BANK_ACCOUNT_NAME: { value: 'House Rental Admin', description: 'Bank Account Holder Name' },
  BANK_ACCOUNT_NUMBER: { value: '00000000000000', description: 'Bank Account Number' },
  BANK_BRANCH: { value: 'Kathmandu', description: 'Bank Branch' },
  PAYMENT_INSTRUCTIONS: {
    value: 'Please include your Room Number and Month in the Remarks field when making payments.',
    description: 'Payment instructions shown to tenants',
  },
};

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
  ) {}

  async getAllSettings() {
    const records = await this.prisma.systemSetting.findMany();
    const result: Record<string, string> = {};

    // Initialize defaults if missing
    for (const [key, meta] of Object.entries(DEFAULT_SETTINGS)) {
      result[key] = meta.value;
    }

    for (const rec of records) {
      result[rec.key] = rec.value;
    }

    return result;
  }

  async getSetting(key: string, defaultValue = ''): Promise<string> {
    const rec = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (rec) return rec.value;
    return DEFAULT_SETTINGS[key]?.value ?? defaultValue;
  }

  async getNumberSetting(key: string, defaultValue = 0): Promise<number> {
    const val = await this.getSetting(key);
    const parsed = parseFloat(val);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  async updateSettings(settings: Record<string, string>, adminUserId: string, ipAddress?: string) {
    const updatedKeys: string[] = [];

    const keyAliases: Record<string, string> = {
      esewaQrImage: 'ESEWA_QR_IMAGE',
      paymentQrCode: 'ESEWA_QR_IMAGE',
      payment_qr_path: 'ESEWA_QR_IMAGE',
      qrPath: 'ESEWA_QR_IMAGE',
      bankQrImage: 'BANK_QR_IMAGE',
      bank_qr_path: 'BANK_QR_IMAGE',
      esewaAccountName: 'ESEWA_ACCOUNT_NAME',
      esewaId: 'ESEWA_ID',
      electricityRate: 'ELECTRICITY_UNIT_RATE',
      internetRate: 'INTERNET_PER_PERSON_RATE',
      waterPrice: 'DRINKING_WATER_DEFAULT_PRICE',
      garbageCharge: 'GARBAGE_CHARGE',
      bankName: 'BANK_NAME',
      bankAccountName: 'BANK_ACCOUNT_NAME',
      bankAccountNumber: 'BANK_ACCOUNT_NUMBER',
      bankBranch: 'BANK_BRANCH',
      paymentInstructions: 'PAYMENT_INSTRUCTIONS',
    };

    for (let [rawKey, value] of Object.entries(settings)) {
      const key = keyAliases[rawKey] || rawKey;

      // Protect ESEWA_QR_IMAGE & BANK_QR_IMAGE: If value is empty, don't overwrite existing QR image in bulk updates
      if ((key === 'ESEWA_QR_IMAGE' || key === 'BANK_QR_IMAGE') && (!value || String(value).trim() === '')) {
        const existing = await this.prisma.systemSetting.findUnique({ where: { key } });
        if (existing && existing.value) {
          continue; // Preserve permanent QR configuration
        }
      }

      await this.prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: {
          key,
          value: String(value),
          description: DEFAULT_SETTINGS[key]?.description || key,
        },
      });
      updatedKeys.push(key);
    }

    await this.auditLogService.log({
      userId: adminUserId,
      action: 'SYSTEM_SETTINGS_UPDATED',
      details: { updatedKeys, settings },
      ipAddress,
    });

    return this.getAllSettings();
  }

  async removeEsewaQr(adminUserId: string, ipAddress?: string) {
    await this.prisma.systemSetting.upsert({
      where: { key: 'ESEWA_QR_IMAGE' },
      update: { value: '' },
      create: {
        key: 'ESEWA_QR_IMAGE',
        value: '',
        description: DEFAULT_SETTINGS['ESEWA_QR_IMAGE']?.description || '',
      },
    });

    await this.auditLogService.log({
      userId: adminUserId,
      action: 'SYSTEM_SETTINGS_UPDATED',
      details: { action: 'ESEWA_QR_CODE_REMOVED' },
      ipAddress,
    });

    return { message: 'eSewa QR Code removed successfully.' };
  }

  async removeBankQr(adminUserId: string, ipAddress?: string) {
    await this.prisma.systemSetting.upsert({
      where: { key: 'BANK_QR_IMAGE' },
      update: { value: '' },
      create: {
        key: 'BANK_QR_IMAGE',
        value: '',
        description: DEFAULT_SETTINGS['BANK_QR_IMAGE']?.description || '',
      },
    });

    await this.auditLogService.log({
      userId: adminUserId,
      action: 'SYSTEM_SETTINGS_UPDATED',
      details: { action: 'BANK_QR_CODE_REMOVED' },
      ipAddress,
    });

    return { message: 'Bank QR Code removed successfully.' };
  }

  async getPublicPaymentSettings() {
    const settings = await this.getAllSettings();
    return {
      electricityRate: parseFloat(settings.ELECTRICITY_UNIT_RATE || '15'),
      internetRate: parseFloat(settings.INTERNET_PER_PERSON_RATE || '250'),
      waterPrice: parseFloat(settings.DRINKING_WATER_DEFAULT_PRICE || '45'),
      esewaAccountName: settings.ESEWA_ACCOUNT_NAME || '',
      esewaId: settings.ESEWA_ID || '',
      esewaQrImage: settings.ESEWA_QR_IMAGE || '',
      paymentQrCode: settings.ESEWA_QR_IMAGE || '',
      payment_qr_path: settings.ESEWA_QR_IMAGE || '',
      bankName: settings.BANK_NAME || '',
      bankAccountName: settings.BANK_ACCOUNT_NAME || '',
      bankAccountNumber: settings.BANK_ACCOUNT_NUMBER || '',
      bankBranch: settings.BANK_BRANCH || '',
      bankQrImage: settings.BANK_QR_IMAGE || '',
      bank_qr_path: settings.BANK_QR_IMAGE || '',
      paymentInstructions: settings.PAYMENT_INSTRUCTIONS || '',
    };
  }
}
