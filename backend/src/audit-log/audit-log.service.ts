import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  async getLogs(limit = 100) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, username: true, fullName: true, role: true },
        },
      },
    });
  }
}
