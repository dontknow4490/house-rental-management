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
import { memoryStorage } from 'multer';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { validateUploadedFile } from '../common/utils/file-upload.util';

@Controller('maintenance')
@UseGuards(JwtAuthGuard)
export class MaintenanceController {
  constructor(
    private maintenanceService: MaintenanceService,
    private cloudinaryService: CloudinaryService,
  ) {}

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
      storage: memoryStorage(),
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

    let photoPath = undefined;
    let uploadedPublicId: string | null = null;

    if (file) {
      const filename = `maintenance_${Date.now()}`;
      const uploadResult = await this.cloudinaryService.uploadPrivateAsset(
        file,
        'house-rental/maintenance',
        filename,
      );
      photoPath = uploadResult.secureUrl;
      uploadedPublicId = uploadResult.publicId;
    }

    try {
      return await this.maintenanceService.createRequest(dto, tenantId, photoPath, ipAddress);
    } catch (err) {
      if (uploadedPublicId) {
        await this.cloudinaryService.deleteAsset(uploadedPublicId, 'image', 'authenticated');
      }
      throw err;
    }
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
