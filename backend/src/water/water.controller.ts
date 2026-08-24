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
import { WaterService, AddWaterPurchaseDto } from './water.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Controller('water')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WaterController {
  constructor(
    private waterService: WaterService,
    private prisma: PrismaService,
  ) {}

  @Get()
  async getPurchases(
    @Query('roomId') roomId?: string,
    @Query('yearBS') yearBS?: string,
    @Query('monthBS') monthBS?: string,
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
        throw new ForbiddenException('Access denied: You can only view water purchases for your own room');
      }

      return this.waterService.getPurchases(
        tenantProfile.roomId,
        yearBS ? parseInt(yearBS, 10) : undefined,
        monthBS ? parseInt(monthBS, 10) : undefined,
      );
    }

    return this.waterService.getPurchases(
      roomId,
      yearBS ? parseInt(yearBS, 10) : undefined,
      monthBS ? parseInt(monthBS, 10) : undefined,
    );
  }

  @Post()
  @Roles(Role.ADMIN)
  async addPurchase(
    @Body() dto: AddWaterPurchaseDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.waterService.addPurchase(dto, adminId, ipAddress);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async deletePurchase(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.waterService.deletePurchase(id, adminId, ipAddress);
  }
}
