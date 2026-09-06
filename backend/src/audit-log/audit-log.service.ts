import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

export interface DeleteAuditLogsDto {
  olderThanDays?: number;
  action?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  deleteAllConfirmed?: boolean;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    userId?: string;
    username?: string;
    action: string;
    details?: any;
    ipAddress?: string;
  }) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          userId: params.userId,
          username: params.username,
          action: params.action,
          details: params.details ? JSON.stringify(params.details) : null,
          ipAddress: params.ipAddress,
        },
      });
    } catch (err) {
      console.error('AuditLog error:', err);
    }
  }

  async getLogs(query: AuditLogQueryDto = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.action) {
      where.action = query.action;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { action: { contains: s, mode: 'insensitive' } },
        { details: { contains: s, mode: 'insensitive' } },
        { username: { contains: s, mode: 'insensitive' } },
        { ipAddress: { contains: s, mode: 'insensitive' } },
        { user: { fullName: { contains: s, mode: 'insensitive' } } },
        { user: { username: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, username: true, fullName: true, role: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async deleteLogs(dto: DeleteAuditLogsDto, adminId: string, ipAddress?: string) {
    const where: any = {};

    if (dto.olderThanDays && dto.olderThanDays > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - dto.olderThanDays);
      where.createdAt = { lte: cutoff };
    } else if (dto.startDate || dto.endDate) {
      where.createdAt = {};
      if (dto.startDate) where.createdAt.gte = new Date(dto.startDate);
      if (dto.endDate) {
        const end = new Date(dto.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    } else if (dto.action) {
      where.action = dto.action;
    } else if (dto.userId) {
      where.userId = dto.userId;
    } else if (!dto.deleteAllConfirmed) {
      throw new BadRequestException(
        'Specific cleanup filter (olderThanDays, date range, action, or userId) or explicit confirmation required.',
      );
    }

    // Log the purge operation BEFORE deleting logs
    await this.log({
      userId: adminId,
      action: 'AUDIT_LOGS_PURGED',
      details: {
        filter: dto,
        purgedAt: new Date().toISOString(),
      },
      ipAddress,
    });

    const result = await this.prisma.auditLog.deleteMany({ where });

    return {
      success: true,
      count: result.count,
      message: `Successfully purged ${result.count} audit log entries.`,
    };
  }
}
