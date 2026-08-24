import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  Ip,
  ForbiddenException,
} from '@nestjs/common';
import {
  BorrowingService,
  CreateBorrowingDto,
  RepayBorrowingDto,
} from './borrowing.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('borrowing')
@UseGuards(JwtAuthGuard)
export class BorrowingController {
  constructor(private borrowingService: BorrowingService) {}

  @Get()
  async getAllBorrowings(
    @Query('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role === Role.TENANT) {
      return this.borrowingService.getAllBorrowings(user.id);
    }
    return this.borrowingService.getAllBorrowings(tenantId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async createBorrowing(
    @Body() dto: CreateBorrowingDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.borrowingService.createBorrowing(dto, adminId, ipAddress);
  }

  @Put(':id/repay')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async recordRepayment(
    @Param('id') id: string,
    @Body() dto: RepayBorrowingDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.borrowingService.recordRepayment(id, dto, adminId, ipAddress);
  }

  @Put(':id/include-in-bill')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async toggleIncludeInBill(
    @Param('id') id: string,
    @Body('includeInBill') includeInBill: boolean,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.borrowingService.toggleIncludeInBill(id, includeInBill, adminId, ipAddress);
  }
}
