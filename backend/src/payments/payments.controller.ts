import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Ip,
  ForbiddenException,
  Res,
} from '@nestjs/common';
import {
  PaymentsService,
  SubmitPaymentDto,
  VerifyPaymentDto,
  RecordCashPaymentDto,
} from './payments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { Response } from 'express';
import { getUploadSubdir } from '../common/utils/upload-path.util';

import { validateUploadedFile, sanitizeFileExtension } from '../common/utils/file-upload.util';

const proofStorage = diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = getUploadSubdir('proofs');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = sanitizeFileExtension(file.originalname, true);
    cb(null, `payment_proof_${Date.now()}${ext}`);
  },
});

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get()
  async getPayments(
    @Query('status') status: string,
    @Query('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role === Role.TENANT) {
      // Tenant Data Isolation: can only see their own payments
      return this.paymentsService.getPayments(status, user.id);
    }
    return this.paymentsService.getPayments(status, tenantId);
  }

  @Post('submit')
  @UseInterceptors(
    FileInterceptor('proofImage', {
      storage: proofStorage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|pdf)$/)) {
          return cb(new BadRequestException('Only JPG, JPEG, PNG, WEBP, and PDF files are allowed!'), false);
        }
        cb(null, true);
      },
    }),
  )
  async submitPayment(
    @Body() dto: SubmitPaymentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') tenantId: string,
    @Ip() ipAddress: string,
  ) {
    if (file) {
      validateUploadedFile(file, { allowPdf: true });
    }
    if (!file && !dto.proofImagePath) {
      throw new BadRequestException('Payment proof screenshot is required.');
    }
    const proofPath = file ? `/uploads/proofs/${file.filename}` : dto.proofImagePath;
    return this.paymentsService.submitPayment(dto, tenantId, proofPath, ipAddress);
  }

  @Post('cash-payment')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async recordCashPayment(
    @Body() dto: RecordCashPaymentDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.paymentsService.recordCashPayment(dto, adminId, ipAddress);
  }

  @Put(':id/verify')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async verifyPayment(
    @Param('id') paymentId: string,
    @Body() dto: VerifyPaymentDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.paymentsService.verifyPayment(paymentId, dto, adminId, ipAddress);
  }

  @Get('receipt/:receiptNumber')
  async getReceipt(
    @Param('receiptNumber') receiptNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const receipt = await this.paymentsService.getReceiptById(receiptNumber);
    if (user.role === Role.TENANT && receipt.payment.tenantId !== user.id) {
      throw new ForbiddenException('Access denied: You cannot view another tenant’s receipt');
    }
    return receipt;
  }
}
