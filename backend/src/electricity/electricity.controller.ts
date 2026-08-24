import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Ip,
  ForbiddenException,
} from '@nestjs/common';
import { ElectricityService, EnterMeterReadingDto } from './electricity.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Controller('electricity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ElectricityController {
  constructor(
    private electricityService: ElectricityService,
    private prisma: PrismaService,
  ) {}

  @Get('dashboard')
  @Roles(Role.ADMIN)
  async getDashboardStatus(
    @Query('yearBS') yearBS?: string,
    @Query('monthBS') monthBS?: string,
  ) {
    return this.electricityService.getDashboardStatus(
      yearBS ? parseInt(yearBS, 10) : undefined,
      monthBS ? parseInt(monthBS, 10) : undefined,
    );
  }

  @Get('all-readings')
  @Roles(Role.ADMIN)
  async getAllReadings() {
    return this.electricityService.getAllReadings();
  }

  @Get('history/:roomId')
  async getRoomHistory(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role === Role.TENANT) {
      const tenantProfile = await this.prisma.tenantProfile.findUnique({
        where: { userId: user.id },
      });
      if (!tenantProfile || tenantProfile.roomId !== roomId) {
        throw new ForbiddenException('Access denied: You can only view electricity history for your own room');
      }
    }
    return this.electricityService.getRoomHistory(roomId);
  }

  @Post('reading')
  @Roles(Role.ADMIN)
  async enterReading(
    @Body() dto: EnterMeterReadingDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.electricityService.enterReading(
      {
        roomId: dto.roomId,
        yearBS: Number(dto.yearBS),
        monthBS: Number(dto.monthBS),
        currentReading: Number(dto.currentReading),
        previousReading: dto.previousReading !== undefined ? Number(dto.previousReading) : undefined,
      },
      adminId,
      ipAddress,
    );
  }
}
