import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Ip,
  ForbiddenException,
} from '@nestjs/common';
import {
  TenantsService,
  CreateTenantDto,
  UpdateTenantDto,
} from './tenants.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Get()
  @Roles(Role.ADMIN)
  async getAllTenants() {
    return this.tenantsService.getAllTenants();
  }

  @Get(':id')
  async getTenantById(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    // Tenant Data Isolation: A tenant can only request their own ID
    if (currentUser.role === Role.TENANT && currentUser.id !== id) {
      throw new ForbiddenException('Access denied: You can only view your own tenant profile');
    }
    return this.tenantsService.getTenantById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  async createTenant(
    @Body() dto: CreateTenantDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.tenantsService.createTenant(dto, adminId, ipAddress);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  async updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.tenantsService.updateTenant(id, dto, adminId, ipAddress);
  }

  @Put(':id/move-room')
  @Roles(Role.ADMIN)
  async moveRoom(
    @Param('id') id: string,
    @Body('newRoomId') newRoomId: string,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.tenantsService.moveTenantRoom(id, newRoomId, adminId, ipAddress);
  }

  @Put(':id/reset-password')
  @Roles(Role.ADMIN)
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { password?: string; newPassword?: string },
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    const finalPassword = body?.newPassword || body?.password || 'Password@123';
    return this.tenantsService.resetPassword(id, finalPassword, adminId, ipAddress);
  }

  @Put(':id/toggle-status')
  @Roles(Role.ADMIN)
  async toggleStatus(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.tenantsService.toggleStatus(id, adminId, ipAddress);
  }

  @Put(':id/move-out')
  @Roles(Role.ADMIN)
  async moveOut(
    @Param('id') id: string,
    @Body('moveOutDateBS') moveOutDateBS: string,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.tenantsService.moveOutTenant(id, moveOutDateBS, adminId, ipAddress);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async deleteTenant(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.tenantsService.deleteOrArchiveTenant(id, adminId, ipAddress);
  }
}
