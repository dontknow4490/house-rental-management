import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { Readable } from 'stream';

export interface CloudinaryUploadResult {
  publicId: string;
  secureUrl: string;
  format: string;
  bytes: number;
  resourceType: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private isCloudinaryConfigured = false;

  constructor(private configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isCloudinaryConfigured = true;
      this.logger.log('Cloudinary SDK initialized successfully.');
    } else {
      this.logger.warn(
        'Cloudinary credentials not detected in environment. Uploads to Cloudinary will require valid configuration.',
      );
    }
  }

  isConfigured(): boolean {
    return this.isCloudinaryConfigured;
  }

  /**
   * Uploads a public operational asset (e.g. eSewa payment QR code)
   */
  async uploadPublicAsset(
    file: Express.Multer.File,
    folder: string,
    filename?: string,
  ): Promise<CloudinaryUploadResult> {
    this.ensureConfigured();
    return this.uploadStream(file, {
      folder,
      public_id: filename,
      resource_type: 'auto',
      type: 'upload',
      access_mode: 'public',
      overwrite: true,
    });
  }

  /**
   * Uploads an authenticated/private asset (e.g. Citizenship documents, payment proofs, maintenance photos).
   * Asset is protected on Cloudinary CDN and rejects direct unauthenticated access.
   */
  async uploadPrivateAsset(
    file: Express.Multer.File,
    folder: string,
    filename?: string,
  ): Promise<CloudinaryUploadResult> {
    this.ensureConfigured();
    return this.uploadStream(file, {
      folder,
      public_id: filename,
      resource_type: 'auto',
      type: 'authenticated',
      access_mode: 'authenticated',
      overwrite: true,
    });
  }

  /**
   * Deletes an asset from Cloudinary.
   * Tries public 'upload' type first, and falls back to 'authenticated' type.
   */
  async deleteAsset(
    publicId: string,
    resourceType: 'image' | 'raw' | 'video' = 'image',
    type?: 'upload' | 'authenticated',
  ): Promise<any> {
    if (!this.isCloudinaryConfigured || !publicId) {
      return null;
    }
    try {
      if (type) {
        return await cloudinary.uploader.destroy(publicId, {
          resource_type: resourceType,
          type: type,
          invalidate: true,
        });
      }

      const res = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        type: 'upload',
        invalidate: true,
      });
      if (res && (res.result === 'not found' || res.result === 'notFound')) {
        return await cloudinary.uploader.destroy(publicId, {
          resource_type: resourceType,
          type: 'authenticated',
          invalidate: true,
        });
      }
      return res;
    } catch (err: any) {
      this.logger.error(`Failed to delete Cloudinary asset ${publicId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Generates a signed CDN delivery URL for authenticated assets
   */
  generateSignedUrl(
    publicId: string,
    expiresInSeconds: number = 3600,
    format?: string,
  ): string {
    this.ensureConfigured();
    return cloudinary.url(format ? `${publicId}.${format}` : publicId, {
      type: 'authenticated',
      sign_url: true,
      secure: true,
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });
  }

  /**
   * Generates a signed download API URL for private downloads (e.g. streaming citizenship docs)
   */
  generateSignedDownloadUrl(
    publicId: string,
    format: string = 'jpg',
    expiresInSeconds: number = 120,
  ): string {
    this.ensureConfigured();
    return cloudinary.utils.private_download_url(publicId, format, {
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });
  }

  /**
   * Extracts the public ID from a Cloudinary URL or reference
   */
  extractPublicId(urlOrId?: string | null): string {
    if (!urlOrId) return '';
    if (!urlOrId.includes('cloudinary.com')) return urlOrId;
    const parts = urlOrId.split('/');
    const uploadIndex = parts.findIndex((p) => p === 'upload' || p === 'authenticated');
    if (uploadIndex === -1) return '';
    const pathParts = parts.slice(uploadIndex + 1);
    while (
      pathParts[0] &&
      (pathParts[0].startsWith('s--') ||
        (pathParts[0].startsWith('v') && !isNaN(Number(pathParts[0].slice(1)))))
    ) {
      pathParts.shift();
    }
    const lastPart = pathParts.join('/');
    return lastPart.replace(/\.[^/.]+$/, '');
  }

  /**
   * Lists actual Cloudinary resources under the application prefix 'house-rental/'
   */
  async listAllCloudinaryResources(prefix: string = 'house-rental/'): Promise<any[]> {
    if (!this.isCloudinaryConfigured) return [];
    try {
      const publicAssets = await cloudinary.api.resources({
        type: 'upload',
        prefix,
        max_results: 500,
      });

      const privateAssets = await cloudinary.api.resources({
        type: 'authenticated',
        prefix,
        max_results: 500,
      });

      const allResources = [
        ...(publicAssets.resources || []).map((r: any) => ({ ...r, accessType: 'public' })),
        ...(privateAssets.resources || []).map((r: any) => ({ ...r, accessType: 'private' })),
      ];

      return allResources;
    } catch (err: any) {
      this.logger.error(`Failed to fetch Cloudinary resources: ${err.message}`);
      return [];
    }
  }

  private ensureConfigured() {
    if (!this.isCloudinaryConfigured) {
      throw new InternalServerErrorException(
        'Cloudinary storage is not configured. Ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables are set.',
      );
    }
  }

  private uploadStream(
    file: Express.Multer.File,
    options: any,
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      if (!file.buffer) {
        return reject(new BadRequestException('Uploaded file buffer is missing'));
      }

      const stream = cloudinary.uploader.upload_stream(
        options,
        (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
          if (error || !result) {
            this.logger.error(
              `Cloudinary stream upload failed: ${error?.message || 'Unknown error'}`,
            );
            return reject(
              new InternalServerErrorException(
                `Failed to upload file to cloud storage: ${error?.message || 'Storage error'}`,
              ),
            );
          }
          resolve({
            publicId: result.public_id,
            secureUrl: result.secure_url,
            format: result.format,
            bytes: result.bytes,
            resourceType: result.resource_type,
          });
        },
      );

      Readable.from(file.buffer).pipe(stream);
    });
  }
}
