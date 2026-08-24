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
import { BillingService, GenerateBillsDto } from './billing.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('summary')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getSummary(
    @Query('yearBS') yearBS?: string,
    @Query('monthBS') monthBS?: string,
  ) {
    return this.billingService.getAdminFinancialSummary(
      yearBS ? parseInt(yearBS, 10) : undefined,
      monthBS ? parseInt(monthBS, 10) : undefined,
    );
  }

  @Get('all')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getAllBills(
    @Query('yearBS') yearBS?: string,
    @Query('monthBS') monthBS?: string,
    @Query('status') status?: string,
    @Query('unpaidOnly') unpaidOnly?: string,
    @Query('tenantId') tenantId?: string,
    @Query('roomId') roomId?: string,
  ) {
    return this.billingService.getAllBills(
      yearBS ? parseInt(yearBS, 10) : undefined,
      monthBS ? parseInt(monthBS, 10) : undefined,
      status,
      unpaidOnly === 'true' || unpaidOnly === '1',
      tenantId,
      roomId,
    );
  }

  @Get('my-active')
  async getMyActiveBill(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getTenantActiveBill(user.id);
  }

  @Get('advance-summary')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getAdvanceSummary(@Query('tenantId') tenantId?: string) {
    return this.billingService.getAdvanceSummary(tenantId);
  }

  @Get('my-advance')
  async getMyAdvanceSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getTenantAdvanceSummary(user.id);
  }

  @Get('my-history')
  async getMyBillHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getTenantBillHistory(user.id);
  }

  @Get('breakdown-multi')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getMultiBillBreakdown(@Query('billIds') billIdsParam: string) {
    const billIds = billIdsParam
      ? billIdsParam.split(',').map((id) => id.trim()).filter((id) => id.length > 0)
      : [];
    return this.billingService.getMultiBillDetails(billIds);
  }

  @Get(':id')
  async getBillById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const bill = await this.billingService.getBillById(id);
    // Tenant Data Isolation
    if (user.role === Role.TENANT && bill.tenantId !== user.id) {
      throw new ForbiddenException('Access denied: You cannot view another tenant’s bill');
    }
    return bill;
  }

  @Post('generate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async generateBills(
    @Body() dto: GenerateBillsDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.billingService.generateMonthlyBills(dto, adminId, ipAddress);
  }

  @Put(':id/correct')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async correctBill(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.billingService.correctBill(id, dto, adminId, ipAddress);
  }
}
