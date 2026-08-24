import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService, NEPALI_MONTH_NAMES } from '../nepali-calendar/nepali-calendar.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BillStatus } from '@prisma/client';

export interface GenerateBillsDto {
  yearBS: number;
  monthBS: number; // 1 - 12
  roomId?: string; // Optional: generate for single room
}

export interface CorrectBillDto {
  rentAmount?: number;
  internetAmount?: number;
  electricityAmount?: number;
  garbageAmount?: number;
  waterAmount?: number;
  borrowingAmount?: number;
  adjustmentsAmount?: number;
  correctionReason: string;
}

@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private nepaliCalendarService: NepaliCalendarService,
    private settingsService: SettingsService,
    private auditLogService: AuditLogService,
  ) {}

  /**
   * Calculate and generate or recalculate monthly bills for rooms
   */
  async generateMonthlyBills(dto: GenerateBillsDto, adminId: string, ipAddress?: string) {
    const yearBS = Number(dto.yearBS);
    const monthBS = Number(dto.monthBS);
    const monthNameBS = NEPALI_MONTH_NAMES[monthBS - 1] || 'Baisakh';

    const internetPerPersonRate = await this.settingsService.getNumberSetting('INTERNET_PER_PERSON_RATE', 250);
    const garbageRate = await this.settingsService.getNumberSetting('GARBAGE_CHARGE', 100);

    const roomWhere: any = {};
    if (dto.roomId) roomWhere.id = dto.roomId;

    const rooms = await this.prisma.room.findMany({
      where: roomWhere,
      include: {
        tenantProfiles: {
          where: { status: 'ACTIVE' },
          include: {
            user: true,
          },
        },
        electricityReadings: {
          where: { yearBS, monthBS },
        },
        waterPurchases: {
          where: { yearBS, monthBS },
        },
        adjustments: {
          where: { yearBS, monthBS },
        },
      },
    });

    const generatedBills: any[] = [];

    for (const room of rooms) {
      for (const activeTenantProfile of room.tenantProfiles) {
        const tenantId = activeTenantProfile.userId;

        // Check if bill already exists to preserve paidAmount and link existing charges
        const existingBill = await this.prisma.monthlyBill.findUnique({
          where: {
            tenantId_roomId_yearBS_monthBS: {
              tenantId,
              roomId: room.id,
              yearBS,
              monthBS,
            },
          },
        });

        // 1. Rent
        const rentAmount = activeTenantProfile.monthlyRent || room.defaultRent;

        // 2. Internet (charged only if tenant has internet enabled)
        let internetAmount = 0;
        if (activeTenantProfile.internetEnabled !== false) {
          const numPeople = activeTenantProfile.numberOfPeople || 1;
          internetAmount = Number((numPeople * internetPerPersonRate).toFixed(2));
        }

        // 3. Electricity
        const electricityReading = room.electricityReadings[0];
        const electricityAmount = electricityReading ? electricityReading.totalCharge : 0;

        // 4. Garbage (Fixed charge per room)
        const garbageAmount = Number(garbageRate.toFixed(2));

        // 5. Water: Include active water purchases for this tenant/room and month
        const waterPurchases = await this.prisma.waterPurchase.findMany({
          where: {
            roomId: room.id,
            OR: [
              { tenantId },
              { tenantId: null },
            ],
            yearBS,
            monthBS,
          },
        });
        const waterTotal = waterPurchases.reduce((acc, curr) => acc + curr.totalAmount, 0);
        const waterAmount = Number(waterTotal.toFixed(2));

        // 6. Borrowing (Outstanding borrowings flagged for billing that belong to this month/period)
        const allTenantBorrowings = await this.prisma.borrowing.findMany({
          where: {
            tenantId,
            includeInBill: true,
            status: { in: ['OUTSTANDING', 'PARTIALLY_PAID'] },
          },
        });
        const monthBorrowings = allTenantBorrowings.filter((b) => {
          const parsed = this.nepaliCalendarService.parseBsDate(b.borrowDateBS);
          if (parsed) {
            return parsed.yearBS === yearBS && parsed.monthBS === monthBS;
          }
          return false;
        });
        const borrowingAmount = Number(monthBorrowings.reduce((acc, curr) => acc + curr.outstandingAmount, 0).toFixed(2));

        // 7. Adjustments
        let adjustmentsAmount = 0;
        for (const adj of room.adjustments.filter((a) => a.tenantId === tenantId)) {
          if (adj.type === 'DISCOUNT' || adj.type === 'CREDIT') {
            adjustmentsAmount -= adj.amount;
          } else {
            adjustmentsAmount += adj.amount;
          }
        }

        // Total Calculation
        const totalAmount = Number(
          (rentAmount + internetAmount + electricityAmount + garbageAmount + waterAmount + borrowingAmount + adjustmentsAmount).toFixed(2),
        );

        const dueDateBS = `${yearBS} ${monthNameBS} 10`;

        // Calculate exact billing period based on tenant's move-in date
        const periodInfo = this.nepaliCalendarService.calculateBillingPeriod(
          activeTenantProfile.moveInDateBS,
          yearBS,
          monthBS,
        );
        const billingPeriodBS = periodInfo.billingPeriodBS;
        const billingStartDateBS = periodInfo.startDateBS;
        const billingEndDateBS = periodInfo.endDateBS;
        const isOngoing = periodInfo.isOngoing;

      // Generate unique billNumber
      let billNumber = `BILL-${yearBS}-${String(monthBS).padStart(2, '0')}-R${room.roomNumber}`;
      if (existingBill) {
        billNumber = existingBill.billNumber;
      } else {
        const baseNum = `BILL-${yearBS}-${String(monthBS).padStart(2, '0')}-R${room.roomNumber}`;
        let candidate = baseNum;
        let count = 1;
        while (true) {
          const existingByNum = await this.prisma.monthlyBill.findUnique({
            where: { billNumber: candidate },
          });
          if (!existingByNum || (existingByNum.tenantId === tenantId && existingByNum.roomId === room.id && existingByNum.yearBS === yearBS && existingByNum.monthBS === monthBS)) {
            billNumber = candidate;
            break;
          }
          candidate = `${baseNum}-${tenantId.slice(-4).toUpperCase()}${count > 1 ? `-${count}` : ''}`;
          count++;
        }
      }

      let paidAmount = existingBill?.paidAmount || 0;
      let balanceDue = Number(Math.max(0, totalAmount - paidAmount).toFixed(2));

      let status: BillStatus = existingBill?.status || 'UNPAID';
      if (balanceDue === 0 && totalAmount > 0 && paidAmount > 0) {
        status = 'PAID';
      } else if (paidAmount > 0 && balanceDue > 0) {
        status = 'PARTIALLY_PAID';
      } else if (existingBill && existingBill.status === 'PENDING_VERIFICATION') {
        status = 'PENDING_VERIFICATION';
      } else {
        status = 'UNPAID';
      }

      const bill = await this.prisma.monthlyBill.upsert({
        where: {
          tenantId_roomId_yearBS_monthBS: {
            tenantId,
            roomId: room.id,
            yearBS,
            monthBS,
          },
        },
        update: {
          billingPeriodBS,
          billingStartDateBS,
          billingEndDateBS,
          isOngoing,
          rentAmount,
          internetAmount,
          electricityAmount,
          garbageAmount,
          waterAmount,
          borrowingAmount,
          adjustmentsAmount,
          totalAmount,
          paidAmount,
          balanceDue,
          status,
          dueDateBS,
        },
        create: {
          billNumber,
          tenantId,
          roomId: room.id,
          yearBS,
          monthBS,
          monthNameBS,
          billingPeriodBS,
          billingStartDateBS,
          billingEndDateBS,
          isOngoing,
          rentAmount,
          internetAmount,
          electricityAmount,
          garbageAmount,
          waterAmount,
          borrowingAmount,
          adjustmentsAmount,
          totalAmount,
          paidAmount: 0,
          balanceDue: totalAmount,
          status: 'UNPAID',
          dueDateBS,
        },
      });

      // Link included water purchases to this monthly bill
      if (waterPurchases.length > 0) {
        await this.prisma.waterPurchase.updateMany({
          where: { id: { in: waterPurchases.map((w) => w.id) } },
          data: { billId: bill.id },
        });
      }

      // Chronologically reconcile all bills and advance balance for this tenant
      await this.reconcileTenantBillsAndAdvance(tenantId);

      const refreshedBill = await this.prisma.monthlyBill.findUnique({
        where: { id: bill.id },
      });

      generatedBills.push(refreshedBill || bill);
      }
    }

    await this.auditLogService.log({
      userId: adminId,
      action: 'MONTHLY_BILLS_GENERATED',
      details: { yearBS, monthBS, count: generatedBills.length },
      ipAddress,
    });

    return {
      message: `Generated/Updated ${generatedBills.length} monthly bill(s) for ${this.nepaliCalendarService.formatMonthYearBS(yearBS, monthBS)}`,
      bills: generatedBills,
    };
  }

  async getAllBills(
    yearBS?: number,
    monthBS?: number,
    status?: string,
    unpaidOnly?: boolean,
    tenantId?: string,
    roomId?: string,
  ) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (roomId) where.roomId = roomId;
    if (yearBS && !unpaidOnly) where.yearBS = Number(yearBS);
    if (monthBS && !unpaidOnly) where.monthBS = Number(monthBS);
    if (unpaidOnly) {
      where.status = { in: ['UNPAID', 'PARTIALLY_PAID', 'PENDING_VERIFICATION'] };
    } else if (status) {
      where.status = status;
    }

    return this.prisma.monthlyBill.findMany({
      where,
      orderBy: [{ yearBS: 'desc' }, { monthBS: 'desc' }, { roomId: 'asc' }],
      include: {
        room: { select: { roomNumber: true, name: true } },
        tenant: { select: { id: true, fullName: true, username: true, phone: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getBillById(id: string) {
    const bill = await this.prisma.monthlyBill.findUnique({
      where: { id },
      include: {
        room: true,
        tenant: {
          select: {
            id: true,
            fullName: true,
            username: true,
            phone: true,
            tenantProfile: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: { digitalReceipt: true },
        },
      },
    });

    if (!bill) {
      throw new NotFoundException('Monthly bill not found');
    }

    // Retrieve detailed line items
    const electricity = await this.prisma.electricityReading.findFirst({
      where: { roomId: bill.roomId, yearBS: bill.yearBS, monthBS: bill.monthBS },
    });

    const waterPurchases = await this.prisma.waterPurchase.findMany({
      where: {
        OR: [
          { billId: bill.id },
          { roomId: bill.roomId, yearBS: bill.yearBS, monthBS: bill.monthBS },
        ],
      },
    });

    const adjustments = await this.prisma.adjustment.findMany({
      where: { roomId: bill.roomId, tenantId: bill.tenantId, yearBS: bill.yearBS, monthBS: bill.monthBS },
    });

    const allBorrowings = await this.prisma.borrowing.findMany({
      where: { tenantId: bill.tenantId, includeInBill: true },
    });
    const borrowings = allBorrowings.filter((b) => {
      const parsed = this.nepaliCalendarService.parseBsDate(b.borrowDateBS);
      return parsed && parsed.yearBS === bill.yearBS && parsed.monthBS === bill.monthBS;
    });

    const tenantName = bill.tenant?.fullName || bill.tenant?.username || 'Tenant';
    const numPeople = bill.tenant?.tenantProfile?.numberOfPeople || 1;

    return {
      ...bill,
      breakdown: {
        rent: {
          description: 'Monthly Room Rent',
          amount: bill.rentAmount,
        },
        internet: {
          description: `Internet Charge (${numPeople} person(s))`,
          amount: bill.internetAmount,
        },
        electricity: {
          description: electricity
            ? `Electricity (${electricity.unitsUsed} units @ Rs ${electricity.unitRate}) [Reading: ${electricity.previousReading} -> ${electricity.currentReading}]`
            : 'Electricity (Reading pending)',
          amount: bill.electricityAmount,
          units: electricity?.unitsUsed || 0,
          previousReading: electricity?.previousReading || 0,
          currentReading: electricity?.currentReading || 0,
          unitRate: electricity?.unitRate || 15,
        },
        garbage: {
          description: 'Garbage Charge',
          amount: bill.garbageAmount ?? 100,
        },
        water: {
          description:
            waterPurchases.length > 0
              ? `Drinking Water (${waterPurchases.length} purchase(s))`
              : bill.waterAmount > 0
                ? `Drinking Water (Rs. ${bill.waterAmount})`
                : 'Drinking Water',
          amount: bill.waterAmount,
          items: waterPurchases,
        },
        borrowing: {
          description: 'Borrowed Money / Loans',
          amount: bill.borrowingAmount,
          items: borrowings,
        },
        adjustments: {
          description: 'Adjustments & Discounts',
          amount: bill.adjustmentsAmount,
          items: adjustments,
        },
      },
    };
  }

  async getMultiBillDetails(billIds: string[]) {
    if (!billIds || billIds.length === 0) {
      return { bills: [], totalOutstanding: 0, totalBilled: 0, totalPaid: 0, count: 0 };
    }

    const uniqueIds = Array.from(new Set(billIds));
    const detailedBills = await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          return await this.getBillById(id);
        } catch (e) {
          return null;
        }
      }),
    );

    const validBills = detailedBills.filter((b) => b !== null) as any[];
    // Sort chronologically (oldest month first)
    validBills.sort((a, b) => {
      if (a.yearBS !== b.yearBS) return a.yearBS - b.yearBS;
      return a.monthBS - b.monthBS;
    });

    const totalOutstanding = Number(
      validBills.reduce((acc, b) => acc + (b.balanceDue ?? b.totalAmount ?? 0), 0).toFixed(2),
    );
    const totalBilled = Number(
      validBills.reduce((acc, b) => acc + (b.totalAmount ?? 0), 0).toFixed(2),
    );
    const totalPaid = Number(
      validBills.reduce((acc, b) => acc + (b.paidAmount ?? 0), 0).toFixed(2),
    );

    return {
      bills: validBills,
      count: validBills.length,
      totalBilled,
      totalPaid,
      totalOutstanding,
      tenantName: validBills[0]?.tenant?.fullName || validBills[0]?.tenant?.username || 'Tenant',
      roomNumber: validBills[0]?.room?.roomNumber,
    };
  }

  async getTenantActiveBill(tenantId: string) {
    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();

    // Ensure tenant bills and advance are reconciled with all verified payments
    await this.reconcileTenantBillsAndAdvance(tenantId);

    const tenantProfile = await this.prisma.tenantProfile.findUnique({
      where: { userId: tenantId },
    });

    // Fetch all unpaid, partially paid, or pending bills for this tenant sorted chronologically (oldest first)
    const unpaidBills = await this.prisma.monthlyBill.findMany({
      where: {
        tenantId,
        status: { in: ['UNPAID', 'PARTIALLY_PAID', 'PENDING_VERIFICATION'] },
      },
      orderBy: [{ yearBS: 'asc' }, { monthBS: 'asc' }],
      include: {
        room: true,
      },
    });

    const totalOutstanding = Number(unpaidBills.reduce((acc, b) => acc + b.balanceDue, 0).toFixed(2));
    const isPendingVerification = unpaidBills.some((b) => b.status === 'PENDING_VERIFICATION');

    // Fetch latest bill to show latest bill breakdown if all are paid or for active view
    const latestBillRecord = await this.prisma.monthlyBill.findFirst({
      where: { tenantId },
      orderBy: [{ yearBS: 'desc' }, { monthBS: 'desc' }],
    });

    if (!latestBillRecord && unpaidBills.length === 0) {
      return null;
    }

    const primaryBillId = unpaidBills.length > 0 ? unpaidBills[0].id : latestBillRecord!.id;
    const detailedPrimaryBill = await this.getBillById(primaryBillId);

    // Enrich unpaidBills with detailed electricity readings
    const enrichedUnpaidBills = await Promise.all(
      unpaidBills.map(async (b) => {
        const elec = await this.prisma.electricityReading.findFirst({
          where: { roomId: b.roomId, yearBS: b.yearBS, monthBS: b.monthBS },
        });

        return {
          id: b.id,
          yearBS: b.yearBS,
          monthBS: b.monthBS,
          monthNameBS: b.monthNameBS,
          billingPeriodBS: b.billingPeriodBS || `${b.yearBS} ${b.monthNameBS}`,
          billingStartDateBS: b.billingStartDateBS,
          billingEndDateBS: b.billingEndDateBS,
          isOngoing: b.isOngoing,
          rentAmount: b.rentAmount,
          internetAmount: b.internetAmount,
          electricityAmount: b.electricityAmount,
          garbageAmount: b.garbageAmount ?? 100,
          waterAmount: b.waterAmount,
          borrowingAmount: b.borrowingAmount,
          adjustmentsAmount: b.adjustmentsAmount,
          totalAmount: b.totalAmount,
          paidAmount: b.paidAmount,
          balanceDue: b.balanceDue,
          status: b.status,
          dueDateBS: b.dueDateBS,
          roomNumber: b.room?.roomNumber,
          electricityReading: {
            previousReading: elec?.previousReading ?? null,
            currentReading: elec?.currentReading ?? null,
            unitsUsed: elec?.unitsUsed ?? 0,
            unitRate: elec?.unitRate ?? 15,
            totalCharge: elec?.totalCharge ?? b.electricityAmount,
          },
        };
      }),
    );

    // Fetch latest 3+ bills for recent overview on dashboard
    const recentBills = await this.prisma.monthlyBill.findMany({
      where: { tenantId },
      orderBy: [{ yearBS: 'desc' }, { monthBS: 'desc' }],
      take: 6,
      include: { room: true },
    });

    const enrichedRecentBills = await Promise.all(
      recentBills.map(async (b) => {
        const elec = await this.prisma.electricityReading.findFirst({
          where: { roomId: b.roomId, yearBS: b.yearBS, monthBS: b.monthBS },
        });

        return {
          id: b.id,
          yearBS: b.yearBS,
          monthBS: b.monthBS,
          monthNameBS: b.monthNameBS,
          billingPeriodBS: b.billingPeriodBS || `${b.yearBS} ${b.monthNameBS}`,
          billingStartDateBS: b.billingStartDateBS,
          billingEndDateBS: b.billingEndDateBS,
          isOngoing: b.isOngoing,
          rentAmount: b.rentAmount,
          internetAmount: b.internetAmount,
          electricityAmount: b.electricityAmount,
          garbageAmount: b.garbageAmount ?? 100,
          waterAmount: b.waterAmount,
          borrowingAmount: b.borrowingAmount,
          adjustmentsAmount: b.adjustmentsAmount,
          totalAmount: b.totalAmount,
          paidAmount: b.paidAmount,
          balanceDue: b.balanceDue,
          status: b.status,
          dueDateBS: b.dueDateBS,
          correctionReason: b.correctionReason,
          roomNumber: b.room?.roomNumber,
          electricityReading: {
            previousReading: elec?.previousReading ?? null,
            currentReading: elec?.currentReading ?? null,
            unitsUsed: elec?.unitsUsed ?? 0,
            unitRate: elec?.unitRate ?? 15,
            totalCharge: elec?.totalCharge ?? b.electricityAmount,
          },
        };
      }),
    );

    return {
      ...detailedPrimaryBill,
      advanceBalance: tenantProfile ? tenantProfile.advanceBalance : 0,
      totalOutstanding,
      unpaidBillsCount: unpaidBills.length,
      unpaidBills: enrichedUnpaidBills,
      recentBills: enrichedRecentBills,
      allBillsPaid: totalOutstanding === 0 && unpaidBills.length === 0,
      isPendingVerification,
      combinedBalanceDue: totalOutstanding,
      effectiveStatus: totalOutstanding === 0 ? 'PAID' : (isPendingVerification ? 'PENDING_VERIFICATION' : 'UNPAID'),
    };
  }

  async getTenantBillHistory(tenantId: string) {
    const tenantProfile = await this.prisma.tenantProfile.findUnique({
      where: { userId: tenantId },
    });

    const bills = await this.prisma.monthlyBill.findMany({
      where: { tenantId },
      orderBy: [{ yearBS: 'desc' }, { monthBS: 'desc' }],
      include: {
        room: { select: { roomNumber: true, name: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: { digitalReceipt: true },
        },
      },
    });

    return Promise.all(
      bills.map(async (bill) => {
        // If billingPeriodBS is not yet computed, calculate on the fly
        let billingPeriodBS = bill.billingPeriodBS;
        let isOngoing = bill.isOngoing;
        if (!billingPeriodBS && tenantProfile?.moveInDateBS) {
          const periodInfo = this.nepaliCalendarService.calculateBillingPeriod(
            tenantProfile.moveInDateBS,
            bill.yearBS,
            bill.monthBS,
          );
          billingPeriodBS = periodInfo.billingPeriodBS;
          isOngoing = periodInfo.isOngoing;
        }

        const elec = await this.prisma.electricityReading.findFirst({
          where: { roomId: bill.roomId, yearBS: bill.yearBS, monthBS: bill.monthBS },
        });

        return {
          ...bill,
          garbageAmount: bill.garbageAmount ?? 100,
          billingPeriodBS: billingPeriodBS || `${bill.yearBS} ${bill.monthNameBS}`,
          isOngoing: isOngoing || false,
          electricityReading: {
            previousReading: elec?.previousReading ?? null,
            currentReading: elec?.currentReading ?? null,
            unitsUsed: elec?.unitsUsed ?? 0,
            unitRate: elec?.unitRate ?? 15,
            totalCharge: elec?.totalCharge ?? bill.electricityAmount,
          },
        };
      }),
    );
  }

  /**
   * Correct/edit a bill manually with mandatory audit reasoning
   */
  async correctBill(billId: string, dto: CorrectBillDto, adminId: string, ipAddress?: string) {
    if (!dto.correctionReason || dto.correctionReason.trim().length === 0) {
      throw new BadRequestException('A reason for bill correction is mandatory');
    }

    const bill = await this.prisma.monthlyBill.findUnique({
      where: { id: billId },
      include: {
        tenant: { include: { tenantProfile: true } },
        room: true,
      },
    });

    if (!bill) {
      throw new NotFoundException('Monthly bill not found');
    }

    const rentAmount = dto.rentAmount !== undefined ? Number(Number(dto.rentAmount).toFixed(2)) : bill.rentAmount;
    const internetAmount = dto.internetAmount !== undefined ? Number(Number(dto.internetAmount).toFixed(2)) : bill.internetAmount;
    const electricityAmount = dto.electricityAmount !== undefined ? Number(Number(dto.electricityAmount).toFixed(2)) : bill.electricityAmount;
    const garbageAmount = dto.garbageAmount !== undefined ? Number(Number(dto.garbageAmount).toFixed(2)) : (bill.garbageAmount ?? 100);
    const waterAmount = dto.waterAmount !== undefined ? Number(Number(dto.waterAmount).toFixed(2)) : bill.waterAmount;
    const borrowingAmount = dto.borrowingAmount !== undefined ? Number(Number(dto.borrowingAmount).toFixed(2)) : bill.borrowingAmount;
    const adjustmentsAmount = dto.adjustmentsAmount !== undefined ? Number(Number(dto.adjustmentsAmount).toFixed(2)) : bill.adjustmentsAmount;

    const totalAmount = Number(
      (rentAmount + internetAmount + electricityAmount + garbageAmount + waterAmount + borrowingAmount + adjustmentsAmount).toFixed(2),
    );

    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
    const existingHistory = Array.isArray(bill.correctionHistory) ? bill.correctionHistory : [];
    const newHistoryEntry = {
      correctedAtAD: new Date(),
      correctedAtBS: todayBS.nepaliFormatted,
      correctedBy: adminId,
      reason: dto.correctionReason.trim(),
      oldTotal: bill.totalAmount,
      newTotal: totalAmount,
      changes: {
        rentAmount: { old: bill.rentAmount, new: rentAmount },
        internetAmount: { old: bill.internetAmount, new: internetAmount },
        electricityAmount: { old: bill.electricityAmount, new: electricityAmount },
        garbageAmount: { old: bill.garbageAmount, new: garbageAmount },
        waterAmount: { old: bill.waterAmount, new: waterAmount },
        borrowingAmount: { old: bill.borrowingAmount, new: borrowingAmount },
        adjustmentsAmount: { old: bill.adjustmentsAmount, new: adjustmentsAmount },
      },
    };

    await this.prisma.monthlyBill.update({
      where: { id: billId },
      data: {
        rentAmount,
        internetAmount,
        electricityAmount,
        garbageAmount,
        waterAmount,
        borrowingAmount,
        adjustmentsAmount,
        totalAmount,
        correctionReason: dto.correctionReason.trim(),
        correctionHistory: [...existingHistory, newHistoryEntry],
      },
    });

    // Reconcile tenant bills chronologically after correction
    await this.reconcileTenantBillsAndAdvance(bill.tenantId);

    const updatedBill = await this.prisma.monthlyBill.findUnique({
      where: { id: billId },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'BILL_CORRECTED',
      details: {
        billId: bill.id,
        billNumber: bill.billNumber,
        oldTotal: bill.totalAmount,
        newTotal: totalAmount,
        reason: dto.correctionReason.trim(),
      },
      ipAddress,
    });

    return {
      message: `Bill ${bill.billNumber} corrected successfully`,
      bill: updatedBill,
    };
  }

  /**
   * Reconciles all monthly bills, verified payments, and advance balance for a tenant.
   * - Allocates verified payments chronologically across bills (oldest first).
   * - Sets paidAmount, balanceDue, and status correctly.
   */
  async reconcileTenantBillsAndAdvance(tenantId: string) {
    const allBills = await this.prisma.monthlyBill.findMany({
      where: { tenantId },
      orderBy: [{ yearBS: 'asc' }, { monthBS: 'asc' }],
    });

    const verifiedPayments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        status: 'VERIFIED',
      },
      orderBy: { createdAt: 'asc' },
    });

    const pendingPayments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        status: 'PENDING_VERIFICATION',
      },
    });
    const hasPending = pendingPayments.length > 0;

    let verifiedPool = Number(
      verifiedPayments.reduce((acc, curr) => acc + Number(curr.amount), 0).toFixed(2),
    );

    for (const b of allBills) {
      const total = Number(b.totalAmount.toFixed(2));
      if (verifiedPool >= total) {
        await this.prisma.monthlyBill.update({
          where: { id: b.id },
          data: {
            paidAmount: total,
            balanceDue: 0,
            status: 'PAID',
          },
        });

        // Automatically settle any borrowing included in this paid bill
        if (b.borrowingAmount > 0) {
          const tenantBorrowings = await this.prisma.borrowing.findMany({
            where: {
              tenantId,
              includeInBill: true,
              status: { in: ['OUTSTANDING', 'PARTIALLY_PAID'] },
            },
          });
          const monthBorrowingIds = tenantBorrowings
            .filter((br) => {
              const parsed = this.nepaliCalendarService.parseBsDate(br.borrowDateBS);
              return parsed && parsed.yearBS === b.yearBS && parsed.monthBS === b.monthBS;
            })
            .map((br) => br.id);

          if (monthBorrowingIds.length > 0) {
            const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
            await this.prisma.borrowing.updateMany({
              where: { id: { in: monthBorrowingIds } },
              data: {
                outstandingAmount: 0,
                status: 'PAID',
                repaidDateBS: todayBS.nepaliFormatted,
                repaidDateAD: new Date(),
              },
            });
          }
        }

        verifiedPool = Number((verifiedPool - total).toFixed(2));
      } else if (verifiedPool > 0) {
        const paid = verifiedPool;
        const due = Number(Math.max(0, total - paid).toFixed(2));
        await this.prisma.monthlyBill.update({
          where: { id: b.id },
          data: {
            paidAmount: paid,
            balanceDue: due,
            status: hasPending ? 'PENDING_VERIFICATION' : (due === 0 ? 'PAID' : 'PARTIALLY_PAID'),
          },
        });
        verifiedPool = 0;
      } else {
        await this.prisma.monthlyBill.update({
          where: { id: b.id },
          data: {
            paidAmount: 0,
            balanceDue: total,
            status: hasPending ? 'PENDING_VERIFICATION' : 'UNPAID',
          },
        });
      }
    }

    // Any surplus from verified payments becomes the tenant's advanceBalance
    const tenantProf = await this.prisma.tenantProfile.findUnique({
      where: { userId: tenantId },
    });
    if (tenantProf) {
      await this.prisma.tenantProfile.update({
        where: { id: tenantProf.id },
        data: { advanceBalance: verifiedPool },
      });
    }
  }

  /**
   * Return comprehensive advance & credit breakdown for a tenant (or all active tenants).
   * Includes total paid, total charges billed, advance consumed, remaining advance credit,
   * outstanding balance due, verified payment transactions, and itemized consumption history.
   */
  async getAdvanceSummary(targetTenantId?: string) {
    const tenantWhere: any = { role: 'TENANT' };
    if (targetTenantId) tenantWhere.id = targetTenantId;

    const tenants = await this.prisma.user.findMany({
      where: tenantWhere,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        fullName: true,
        phone: true,
        tenantProfile: {
          include: {
            room: {
              select: { id: true, roomNumber: true, name: true },
            },
          },
        },
        payments: {
          where: { status: 'VERIFIED' },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            amount: true,
            paymentMethod: true,
            transactionId: true,
            paymentDateBS: true,
            paymentDateAD: true,
            receiptNumber: true,
            createdAt: true,
          },
        },
        bills: {
          orderBy: [{ yearBS: 'asc' }, { monthBS: 'asc' }],
          select: {
            id: true,
            billNumber: true,
            yearBS: true,
            monthBS: true,
            monthNameBS: true,
            billingPeriodBS: true,
            rentAmount: true,
            internetAmount: true,
            electricityAmount: true,
            waterAmount: true,
            garbageAmount: true,
            borrowingAmount: true,
            adjustmentsAmount: true,
            totalAmount: true,
            paidAmount: true,
            balanceDue: true,
            status: true,
          },
        },
      },
    });

    return tenants.map((t) => {
      const totalPaidAllTime = Number(
        t.payments.reduce((acc, p) => acc + Number(p.amount), 0).toFixed(2),
      );
      const totalChargesAllTime = Number(
        t.bills.reduce((acc, b) => acc + Number(b.totalAmount), 0).toFixed(2),
      );
      const advanceConsumed = Number(Math.min(totalPaidAllTime, totalChargesAllTime).toFixed(2));
      const remainingAdvance = Number(Math.max(0, totalPaidAllTime - totalChargesAllTime).toFixed(2));
      const currentAmountDue = Number(Math.max(0, totalChargesAllTime - totalPaidAllTime).toFixed(2));

      return {
        tenantId: t.id,
        tenantName: t.fullName,
        username: t.username,
        phone: t.phone,
        roomId: t.tenantProfile?.roomId,
        roomNumber: t.tenantProfile?.room?.roomNumber,
        roomName: t.tenantProfile?.room?.name,
        totalAdvancePaid: totalPaidAllTime,
        totalChargesBilled: totalChargesAllTime,
        advanceConsumed,
        remainingAdvance,
        currentAmountDue,
        advancePayments: t.payments,
        billsHistory: t.bills,
      };
    });
  }

  async getTenantAdvanceSummary(tenantId: string) {
    const list = await this.getAdvanceSummary(tenantId);
    if (!list || list.length === 0) {
      throw new NotFoundException('Tenant advance information not found');
    }
    return list[0];
  }

  async getAdminFinancialSummary(yearBS?: number, monthBS?: number) {
    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
    const targetYear = yearBS || todayBS.yearBS;
    const targetMonth = monthBS || todayBS.monthBS;

    const bills = await this.prisma.monthlyBill.findMany({
      where: { yearBS: targetYear, monthBS: targetMonth },
    });

    const allBills = await this.prisma.monthlyBill.findMany();

    const pendingPaymentsCount = await this.prisma.payment.count({
      where: { status: 'PENDING_VERIFICATION' },
    });

    const collectedAmount = bills.reduce((acc, curr) => acc + curr.paidAmount, 0);
    const totalCollectedAllTime = allBills.reduce((acc, curr) => acc + curr.paidAmount, 0);
    const totalOutstandingAllTime = allBills.reduce((acc, curr) => acc + curr.balanceDue, 0);

    // Expected Rent on Dashboard strictly equals Total Outstanding Amount across bills
    const expectedRent = totalOutstandingAllTime;
    const outstandingAmount = totalOutstandingAllTime;

    const electricityDashboard = await this.prisma.electricityReading.count({
      where: { yearBS: targetYear, monthBS: targetMonth },
    });

    const totalRooms = await this.prisma.room.count();
    const occupiedRooms = await this.prisma.tenantProfile.count({ where: { status: 'ACTIVE' } });
    const vacantRooms = totalRooms - occupiedRooms;

    return {
      period: {
        yearBS: targetYear,
        monthBS: targetMonth,
        monthNameBS: NEPALI_MONTH_NAMES[targetMonth - 1] || 'Baisakh',
        nepaliHeader: this.nepaliCalendarService.formatMonthYearBS(targetYear, targetMonth),
      },
      stats: {
        expectedRent,
        collectedAmount,
        outstandingAmount,
        totalCollectedAllTime,
        totalOutstandingAllTime,
        pendingPaymentsCount,
        electricityCompleted: `${electricityDashboard}/${totalRooms}`,
        totalRooms,
        occupiedRooms,
        vacantRooms,
      },
    };
  }

  /**
   * Automatically generate missing monthly bills from the tenant's move-in month up to the current month.
   * Handles year boundaries (e.g. 2082 Chaitra -> 2083 Baisakh -> 2083 Bhadra).
   * Ensures no duplicates are created.
   */
  async generateBackBillsForTenant(
    tenantId: string,
    roomId: string,
    moveInDateBS: string,
    adminId: string,
    ipAddress?: string,
  ) {
    const parsed = this.nepaliCalendarService.parseBsDate(moveInDateBS);
    const today = this.nepaliCalendarService.getCurrentNepaliDate();

    if (!parsed) {
      // If move-in date could not be parsed, generate bill for current month
      return this.generateMonthlyBills({ yearBS: today.yearBS, monthBS: today.monthBS, roomId }, adminId, ipAddress);
    }

    const startYear = parsed.yearBS;
    const startMonth = parsed.monthBS;
    const endYear = today.yearBS;
    const endMonth = today.monthBS;

    // If move-in date is in future, don't generate past bills
    if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
      return [];
    }

    const monthsToGenerate: { yearBS: number; monthBS: number }[] = [];
    let curY = startYear;
    let curM = startMonth;

    while (curY < endYear || (curY === endYear && curM <= endMonth)) {
      monthsToGenerate.push({ yearBS: curY, monthBS: curM });
      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
    }

    const createdBills = [];
    for (const item of monthsToGenerate) {
      const res = await this.generateMonthlyBills(
        {
          yearBS: item.yearBS,
          monthBS: item.monthBS,
          roomId,
        },
        adminId,
        ipAddress,
      );
      if (res && res.bills && Array.isArray(res.bills)) {
        createdBills.push(...res.bills);
      }
    }

    return createdBills;
  }
}
