import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Ip,
  ForbiddenException,
} from '@nestjs/common';
import { CustomPurchasesService } from './custom-purchases.service';
import { CreateCustomPurchaseDto, UpdateCustomPurchaseDto, CreateBatchCustomPurchasesDto } from './custom-purchases.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Controller('custom-purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomPurchasesController {
  constructor(
    private customPurchasesService: CustomPurchasesService,
    private prisma: PrismaService,
  ) {}

  @Get()
  async getPurchases(
    @Query('roomId') roomId?: string,
    @Query('yearBS') yearBS?: string,
    @Query('monthBS') monthBS?: string,
    @Query('tenantId') tenantId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (user?.role === Role.TENANT) {
      const tenantProfile = await this.prisma.tenantProfile.findUnique({
        where: { userId: user.id },
      });

      if (!tenantProfile) {
        return [];
      }

      if (roomId && roomId !== tenantProfile.roomId) {
        throw new ForbiddenException('Access denied: You can only view custom purchases for your own room');
      }

      if (tenantId && tenantId !== user.id) {
        throw new ForbiddenException('Access denied: You can only view custom purchases for your own account');
      }

      return this.customPurchasesService.getPurchases(
        tenantProfile.roomId,
        yearBS ? parseInt(yearBS, 10) : undefined,
        monthBS ? parseInt(monthBS, 10) : undefined,
        user.id,
      );
    }

    return this.customPurchasesService.getPurchases(
      roomId,
      yearBS ? parseInt(yearBS, 10) : undefined,
      monthBS ? parseInt(monthBS, 10) : undefined,
      tenantId,
    );
  }

  @Post('batch')
  @Roles(Role.ADMIN)
  async addBatchPurchases(
    @Body() dto: CreateBatchCustomPurchasesDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.customPurchasesService.addBatchPurchases(dto, adminId, ipAddress);
  }

  @Post()
  @Roles(Role.ADMIN)
  async addPurchase(
    @Body() dto: CreateCustomPurchaseDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.customPurchasesService.addPurchase(dto, adminId, ipAddress);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  async updatePurchase(
    @Param('id') id: string,
    @Body() dto: UpdateCustomPurchaseDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.customPurchasesService.updatePurchase(id, dto, adminId, ipAddress);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async deletePurchase(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.customPurchasesService.deletePurchase(id, adminId, ipAddress);
  }
}
