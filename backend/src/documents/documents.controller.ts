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
  InternalServerErrorException,
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
import { memoryStorage } from 'multer';
import { extname, join, resolve } from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { Response } from 'express';
import { getUploadsRoot } from '../common/utils/upload-path.util';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { validateUploadedFile } from '../common/utils/file-upload.util';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN) // STRICTLY ADMIN ONLY
export class DocumentsController {
  constructor(
    private documentsService: DocumentsService,
    private cloudinaryService: CloudinaryService,
  ) {}

  @Post('citizenship/:tenantId')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|pdf)$/)) {
          return cb(new BadRequestException('Only images (JPG, PNG, WEBP) and PDF files are allowed!'), false);
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
    if (file) {
      validateUploadedFile(file, { allowPdf: true });
    }
    if (!file && !citizenshipNumber) {
      throw new BadRequestException('Please provide a citizenship number or select a document to upload');
    }

    let filePath: string | undefined = undefined;
    let uploadedPublicId: string | null = null;

    if (file) {
      const filename = `citizenship_${tenantId}_${Date.now()}`;
      const uploadResult = await this.cloudinaryService.uploadPrivateAsset(
        file,
        'house-rental/private/citizenship',
        filename,
      );
      filePath = uploadResult.secureUrl;
      uploadedPublicId = uploadResult.publicId;
    }

    // Check if a previous document exists to clean up after successful update
    let oldDocPath: string | null = null;
    try {
      const existing = await this.documentsService.getCitizenshipDoc(tenantId);
      oldDocPath = existing?.citizenshipDocPath || null;
    } catch {}

    try {
      const updated = await this.documentsService.saveCitizenshipDoc(
        tenantId,
        filePath,
        citizenshipNumber,
        adminId,
        ipAddress,
      );

      // Clean up previous Cloudinary asset if replaced
      if (filePath && oldDocPath && oldDocPath.includes('cloudinary.com')) {
        const oldPublicId = this.cloudinaryService.extractPublicId(oldDocPath);
        if (oldPublicId) {
          await this.cloudinaryService.deleteAsset(oldPublicId, 'image', 'authenticated');
        }
      }

      return updated;
    } catch (dbErr) {
      // Rollback newly uploaded Cloudinary asset if database save fails
      if (uploadedPublicId) {
        await this.cloudinaryService.deleteAsset(uploadedPublicId, 'image', 'authenticated');
      }
      throw dbErr;
    }
  }

  @Get('citizenship/:tenantId/view')
  async viewCitizenship(
    @Param('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    const doc = await this.documentsService.getCitizenshipDoc(tenantId);
    const storedPath = doc.citizenshipDocPath;

    if (!storedPath) {
      throw new NotFoundException('Citizenship document not found for this tenant');
    }

    // 1. Cloudinary Authenticated Asset (streamed securely to admin, raw Cloudinary URL never exposed)
    if (storedPath.includes('cloudinary.com') || storedPath.startsWith('cloudinary:')) {
      const publicId = this.cloudinaryService.extractPublicId(storedPath);
      if (!publicId) {
        throw new NotFoundException('Invalid document reference');
      }

      const ext = extname(storedPath).replace('.', '').toLowerCase() || 'jpg';
      const signedUrl = this.cloudinaryService.generateSignedDownloadUrl(publicId, ext, 120);

      return new Promise<void>((resolvePromise, rejectPromise) => {
        https
          .get(signedUrl, (streamRes) => {
            if (streamRes.statusCode && streamRes.statusCode >= 400) {
              res.status(streamRes.statusCode).json({
                statusCode: streamRes.statusCode,
                message: 'Failed to retrieve document from secure storage',
              });
              return resolvePromise();
            }

            const contentType =
              streamRes.headers['content-type'] ||
              (ext === 'pdf' ? 'application/pdf' : 'image/jpeg');
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
            streamRes.pipe(res);
            streamRes.on('end', () => resolvePromise());
            streamRes.on('error', (err) => {
              rejectPromise(new InternalServerErrorException('Error streaming document'));
            });
          })
          .on('error', (err) => {
            rejectPromise(new InternalServerErrorException('Failed to connect to secure storage'));
          });
      });
    }

    // 2. Legacy Local Filesystem Fallback
    const sanitizedRelPath = storedPath.replace(/^\/?uploads\//, '');
    const absolutePath = join(getUploadsRoot(), sanitizedRelPath);
    const canonicalPath = resolve(absolutePath);

    if (!canonicalPath.startsWith(getUploadsRoot()) || !fs.existsSync(canonicalPath)) {
      throw new NotFoundException('File not found on disk or access denied');
    }
    return res.sendFile(canonicalPath);
  }
}
