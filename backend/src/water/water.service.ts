import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BillingService } from '../billing/billing.service';
import { executeWithIdempotency } from '../common/utils/async-lock.util';

export interface AddWaterPurchaseDto {
  roomId: string;
  yearBS: number;
  monthBS: number;
  quantity: number;
  pricePerUnit?: number;
  purchaseDateBS?: string;
  note?: string;
  idempotencyKey?: string;
}

@Injectable()
export class WaterService {
  constructor(
    private prisma: PrismaService,
    private nepaliCalendarService: NepaliCalendarService,
    private settingsService: SettingsService,
    private auditLogService: AuditLogService,
    private billingService: BillingService,
  ) {}

  async addPurchase(dto: AddWaterPurchaseDto, adminId: string, ipAddress?: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      include: { tenantProfiles: { where: { status: 'ACTIVE' } } },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const activeTenant = room.tenantProfiles[0] || null;
    const defaultPrice = await this.settingsService.getNumberSetting('DRINKING_WATER_DEFAULT_PRICE', 45);
    const unitPrice = dto.pricePerUnit !== undefined && dto.pricePerUnit !== null ? Number(dto.pricePerUnit) : defaultPrice;
    const qty = Number(dto.quantity) || 1;
    const totalAmount = Number((qty * unitPrice).toFixed(2));

    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
    const yearBS = dto.yearBS !== undefined && dto.yearBS !== null ? Number(dto.yearBS) : todayBS.yearBS;
    const monthBS = dto.monthBS !== undefined && dto.monthBS !== null ? Number(dto.monthBS) : todayBS.monthBS;
    const purchaseDateBS = dto.purchaseDateBS || todayBS.nepaliFormatted;

    return await executeWithIdempotency('water_purchase', adminId, dto.idempotencyKey, async () => {
      const purchase = await this.prisma.waterPurchase.create({
        data: {
          roomId: dto.roomId,
          tenantId: activeTenant ? activeTenant.userId : null,
          yearBS,
          monthBS,
          quantity: qty,
          pricePerUnit: unitPrice,
          totalAmount,
          purchaseDateBS,
          purchaseDateAD: new Date(),
          isSettled: false,
          note: dto.note?.trim() || null,
        },
      });

      await this.auditLogService.log({
        userId: adminId,
        action: 'WATER_PURCHASE_ADDED',
        details: {
          purchaseId: purchase.id,
          roomNumber: room.roomNumber,
          quantity: qty,
          unitPrice,
          totalAmount,
          idempotencyKey: dto.idempotencyKey,
        },
        ipAddress,
      });

      // Recalculate and update the MonthlyBill for this room and month (if unpaid bill exists)
      try {
        await this.billingService.generateMonthlyBills(
          {
            yearBS,
            monthBS,
            roomId: dto.roomId,
          },
          adminId,
          ipAddress,
        );
      } catch (e) {
        console.error('[WaterService.addPurchase error]:', e);
      }

      return purchase;
    });
  }

  async getPurchases(roomId?: string, yearBS?: number, monthBS?: number) {
    const where: any = {};
    if (roomId) where.roomId = roomId;
    if (yearBS) where.yearBS = Number(yearBS);
    if (monthBS) where.monthBS = Number(monthBS);

    const purchases = await this.prisma.waterPurchase.findMany({
      where,
      orderBy: [{ yearBS: 'desc' }, { monthBS: 'desc' }, { createdAt: 'asc' }],
      include: {
        bill: {
          select: {
            id: true,
            billNumber: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
            balanceDue: true,
            waterAmount: true,
          },
        },
        room: {
          select: {
            id: true,
            roomNumber: true,
            name: true,
            tenantProfiles: {
              where: { status: 'ACTIVE' },
              include: {
                user: {
                  select: { id: true, fullName: true, username: true, phone: true },
                },
              },
            },
          },
        },
      },
    });

    // Group purchases by month/room to allocate payment coverage chronologically
    const groupKey = (p: any) => `${p.roomId}_${p.yearBS}_${p.monthBS}`;
    const grouped: { [key: string]: any[] } = {};
    for (const p of purchases) {
      const k = groupKey(p);
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(p);
    }

    const results: any[] = [];

    for (const key of Object.keys(grouped)) {
      const groupPurchases = grouped[key];
      const sample = groupPurchases[0];
      const bill = sample.bill || null;

      let waterPaidPool = 0;
      if (bill) {
        if (bill.balanceDue === 0) {
          waterPaidPool = Infinity; // Everything is covered
        } else {
          const nonWaterAmount = Math.max(0, (bill.totalAmount || 0) - (bill.waterAmount || 0));
          waterPaidPool = Math.max(0, (bill.paidAmount || 0) - nonWaterAmount);
        }
      }

      for (const p of groupPurchases) {
        let tenantUser: any = p.room?.tenantProfiles?.[0]?.user || null;
        if (!tenantUser && p.tenantId) {
          tenantUser = await this.prisma.user.findUnique({
            where: { id: p.tenantId },
            select: { id: true, fullName: true, username: true, phone: true },
          });
        }

        const totalAmount = Number(p.totalAmount) || Number(p.quantity) * Number(p.pricePerUnit) || 0;
        let coveredByAdvance = 0;
        let remainingDue = totalAmount;

        if (waterPaidPool === Infinity) {
          coveredByAdvance = totalAmount;
          remainingDue = 0;
        } else if (waterPaidPool > 0) {
          coveredByAdvance = Number(Math.min(totalAmount, waterPaidPool).toFixed(2));
          remainingDue = Number(Math.max(0, totalAmount - coveredByAdvance).toFixed(2));
          waterPaidPool = Number((waterPaidPool - coveredByAdvance).toFixed(2));
        }

        const isSettled = remainingDue === 0;
        const billStatus = bill ? bill.status : (isSettled ? 'PAID' : 'UNBILLED');
        const settlementStatus = isSettled
          ? 'Covered by Advance / Paid'
          : coveredByAdvance > 0
            ? `Partially Covered (Rs. ${remainingDue} due)`
            : `Due (Rs. ${remainingDue})`;

        results.push({
          ...p,
          totalAmount,
          totalCost: totalAmount,
          coveredByAdvance,
          remainingDue,
          tenant: tenantUser || null,
          tenantName: tenantUser?.fullName || null,
          isSettled,
          billStatus,
          settlementStatus,
          billId: p.billId || bill?.id || null,
        });
      }
    }

    return results;
  }

  async deletePurchase(id: string, adminId: string, ipAddress?: string) {
    const purchase = await this.prisma.waterPurchase.findUnique({ where: { id } });
    if (!purchase) throw new NotFoundException('Water purchase record not found');

    const { roomId, yearBS, monthBS, billId } = purchase;

    await this.prisma.waterPurchase.delete({ where: { id } });

    await this.auditLogService.log({
      userId: adminId,
      action: 'WATER_PURCHASE_DELETED',
      details: { purchaseId: id, totalAmount: purchase.totalAmount },
      ipAddress,
    });

    // Recalculate and update the MonthlyBill for this room and month after deletion
    try {
      await this.billingService.generateMonthlyBills(
        {
          yearBS,
          monthBS,
          roomId,
        },
        adminId,
        ipAddress,
      );
    } catch (e) {
      // Continue if bill update not required
    }

    return { message: 'Water purchase deleted' };
  }
}
