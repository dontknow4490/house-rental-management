import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from '../settings/settings.controller';
import { SettingsService } from '../settings/settings.service';
import { PaymentsController } from '../payments/payments.controller';
import { PaymentsService } from '../payments/payments.service';
import { MaintenanceController } from '../maintenance/maintenance.controller';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { DocumentsController } from '../documents/documents.controller';
import { DocumentsService } from '../documents/documents.service';
import { CloudinaryService } from './cloudinary.service';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { validateUploadedFile } from '../common/utils/file-upload.util';

describe('Upload Controllers & Storage Flow Tests (Mocked Dummy Files)', () => {
  let settingsController: SettingsController;
  let paymentsController: PaymentsController;
  let maintenanceController: MaintenanceController;
  let documentsController: DocumentsController;

  let mockSettingsService: any;
  let mockPaymentsService: any;
  let mockMaintenanceService: any;
  let mockDocumentsService: any;
  let mockCloudinaryService: any;

  const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const validPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0, 0, 0, 0, 0, 0]);

  beforeEach(async () => {
    mockCloudinaryService = {
      isConfigured: jest.fn().mockReturnValue(true),
      uploadPublicAsset: jest.fn().mockResolvedValue({
        publicId: 'house-rental/public/qr/esewa_qr_test',
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/house-rental/public/qr/esewa_qr_test.png',
        format: 'png',
        bytes: 100,
        resourceType: 'image',
      }),
      uploadPrivateAsset: jest.fn().mockResolvedValue({
        publicId: 'house-rental/private/test_private',
        secureUrl: 'https://res.cloudinary.com/demo/image/authenticated/v1/house-rental/private/test_private.jpg',
        format: 'jpg',
        bytes: 200,
        resourceType: 'image',
      }),
      deleteAsset: jest.fn().mockResolvedValue({ result: 'ok' }),
      generateSignedUrl: jest.fn().mockReturnValue('https://res.cloudinary.com/demo/signed_url'),
      generateSignedDownloadUrl: jest.fn().mockReturnValue('https://api.cloudinary.com/demo/download_url'),
      extractPublicId: jest.fn((url: string) => {
        if (!url) return '';
        if (url.includes('house-rental/public/qr/')) return 'house-rental/public/qr/old_qr';
        if (url.includes('house-rental/private/')) return 'house-rental/private/old_doc';
        return url;
      }),
    };

    mockSettingsService = {
      getSetting: jest.fn().mockResolvedValue('https://res.cloudinary.com/demo/house-rental/public/qr/old_qr.png'),
      updateSettings: jest.fn().mockResolvedValue({}),
      removeEsewaQr: jest.fn().mockResolvedValue({ message: 'QR removed' }),
    };

    mockPaymentsService = {
      submitPayment: jest.fn().mockResolvedValue({ id: 'payment-1' }),
    };

    mockMaintenanceService = {
      createRequest: jest.fn().mockResolvedValue({ id: 'maint-1' }),
    };

    mockDocumentsService = {
      saveCitizenshipDoc: jest.fn().mockResolvedValue({ userId: 'tenant-1' }),
      getCitizenshipDoc: jest.fn().mockResolvedValue({
        citizenshipDocPath: 'https://res.cloudinary.com/demo/image/authenticated/v1/house-rental/private/citizenship_1.jpg',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        SettingsController,
        PaymentsController,
        MaintenanceController,
        DocumentsController,
      ],
      providers: [
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: MaintenanceService, useValue: mockMaintenanceService },
        { provide: DocumentsService, useValue: mockDocumentsService },
        { provide: CloudinaryService, useValue: mockCloudinaryService },
      ],
    }).compile();

    settingsController = module.get<SettingsController>(SettingsController);
    paymentsController = module.get<PaymentsController>(PaymentsController);
    maintenanceController = module.get<MaintenanceController>(MaintenanceController);
    documentsController = module.get<DocumentsController>(DocumentsController);
  });

  describe('A. QR upload path', () => {
    it('should upload new QR to Cloudinary public folder and clean up old QR', async () => {
      const dummyFile = {
        originalname: 'esewa_qr.png',
        buffer: validPngBuffer,
        size: validPngBuffer.length,
      } as Express.Multer.File;

      const result = await settingsController.uploadEsewaQr(dummyFile, 'admin-1', '127.0.0.1');

      expect(mockCloudinaryService.uploadPublicAsset).toHaveBeenCalledWith(
        dummyFile,
        'house-rental/public/qr',
        expect.stringContaining('esewa_qr_'),
      );
      expect(mockSettingsService.updateSettings).toHaveBeenCalledWith(
        { ESEWA_QR_IMAGE: expect.stringContaining('https://res.cloudinary.com') },
        'admin-1',
        '127.0.0.1',
      );
      // Cleaned up old QR
      expect(mockCloudinaryService.deleteAsset).toHaveBeenCalledWith(
        'house-rental/public/qr/old_qr',
        'image',
        'upload',
      );
      expect(result.message).toContain('eSewa QR code uploaded successfully');
    });
  });

  describe('B. Payment proof upload path', () => {
    it('should upload proof with authenticated type to house-rental/proofs', async () => {
      const dummyFile = {
        originalname: 'proof.png',
        buffer: validPngBuffer,
        size: validPngBuffer.length,
      } as Express.Multer.File;

      await paymentsController.submitPayment(
        { billId: 'bill-1', amount: 5000, paymentMethod: 'ESEWA' as any },
        dummyFile,
        'tenant-1',
        '127.0.0.1',
      );

      expect(mockCloudinaryService.uploadPrivateAsset).toHaveBeenCalledWith(
        dummyFile,
        'house-rental/proofs',
        expect.stringContaining('payment_proof_'),
      );
      expect(mockPaymentsService.submitPayment).toHaveBeenCalledWith(
        expect.anything(),
        'tenant-1',
        expect.stringContaining('https://res.cloudinary.com'),
        '127.0.0.1',
      );
    });
  });

  describe('C. Maintenance photo upload path', () => {
    it('should upload photo with authenticated type to house-rental/maintenance', async () => {
      const dummyFile = {
        originalname: 'leak.png',
        buffer: validPngBuffer,
        size: validPngBuffer.length,
      } as Express.Multer.File;

      await maintenanceController.createRequest(
        { title: 'Water Leak', description: 'Bathroom pipe is leaking' },
        dummyFile,
        'tenant-1',
        '127.0.0.1',
      );

      expect(mockCloudinaryService.uploadPrivateAsset).toHaveBeenCalledWith(
        dummyFile,
        'house-rental/maintenance',
        expect.stringContaining('maintenance_'),
      );
      expect(mockMaintenanceService.createRequest).toHaveBeenCalledWith(
        expect.anything(),
        'tenant-1',
        expect.stringContaining('https://res.cloudinary.com'),
        '127.0.0.1',
      );
    });
  });

  describe('D. Citizenship upload path', () => {
    it('should upload citizenship document to house-rental/private/citizenship', async () => {
      const dummyFile = {
        originalname: 'citizenship.pdf',
        buffer: validPdfBuffer,
        size: validPdfBuffer.length,
      } as Express.Multer.File;

      await documentsController.uploadCitizenship(
        'tenant-1',
        [dummyFile],
        '27-01-78-12345',
        'admin-1',
        '127.0.0.1',
      );

      expect(mockCloudinaryService.uploadPrivateAsset).toHaveBeenCalledWith(
        dummyFile,
        'house-rental/private/citizenship',
        expect.stringContaining('citizenship_tenant-1_'),
      );
      expect(mockDocumentsService.saveCitizenshipDoc).toHaveBeenCalledWith(
        'tenant-1',
        expect.stringContaining('https://res.cloudinary.com'),
        '27-01-78-12345',
        'admin-1',
        '127.0.0.1',
      );
    });
  });

  describe('E. Citizenship view authorization & path handling', () => {
    it('should generate signed URL for Cloudinary document', async () => {
      const mockRes: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
      };

      // Mock http get
      const https = require('https');
      const mockStream: any = {
        pipe: jest.fn(),
        on: jest.fn((event: string, cb: any) => {
          if (event === 'end') cb();
          return mockStream;
        }),
        headers: { 'content-type': 'image/jpeg' },
        statusCode: 200,
      };
      jest.spyOn(https, 'get').mockImplementation((url: string, callback: any) => {
        callback(mockStream);
        return { on: jest.fn() } as any;
      });

      await documentsController.viewCitizenship('tenant-1', mockRes);

      expect(mockCloudinaryService.generateSignedDownloadUrl).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    });
  });

  describe('F & G. File rejection: invalid magic bytes & >10MB size', () => {
    it('should reject file with spoofed extension and wrong magic bytes', () => {
      const spoofFile = {
        originalname: 'fake.png',
        buffer: Buffer.from([0x00, 0x00, 0x00, 0x00]),
        size: 4,
      } as Express.Multer.File;

      expect(() => validateUploadedFile(spoofFile, { allowPdf: true })).toThrow(
        BadRequestException,
      );
    });

    it('should reject file exceeding 10MB size limit', () => {
      const oversizedFile = {
        originalname: 'huge.jpg',
        buffer: validPngBuffer,
        size: 11 * 1024 * 1024,
      } as Express.Multer.File;

      expect(() => validateUploadedFile(oversizedFile, { allowPdf: true })).toThrow(
        'File size exceeds the 10MB limit.',
      );
    });
  });

  describe('H. Cloudinary upload failure handling and rollback', () => {
    it('should clean up newly uploaded Cloudinary asset if DB update fails', async () => {
      const dummyFile = {
        originalname: 'qr.png',
        buffer: validPngBuffer,
        size: validPngBuffer.length,
      } as Express.Multer.File;

      mockSettingsService.updateSettings.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        settingsController.uploadEsewaQr(dummyFile, 'admin-1', '127.0.0.1'),
      ).rejects.toThrow('Database error');

      // Verified rollback deletion
      expect(mockCloudinaryService.deleteAsset).toHaveBeenCalledWith(
        'house-rental/public/qr/esewa_qr_test',
        'image',
        'upload',
      );
    });
  });
});
