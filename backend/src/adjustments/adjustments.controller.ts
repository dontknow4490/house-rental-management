import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Ip,
  ForbiddenException,
} from '@nestjs/common';
import { AdjustmentsService, CreateAdjustmentDto } from './adjustments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Controller('adjustments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdjustmentsController {
  constructor(
    private adjustmentsService: AdjustmentsService,
    private prisma: PrismaService,
  ) {}

  @Get()
  async getAdjustments(
    @Query('roomId') roomId?: string,
    @Query('yearBS') yearBS?: string,
    @Query('monthBS') monthBS?: string,
    @Query('tenantId') tenantId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (user?.role === Role.TENANT) {
      if (tenantId && tenantId !== user.id) {
        throw new ForbiddenException('Access denied: You can only view adjustments for your own account');
      }

      const tenantProfile = await this.prisma.tenantProfile.findUnique({
        where: { userId: user.id },
      });

      if (roomId && tenantProfile && roomId !== tenantProfile.roomId) {
        throw new ForbiddenException('Access denied: You can only view adjustments for your own room');
      }

      return this.adjustmentsService.getAdjustments(
        tenantProfile?.roomId,
        yearBS ? parseInt(yearBS, 10) : undefined,
        monthBS ? parseInt(monthBS, 10) : undefined,
        user.id,
      );
    }

    return this.adjustmentsService.getAdjustments(
      roomId,
      yearBS ? parseInt(yearBS, 10) : undefined,
      monthBS ? parseInt(monthBS, 10) : undefined,
      tenantId,
    );
  }

  @Post()
  @Roles(Role.ADMIN)
  async createAdjustment(
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.adjustmentsService.createAdjustment(dto, adminId, ipAddress);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async deleteAdjustment(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.adjustmentsService.deleteAdjustment(id, adminId, ipAddress);
  }
}
