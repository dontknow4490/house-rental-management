import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  NotFoundException,
  Ip,
  Res,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { Response } from 'express';
import { getUploadSubdir, getUploadsRoot } from '../common/utils/upload-path.util';

const citizenshipStorage = diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = getUploadSubdir('private/citizenship');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `citizenship_${req.params.tenantId}_${Date.now()}${ext}`);
  },
});

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN) // STRICTLY ADMIN ONLY
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post('citizenship/:tenantId')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: citizenshipStorage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|pdf)$/)) {
          return cb(new BadRequestException('Only images and PDF files are allowed!'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadCitizenship(
    @Param('tenantId') tenantId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('citizenshipNumber') citizenshipNumber: string,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    const file = files && files.length > 0 ? files[0] : undefined;
    if (!file && !citizenshipNumber) {
      throw new BadRequestException('Please provide a citizenship number or select a document to upload');
    }
    const relativePath = file ? `/uploads/private/citizenship/${file.filename}` : undefined;
    return this.documentsService.saveCitizenshipDoc(
      tenantId,
      relativePath,
      citizenshipNumber,
      adminId,
      ipAddress,
    );
  }

  @Get('citizenship/:tenantId/view')
  async viewCitizenship(
    @Param('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    const doc = await this.documentsService.getCitizenshipDoc(tenantId);
    const sanitizedRelPath = doc.citizenshipDocPath.replace(/^\/?uploads\//, '');
    const absolutePath = join(getUploadsRoot(), sanitizedRelPath);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('File not found on disk');
    }
    return res.sendFile(absolutePath);
  }
}
