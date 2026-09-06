import { Controller, Get, Delete, Query, Body, UseGuards, Req } from '@nestjs/common';
import { AuditLogService, AuditLogQueryDto, DeleteAuditLogsDto } from './audit-log.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogController {
  constructor(private auditLogService: AuditLogService) {}

  @Get()
  @Roles(Role.ADMIN)
  async getLogs(@Query() query: AuditLogQueryDto) {
    return this.auditLogService.getLogs(query);
  }

  @Delete()
  @Roles(Role.ADMIN)
  async deleteLogs(@Body() dto: DeleteAuditLogsDto, @Req() req: any) {
    const adminId = req.user.sub || req.user.id;
    const ipAddress = req.ip || req.connection?.remoteAddress;
    return this.auditLogService.deleteLogs(dto, adminId, ipAddress);
  }
}
