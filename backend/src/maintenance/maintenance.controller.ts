import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Ip,
} from '@nestjs/common';
import {
  MaintenanceService,
  CreateMaintenanceDto,
  UpdateMaintenanceStatusDto,
} from './maintenance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { getUploadSubdir } from '../common/utils/upload-path.util';

import { validateUploadedFile, sanitizeFileExtension } from '../common/utils/file-upload.util';

const maintenancePhotoStorage = diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = getUploadSubdir('maintenance');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = sanitizeFileExtension(file.originalname, false);
    cb(null, `maintenance_${Date.now()}${ext}`);
  },
});

@Controller('maintenance')
@UseGuards(JwtAuthGuard)
export class MaintenanceController {
  constructor(private maintenanceService: MaintenanceService) {}

  @Get()
  async getRequests(@CurrentUser() user: AuthenticatedUser) {
    if (user.role === Role.TENANT) {
      return this.maintenanceService.getRequests(user.id);
    }
    return this.maintenanceService.getRequests();
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: maintenancePhotoStorage,
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(new BadRequestException('Only image files (JPG, PNG, WEBP) are allowed!'), false);
        }
        cb(null, true);
      },
    }),
  )
  async createRequest(
    @Body() dto: CreateMaintenanceDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') tenantId: string,
    @Ip() ipAddress: string,
  ) {
    if (file) {
      validateUploadedFile(file, { allowPdf: false });
    }
    const photoPath = file ? `/uploads/maintenance/${file.filename}` : undefined;
    return this.maintenanceService.createRequest(dto, tenantId, photoPath, ipAddress);
  }

  @Put(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMaintenanceStatusDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.maintenanceService.updateStatus(id, dto, adminId, ipAddress);
  }
}
