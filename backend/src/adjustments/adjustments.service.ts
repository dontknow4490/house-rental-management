import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AdjustmentType } from '@prisma/client';
import { BillingService } from '../billing/billing.service';

export interface CreateAdjustmentDto {
  tenantId: string;
  roomId: string;
  yearBS: number;
  monthBS: number;
  type: AdjustmentType;
  amount: number;
  reason: string;
}

@Injectable()
export class AdjustmentsService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    @Inject(forwardRef(() => BillingService))
    private billingService: BillingService,
  ) {}

  async createAdjustment(dto: CreateAdjustmentDto, adminId: string, ipAddress?: string) {
    const adjustment = await this.prisma.adjustment.create({
      data: {
        tenantId: dto.tenantId,
        roomId: dto.roomId,
        yearBS: Number(dto.yearBS),
        monthBS: Number(dto.monthBS),
        type: dto.type,
        amount: Number(dto.amount),
        reason: dto.reason.trim(),
      },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'ADJUSTMENT_CREATED',
      details: {
        adjustmentId: adjustment.id,
        tenantId: dto.tenantId,
        type: dto.type,
        amount: dto.amount,
        reason: dto.reason,
      },
      ipAddress,
    });

    // Automatically recalculate bill for this room & month so adjustments take effect immediately
    try {
      await this.billingService.generateMonthlyBills(
        { yearBS: Number(dto.yearBS), monthBS: Number(dto.monthBS), roomId: dto.roomId },
        adminId,
        ipAddress,
      );
    } catch {}

    return adjustment;
  }

  async getAdjustments(roomId?: string, yearBS?: number, monthBS?: number, tenantId?: string) {
    const where: any = {};
    if (roomId) where.roomId = roomId;
    if (yearBS) where.yearBS = Number(yearBS);
    if (monthBS) where.monthBS = Number(monthBS);
    if (tenantId) where.tenantId = tenantId;

    return this.prisma.adjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        room: { select: { roomNumber: true, name: true } },
      },
    });
  }

  async deleteAdjustment(id: string, adminId: string, ipAddress?: string) {
    const adj = await this.prisma.adjustment.findUnique({ where: { id } });
    if (!adj) throw new NotFoundException('Adjustment record not found');

    await this.prisma.adjustment.delete({ where: { id } });

    await this.auditLogService.log({
      userId: adminId,
      action: 'ADJUSTMENT_DELETED',
      details: { adjustmentId: id, amount: adj.amount, reason: adj.reason },
      ipAddress,
    });

    // Automatically recalculate bill for this room & month after removing adjustment
    try {
      await this.billingService.generateMonthlyBills(
        { yearBS: adj.yearBS, monthBS: adj.monthBS, roomId: adj.roomId },
        adminId,
        ipAddress,
      );
    } catch {}

    return { message: 'Adjustment removed and bill recalculated.' };
  }
}
