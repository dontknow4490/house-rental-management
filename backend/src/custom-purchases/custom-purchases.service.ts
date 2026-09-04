import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BillingService } from '../billing/billing.service';
import { CreateCustomPurchaseDto, UpdateCustomPurchaseDto, CreateBatchCustomPurchasesDto } from './custom-purchases.dto';

@Injectable()
export class CustomPurchasesService {
  constructor(
    private prisma: PrismaService,
    private nepaliCalendarService: NepaliCalendarService,
    private auditLogService: AuditLogService,
    private billingService: BillingService,
  ) {}

  async addBatchPurchases(dto: CreateBatchCustomPurchasesDto, adminId: string, ipAddress?: string) {
    if (!dto.items || !Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('At least one purchase item is required');
    }

    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      include: { tenantProfiles: { where: { status: 'ACTIVE' } } },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Pre-validate all items before executing transaction
    const sanitizedItems: Array<{
      itemName: string;
      quantity: number;
      unitPrice: number;
      totalAmount: number;
      note: string | null;
    }> = [];

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      const itemName = item.itemName?.trim();
      if (!itemName) {
        throw new BadRequestException(`Item #${i + 1}: Item name cannot be empty`);
      }
      const unitPrice = Number(item.unitPrice);
      if (isNaN(unitPrice) || unitPrice < 0) {
        throw new BadRequestException(`Item #${i + 1} (${itemName}): Unit price must be a non-negative number`);
      }
      const rawQty = item.quantity !== undefined && item.quantity !== null ? Number(item.quantity) : 1;
      if (isNaN(rawQty) || !Number.isInteger(rawQty) || rawQty <= 0) {
        throw new BadRequestException(`Item #${i + 1} (${itemName}): Quantity must be a positive integer`);
      }
      const quantity = rawQty;
      const totalAmount = Number((quantity * unitPrice).toFixed(2));

      sanitizedItems.push({
        itemName,
        quantity,
        unitPrice,
        totalAmount,
        note: item.note?.trim() || null,
      });
    }

    const activeTenant = room.tenantProfiles[0] || null;
    const tenantId = dto.tenantId || (activeTenant ? activeTenant.userId : null);

    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
    const yearBS = dto.yearBS !== undefined && dto.yearBS !== null ? Number(dto.yearBS) : todayBS.yearBS;
    const monthBS = dto.monthBS !== undefined && dto.monthBS !== null ? Number(dto.monthBS) : todayBS.monthBS;
    const purchaseDateBS = dto.purchaseDateBS || todayBS.nepaliFormatted;

    // Transactional batch creation: entire operation succeeds or fails as one unit
    const createdPurchases = await this.prisma.$transaction(
      sanitizedItems.map((item) =>
        this.prisma.customPurchase.create({
          data: {
            roomId: dto.roomId,
            tenantId,
            itemName: item.itemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: item.totalAmount,
            yearBS,
            monthBS,
            purchaseDateBS,
            purchaseDateAD: new Date(),
            isSettled: false,
            note: item.note,
          },
        }),
      ),
    );

    const totalBatchAmount = Number(
      sanitizedItems.reduce((acc, curr) => acc + curr.totalAmount, 0).toFixed(2),
    );

    // Audit log for the batch
    await this.auditLogService.log({
      userId: adminId,
      action: 'CUSTOM_PURCHASE_BATCH_ADDED',
      details: {
        itemCount: createdPurchases.length,
        totalAmount: totalBatchAmount,
        roomNumber: room.roomNumber,
        tenantId,
        items: sanitizedItems.map((it) => ({
          name: it.itemName,
          qty: it.quantity,
          rate: it.unitPrice,
          subtotal: it.totalAmount,
        })),
      },
      ipAddress,
    });

    // Recalculate monthly bills only after the batch has been successfully persisted
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
      console.error('[CustomPurchasesService.addBatchPurchases generateMonthlyBills error]:', e);
    }

    return {
      success: true,
      message: `Successfully added ${createdPurchases.length} purchase items`,
      totalAmount: totalBatchAmount,
      grandTotal: totalBatchAmount,
      items: createdPurchases,
    };
  }

  async addPurchase(dto: CreateCustomPurchaseDto, adminId: string, ipAddress?: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      include: { tenantProfiles: { where: { status: 'ACTIVE' } } },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const itemName = dto.itemName?.trim();
    if (!itemName) {
      throw new BadRequestException('Item name cannot be empty');
    }

    const unitPrice = Number(dto.unitPrice);
    if (isNaN(unitPrice) || unitPrice < 0) {
      throw new BadRequestException('Unit price must be a non-negative number');
    }

    const qty = Math.max(1, parseInt(String(dto.quantity), 10) || 1);
    const totalAmount = Number((qty * unitPrice).toFixed(2));

    const activeTenant = room.tenantProfiles[0] || null;
    const tenantId = dto.tenantId || (activeTenant ? activeTenant.userId : null);

    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
    const yearBS = dto.yearBS !== undefined && dto.yearBS !== null ? Number(dto.yearBS) : todayBS.yearBS;
    const monthBS = dto.monthBS !== undefined && dto.monthBS !== null ? Number(dto.monthBS) : todayBS.monthBS;
    const purchaseDateBS = dto.purchaseDateBS || todayBS.nepaliFormatted;

    const purchase = await this.prisma.customPurchase.create({
      data: {
        roomId: dto.roomId,
        tenantId,
        itemName,
        quantity: qty,
        unitPrice,
        totalAmount,
        yearBS,
        monthBS,
        purchaseDateBS,
        purchaseDateAD: new Date(),
        isSettled: false,
        note: dto.note?.trim() || null,
      },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'CUSTOM_PURCHASE_ADDED',
      details: {
        purchaseId: purchase.id,
        roomNumber: room.roomNumber,
        itemName,
        quantity: qty,
        unitPrice,
        totalAmount,
        tenantId,
      },
      ipAddress,
    });

    // Automatically recalculate and update the MonthlyBill for this room and month
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
      console.error('[CustomPurchasesService.addPurchase generateMonthlyBills error]:', e);
    }

    return purchase;
  }

  async getPurchases(roomId?: string, yearBS?: number, monthBS?: number, tenantId?: string) {
    const where: any = {};
    if (roomId) where.roomId = roomId;
    if (yearBS) where.yearBS = Number(yearBS);
    if (monthBS) where.monthBS = Number(monthBS);
    if (tenantId) where.tenantId = tenantId;

    const purchases = await this.prisma.customPurchase.findMany({
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
            customPurchasesAmount: true,
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
        tenant: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
      },
    });

    return purchases.map((p) => {
      const activeTenantUser = p.room?.tenantProfiles?.[0]?.user || null;
      const tenantUser = p.tenant || activeTenantUser || null;
      const totalAmount = Number(p.totalAmount) || Number(p.quantity) * Number(p.unitPrice) || 0;
      const bill = p.bill || null;
      const isSettled = bill ? bill.balanceDue === 0 : false;
      const billStatus = bill ? bill.status : 'UNBILLED';

      return {
        ...p,
        totalAmount,
        tenant: tenantUser,
        tenantName: tenantUser?.fullName || tenantUser?.username || 'Tenant',
        isSettled,
        billStatus,
        billId: p.billId || bill?.id || null,
      };
    });
  }

  async updatePurchase(id: string, dto: UpdateCustomPurchaseDto, adminId: string, ipAddress?: string) {
    const purchase = await this.prisma.customPurchase.findUnique({
      where: { id },
      include: { room: true },
    });

    if (!purchase) {
      throw new NotFoundException('Custom purchase record not found');
    }

    const itemName = dto.itemName !== undefined ? dto.itemName.trim() : purchase.itemName;
    if (!itemName) {
      throw new BadRequestException('Item name cannot be empty');
    }

    const unitPrice = dto.unitPrice !== undefined ? Number(dto.unitPrice) : purchase.unitPrice;
    if (isNaN(unitPrice) || unitPrice < 0) {
      throw new BadRequestException('Unit price must be a non-negative number');
    }

    const qty = dto.quantity !== undefined ? Math.max(1, parseInt(String(dto.quantity), 10) || 1) : purchase.quantity;
    const totalAmount = Number((qty * unitPrice).toFixed(2));

    const yearBS = dto.yearBS !== undefined ? Number(dto.yearBS) : purchase.yearBS;
    const monthBS = dto.monthBS !== undefined ? Number(dto.monthBS) : purchase.monthBS;
    const purchaseDateBS = dto.purchaseDateBS || purchase.purchaseDateBS;
    const note = dto.note !== undefined ? (dto.note?.trim() || null) : purchase.note;

    const oldYearBS = purchase.yearBS;
    const oldMonthBS = purchase.monthBS;
    const roomId = purchase.roomId;

    const updated = await this.prisma.customPurchase.update({
      where: { id },
      data: {
        itemName,
        quantity: qty,
        unitPrice,
        totalAmount,
        yearBS,
        monthBS,
        purchaseDateBS,
        note,
      },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'CUSTOM_PURCHASE_UPDATED',
      details: {
        purchaseId: id,
        itemName,
        quantity: qty,
        unitPrice,
        totalAmount,
        oldTotal: purchase.totalAmount,
      },
      ipAddress,
    });

    // Recalculate bills
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

      if (oldYearBS !== yearBS || oldMonthBS !== monthBS) {
        await this.billingService.generateMonthlyBills(
          {
            yearBS: oldYearBS,
            monthBS: oldMonthBS,
            roomId,
          },
          adminId,
          ipAddress,
        );
      }
    } catch (e) {
      console.error('[CustomPurchasesService.updatePurchase generateMonthlyBills error]:', e);
    }

    return updated;
  }

  async deletePurchase(id: string, adminId: string, ipAddress?: string) {
    const purchase = await this.prisma.customPurchase.findUnique({ where: { id } });
    if (!purchase) {
      throw new NotFoundException('Custom purchase record not found');
    }

    const { roomId, yearBS, monthBS, totalAmount, itemName } = purchase;

    await this.prisma.customPurchase.delete({ where: { id } });

    await this.auditLogService.log({
      userId: adminId,
      action: 'CUSTOM_PURCHASE_DELETED',
      details: { purchaseId: id, itemName, totalAmount },
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
      console.error('[CustomPurchasesService.deletePurchase generateMonthlyBills error]:', e);
    }

    return { message: 'Custom purchase deleted successfully' };
  }
}
