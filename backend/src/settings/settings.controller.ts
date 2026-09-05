import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  Ip,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { FileInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { validateUploadedFile } from '../common/utils/file-upload.util';

@Controller('settings')
export class SettingsController {
  constructor(
    private settingsService: SettingsService,
    private cloudinaryService: CloudinaryService,
  ) {}

  @Get('public-payment')
  async getPaymentSettings() {
    return this.settingsService.getPublicPaymentSettings();
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateSettings(
    @Body() settings: Record<string, string>,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.settingsService.updateSettings(settings, adminId, ipAddress);
  }

  @Post('upload-qr')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(new BadRequestException('Only JPG, JPEG, PNG, and WEBP image files are allowed!'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadEsewaQr(
    @UploadedFiles() files: Express.Multer.File[] | Express.Multer.File,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    const file = Array.isArray(files) ? (files.length > 0 ? files[0] : undefined) : files;
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    validateUploadedFile(file, { allowPdf: false });

    // 1. Get existing QR value to clean up after successful update
    const oldQr = await this.settingsService.getSetting('ESEWA_QR_IMAGE');

    // 2. Upload to Cloudinary public folder
    const filename = `esewa_qr_${Date.now()}`;
    const uploadResult = await this.cloudinaryService.uploadPublicAsset(
      file,
      'house-rental/public/qr',
      filename,
    );

    // 3. Update database only after upload succeeds
    try {
      await this.settingsService.updateSettings(
        {
          ESEWA_QR_IMAGE: uploadResult.secureUrl,
        },
        adminId,
        ipAddress,
      );
    } catch (dbErr) {
      // Clean up the newly uploaded asset if database update fails
      await this.cloudinaryService.deleteAsset(uploadResult.publicId, 'image', 'upload');
      throw dbErr;
    }

    // 4. Delete old Cloudinary asset if previously stored on Cloudinary
    if (oldQr && oldQr.includes('cloudinary.com')) {
      const oldPublicId = this.cloudinaryService.extractPublicId(oldQr);
      if (oldPublicId) {
        await this.cloudinaryService.deleteAsset(oldPublicId, 'image', 'upload');
      }
    }

    return {
      message: 'eSewa QR code uploaded successfully',
      qrPath: uploadResult.secureUrl,
      url: uploadResult.secureUrl,
      payment_qr_path: uploadResult.secureUrl,
    };
  }

  @Post('qr-code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(new BadRequestException('Only JPG, JPEG, PNG, and WEBP image files are allowed!'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadEsewaQrAlias(
    @UploadedFiles() files: Express.Multer.File[] | Express.Multer.File,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.uploadEsewaQr(files, adminId, ipAddress);
  }

  @Delete('qr')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async removeQr(
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    const currentQr = await this.settingsService.getSetting('ESEWA_QR_IMAGE');
    if (currentQr && currentQr.includes('cloudinary.com')) {
      const publicId = this.cloudinaryService.extractPublicId(currentQr);
      if (publicId) {
        await this.cloudinaryService.deleteAsset(publicId, 'image', 'upload');
      }
    }
    return this.settingsService.removeEsewaQr(adminId, ipAddress);
  }
}
