import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from './cloudinary.service';
import { v2 as cloudinary } from 'cloudinary';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { validateUploadedFile } from '../common/utils/file-upload.util';

describe('CloudinaryService & Upload Validation Tests', () => {
  let service: CloudinaryService;
  let configService: any;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'CLOUDINARY_CLOUD_NAME') return 'test-cloud';
        if (key === 'CLOUDINARY_API_KEY') return 'test-key';
        if (key === 'CLOUDINARY_API_SECRET') return 'test-secret';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudinaryService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<CloudinaryService>(CloudinaryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization & Configuration', () => {
    it('should initialize successfully when credentials exist', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should report unconfigured when credentials are missing', () => {
      const emptyConfig = { get: jest.fn().mockReturnValue(null) };
      const unconfiguredService = new CloudinaryService(emptyConfig as any);
      expect(unconfiguredService.isConfigured()).toBe(false);
    });
  });

  describe('Public ID Extraction', () => {
    it('should correctly extract publicId from standard Cloudinary upload URL', () => {
      const url =
        'https://res.cloudinary.com/test-cloud/image/upload/v1788582911/house-rental/public/qr/esewa_qr_123.png';
      expect(service.extractPublicId(url)).toBe('house-rental/public/qr/esewa_qr_123');
    });

    it('should correctly extract publicId from authenticated signed Cloudinary URL', () => {
      const url =
        'https://res.cloudinary.com/test-cloud/image/authenticated/s--signature--/v1788582911/house-rental/private/citizenship/citizenship_tenant1_123.jpg';
      expect(service.extractPublicId(url)).toBe(
        'house-rental/private/citizenship/citizenship_tenant1_123',
      );
    });

    it('should handle non-Cloudinary or raw public IDs safely', () => {
      expect(service.extractPublicId('house-rental/proofs/proof_123')).toBe(
        'house-rental/proofs/proof_123',
      );
      expect(service.extractPublicId('')).toBe('');
      expect(service.extractPublicId(null as any)).toBe('');
    });
  });

  describe('Asset Uploads', () => {
    it('should upload a public asset with correct public access options', async () => {
      const dummyFile: Express.Multer.File = {
        fieldname: 'qrImage',
        originalname: 'qr.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: 100,
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      (jest.spyOn(cloudinary.uploader, 'upload_stream') as any).mockImplementation((options: any, callback: any) => {
        expect(options.type).toBe('upload');
        expect(options.access_mode).toBe('public');
        expect(options.folder).toBe('house-rental/public/qr');
        callback(null, {
          public_id: 'house-rental/public/qr/test_qr',
          secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/house-rental/public/qr/test_qr.png',
          format: 'png',
          bytes: 100,
          resource_type: 'image',
        });
        return {} as any;
      });

      const res = await service.uploadPublicAsset(dummyFile, 'house-rental/public/qr', 'test_qr');
      expect(res.publicId).toBe('house-rental/public/qr/test_qr');
      expect(res.secureUrl).toContain('test_qr.png');
    });

    it('should upload a private/authenticated asset with type authenticated', async () => {
      const dummyFile: Express.Multer.File = {
        fieldname: 'citizenshipDoc',
        originalname: 'cit.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 200,
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35, 0, 0, 0, 0]),
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      (jest.spyOn(cloudinary.uploader, 'upload_stream') as any).mockImplementation((options: any, callback: any) => {
        expect(options.type).toBe('authenticated');
        expect(options.access_mode).toBe('authenticated');
        expect(options.folder).toBe('house-rental/private/citizenship');
        callback(null, {
          public_id: 'house-rental/private/citizenship/cit_1',
          secure_url: 'https://res.cloudinary.com/test-cloud/image/authenticated/v1/house-rental/private/citizenship/cit_1.pdf',
          format: 'pdf',
          bytes: 200,
          resource_type: 'image',
        });
        return {} as any;
      });

      const res = await service.uploadPrivateAsset(
        dummyFile,
        'house-rental/private/citizenship',
        'cit_1',
      );
      expect(res.publicId).toBe('house-rental/private/citizenship/cit_1');
    });

    it('should handle Cloudinary upload stream failure and throw InternalServerErrorException', async () => {
      const dummyFile: Express.Multer.File = {
        fieldname: 'photo',
        originalname: 'broken.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 50,
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]),
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      (jest.spyOn(cloudinary.uploader, 'upload_stream') as any).mockImplementation((options: any, callback: any) => {
        callback({ message: 'Cloudinary API connection error' }, null);
        return {} as any;
      });

      await expect(
        service.uploadPublicAsset(dummyFile, 'house-rental/test', 'broken'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('Asset Deletion & URL Signing', () => {
    it('should call cloudinary.uploader.destroy when deleting an asset', async () => {
      const destroySpy = jest
        .spyOn(cloudinary.uploader, 'destroy')
        .mockResolvedValue({ result: 'ok' });

      await service.deleteAsset('house-rental/proofs/p1');
      expect(destroySpy).toHaveBeenCalledWith('house-rental/proofs/p1', expect.anything());
    });

    it('should generate signed URL for authenticated assets', () => {
      const signedUrl = service.generateSignedUrl('house-rental/proofs/p1', 3600);
      expect(signedUrl).toContain('res.cloudinary.com');
      expect(signedUrl).toContain('authenticated');
    });

    it('should generate private download URL with signature', () => {
      const privUrl = service.generateSignedDownloadUrl('house-rental/private/citizenship/c1', 'pdf', 120);
      expect(privUrl).toContain('api.cloudinary.com');
      expect(privUrl).toContain('signature=');
    });
  });

  describe('File Validation & Security Safeguards', () => {
    it('should accept valid PNG buffer', () => {
      const file = {
        originalname: 'test.png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
        size: 12,
      } as Express.Multer.File;

      expect(() => validateUploadedFile(file, { allowPdf: false })).not.toThrow();
    });

    it('should accept valid JPEG buffer', () => {
      const file = {
        originalname: 'test.jpg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]),
        size: 12,
      } as Express.Multer.File;

      expect(() => validateUploadedFile(file, { allowPdf: false })).not.toThrow();
    });

    it('should accept valid PDF buffer when allowPdf is true', () => {
      const file = {
        originalname: 'doc.pdf',
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0, 0, 0, 0, 0, 0]),
        size: 12,
      } as Express.Multer.File;

      expect(() => validateUploadedFile(file, { allowPdf: true })).not.toThrow();
    });

    it('should reject PDF buffer when allowPdf is false', () => {
      const file = {
        originalname: 'doc.pdf',
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0, 0, 0, 0, 0, 0]),
        size: 12,
      } as Express.Multer.File;

      expect(() => validateUploadedFile(file, { allowPdf: false })).toThrow(
        BadRequestException,
      );
    });

    it('should reject file exceeding 10MB size limit', () => {
      const file = {
        originalname: 'big.jpg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        size: 10 * 1024 * 1024 + 1, // 10MB + 1 byte
      } as Express.Multer.File;

      expect(() => validateUploadedFile(file, { allowPdf: false })).toThrow(
        'File size exceeds the 10MB limit.',
      );
    });

    it('should reject spoofed file with wrong magic bytes', () => {
      const file = {
        originalname: 'spoof.jpg',
        buffer: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0, 0, 0, 0, 0, 0]),
        size: 12,
      } as Express.Multer.File;

      expect(() => validateUploadedFile(file, { allowPdf: false })).toThrow(
        BadRequestException,
      );
    });

    it('should reject dangerous file extension like .exe or .sh', () => {
      const file = {
        originalname: 'malware.exe',
        buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
        size: 4,
      } as Express.Multer.File;

      expect(() => validateUploadedFile(file, { allowPdf: true })).toThrow(
        BadRequestException,
      );
    });
  });
});
