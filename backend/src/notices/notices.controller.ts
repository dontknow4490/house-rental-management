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
} from '@nestjs/common';
import { NoticesService, CreateNoticeDto } from './notices.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('notices')
@UseGuards(JwtAuthGuard)
export class NoticesController {
  constructor(private noticesService: NoticesService) {}

  @Get('active')
  async getActiveNotices() {
    return this.noticesService.getActiveNotices();
  }

  @Get('all')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getAllNotices() {
    return this.noticesService.getAllNotices();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async createNotice(
    @Body() dto: CreateNoticeDto,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.noticesService.createNotice(dto, adminId, ipAddress);
  }

  @Put(':id/toggle')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async toggleStatus(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.noticesService.toggleNoticeStatus(id, adminId, ipAddress);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async deleteNotice(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.noticesService.deleteNotice(id, adminId, ipAddress);
  }
}
