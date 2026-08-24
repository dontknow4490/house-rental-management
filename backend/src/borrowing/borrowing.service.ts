import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BillingService } from '../billing/billing.service';

export interface CreateBorrowingDto {
  tenantId: string;
  amount: number;
  borrowDateBS?: string;
  reason?: string;
  includeInBill?: boolean;
}

export interface RepayBorrowingDto {
  repayAmount: number;
  repaidDateBS?: string;
}

@Injectable()
export class BorrowingService {
  constructor(
    private prisma: PrismaService,
    private nepaliCalendarService: NepaliCalendarService,
    private auditLogService: AuditLogService,
    private billingService: BillingService,
  ) {}

  private getBorrowingPeriod(borrowDateBS: string) {
    const parsed = this.nepaliCalendarService.parseBsDate(borrowDateBS);
    if (parsed?.yearBS && parsed?.monthBS) {
      return { yearBS: parsed.yearBS, monthBS: parsed.monthBS };
    }
    const today = this.nepaliCalendarService.getCurrentNepaliDate();
    return { yearBS: today.yearBS, monthBS: today.monthBS };
  }

  async createBorrowing(dto: CreateBorrowingDto, adminId: string, ipAddress?: string) {
    const tenant = await this.prisma.user.findUnique({
      where: { id: dto.tenantId },
      include: { tenantProfile: { include: { room: true } } },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');

    const amt = Number(dto.amount);
    if (amt <= 0) throw new BadRequestException('Amount must be greater than zero');

    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
    const borrowDateBS = dto.borrowDateBS || todayBS.nepaliFormatted;

    const borrowing = await this.prisma.borrowing.create({
      data: {
        tenantId: dto.tenantId,
        amount: amt,
        outstandingAmount: amt,
        borrowDateBS,
        borrowDateAD: new Date(),
        reason: dto.reason?.trim() || null,
        status: 'OUTSTANDING',
        includeInBill: dto.includeInBill !== undefined ? dto.includeInBill : true,
      },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'BORROWING_CREATED',
      details: {
        borrowingId: borrowing.id,
        tenantId: dto.tenantId,
        tenantName: tenant.fullName,
        amount: amt,
        reason: dto.reason,
      },
      ipAddress,
    });

    // Automatically recalculate and update the tenant's monthly bill
    if (tenant.tenantProfile?.roomId) {
      const period = this.getBorrowingPeriod(borrowDateBS);
      try {
        await this.billingService.generateMonthlyBills(
          {
            yearBS: period.yearBS,
            monthBS: period.monthBS,
            roomId: tenant.tenantProfile.roomId,
          },
          adminId,
          ipAddress,
        );
      } catch (e) {
        // Continue if room is not yet billed
      }
    }

    return borrowing;
  }

  async getAllBorrowings(tenantId?: string) {
    const where = tenantId ? { tenantId } : {};
    const borrowings = await this.prisma.borrowing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: {
          select: {
            id: true,
            fullName: true,
            username: true,
            tenantProfile: {
              select: {
                roomId: true,
                room: { select: { id: true, roomNumber: true, name: true } },
              },
            },
          },
        },
      },
    });

    return borrowings.map((b: any) => {
      const roomObj = b.tenant?.tenantProfile?.room || null;
      return {
        ...b,
        room: roomObj,
        roomNumber: roomObj?.roomNumber || null,
      };
    });
  }

  async recordRepayment(id: string, dto: RepayBorrowingDto, adminId: string, ipAddress?: string) {
    const borrowing = await this.prisma.borrowing.findUnique({
      where: { id },
      include: {
        tenant: {
          include: { tenantProfile: true },
        },
      },
    });
    if (!borrowing) throw new NotFoundException('Borrowing record not found');

    const repayAmt = Number(dto.repayAmount);
    if (repayAmt <= 0) throw new BadRequestException('Repayment amount must be greater than zero');
    if (repayAmt > borrowing.outstandingAmount) {
      throw new BadRequestException(
        `Repayment amount (${repayAmt}) cannot exceed outstanding balance (${borrowing.outstandingAmount})`,
      );
    }

    const newOutstanding = Number((borrowing.outstandingAmount - repayAmt).toFixed(2));
    const newStatus = newOutstanding === 0 ? 'PAID' : 'PARTIALLY_PAID';

    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
    const repaidDateBS = dto.repaidDateBS || todayBS.nepaliFormatted;

    const updated = await this.prisma.borrowing.update({
      where: { id },
      data: {
        outstandingAmount: newOutstanding,
        status: newStatus,
        repaidDateBS: newStatus === 'PAID' ? repaidDateBS : borrowing.repaidDateBS,
        repaidDateAD: newStatus === 'PAID' ? new Date() : borrowing.repaidDateAD,
      },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'BORROWING_REPAYMENT_RECORDED',
      details: {
        borrowingId: id,
        tenantId: borrowing.tenantId,
        repayAmount: repayAmt,
        remainingOutstanding: newOutstanding,
        status: newStatus,
      },
      ipAddress,
    });

    // Recalculate and update the tenant's monthly bill after repayment
    let roomId = borrowing.tenant?.tenantProfile?.roomId;
    if (!roomId) {
      const profile = await this.prisma.tenantProfile.findFirst({
        where: { userId: borrowing.tenantId, status: 'ACTIVE' },
      });
      roomId = profile?.roomId;
    }

    if (roomId) {
      const period = this.getBorrowingPeriod(borrowing.borrowDateBS);
      try {
        await this.billingService.generateMonthlyBills(
          {
            yearBS: period.yearBS,
            monthBS: period.monthBS,
            roomId,
          },
          adminId,
          ipAddress,
        );
      } catch (e) {
        console.error('[BorrowingService.recordRepayment generateMonthlyBills error]:', e);
      }
    }

    return updated;
  }

  async toggleIncludeInBill(id: string, includeInBill: boolean, adminId: string, ipAddress?: string) {
    const borrowing = await this.prisma.borrowing.findUnique({
      where: { id },
      include: {
        tenant: {
          include: { tenantProfile: true },
        },
      },
    });
    if (!borrowing) throw new NotFoundException('Borrowing record not found');

    const updated = await this.prisma.borrowing.update({
      where: { id },
      data: { includeInBill },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'BORROWING_BILL_FLAG_UPDATED',
      details: { borrowingId: id, includeInBill },
      ipAddress,
    });

    // Recalculate and update the tenant's monthly bill after toggle
    let roomId = borrowing.tenant?.tenantProfile?.roomId;
    if (!roomId) {
      const profile = await this.prisma.tenantProfile.findFirst({
        where: { userId: borrowing.tenantId, status: 'ACTIVE' },
      });
      roomId = profile?.roomId;
    }

    if (roomId) {
      const period = this.getBorrowingPeriod(borrowing.borrowDateBS);
      try {
        await this.billingService.generateMonthlyBills(
          {
            yearBS: period.yearBS,
            monthBS: period.monthBS,
            roomId,
          },
          adminId,
          ipAddress,
        );
      } catch (e) {
        console.error('[BorrowingService.toggleIncludeInBill generateMonthlyBills error]:', e);
      }
    }

    return updated;
  }
}
