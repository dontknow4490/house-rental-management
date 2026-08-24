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
  BadRequestException,
  Ip,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { getUploadSubdir } from '../common/utils/upload-path.util';

import { validateUploadedFile, sanitizeFileExtension } from '../common/utils/file-upload.util';

const qrStorage = diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = getUploadSubdir('qr');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = sanitizeFileExtension(file.originalname, false);
    cb(null, `esewa_qr_${Date.now()}${ext}`);
  },
});

@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

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
    FileInterceptor('qrImage', {
      storage: qrStorage,
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
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    validateUploadedFile(file, { allowPdf: false });
    const relativePath = `/uploads/qr/${file.filename}`;
    await this.settingsService.updateSettings(
      { ESEWA_QR_IMAGE: relativePath },
      adminId,
      ipAddress,
    );
    return {
      message: 'eSewa QR code uploaded successfully',
      qrPath: relativePath,
    };
  }

  @Delete('qr')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async removeQr(
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.settingsService.removeEsewaQr(adminId, ipAddress);
  }
}
