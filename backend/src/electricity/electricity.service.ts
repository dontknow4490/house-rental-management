import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService, NEPALI_MONTH_NAMES } from '../nepali-calendar/nepali-calendar.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BillingService } from '../billing/billing.service';
import { executeWithIdempotency } from '../common/utils/async-lock.util';

export interface EnterMeterReadingDto {
  roomId: string;
  yearBS: number;
  monthBS: number; // 1 - 12
  currentReading: number;
  previousReading?: number; // Optional; auto-calculated from previous period if omitted
  idempotencyKey?: string;
}

@Injectable()
export class ElectricityService {
  constructor(
    private prisma: PrismaService,
    private nepaliCalendarService: NepaliCalendarService,
    private settingsService: SettingsService,
    private auditLogService: AuditLogService,
    private billingService: BillingService,
  ) {}

  /**
   * Get the last recorded meter reading for a room before or at the specified period
   */
  async getLastReadingForRoom(roomId: string, beforeYearBS?: number, beforeMonthBS?: number) {
    const where: any = { roomId };
    if (beforeYearBS && beforeMonthBS) {
      // Find previous period strictly for this room
      where.OR = [
        { yearBS: { lt: beforeYearBS } },
        { yearBS: beforeYearBS, monthBS: { lt: beforeMonthBS } },
      ];
    }

    const last = await this.prisma.electricityReading.findFirst({
      where,
      orderBy: [{ yearBS: 'desc' }, { monthBS: 'desc' }],
    });

    return last ? last.currentReading : 0;
  }

  /**
   * Enter or update electricity meter reading for a room
   */
  async enterReading(dto: EnterMeterReadingDto, adminId: string, ipAddress?: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      include: {
        tenantProfiles: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const activeTenant = room.tenantProfiles[0] || null;
    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();

    // Validation: Admin cannot enter readings for future months
    if (dto.yearBS > todayBS.yearBS || (dto.yearBS === todayBS.yearBS && dto.monthBS > todayBS.monthBS)) {
      const currentMonthName = NEPALI_MONTH_NAMES[todayBS.monthBS - 1] || 'Baisakh';
      throw new BadRequestException(
        `Cannot enter electricity readings for future months. Current month is ${todayBS.yearBS} ${currentMonthName}.`
      );
    }

    // Validation: Admin cannot enter readings for periods before the tenant moved in
    if (activeTenant && activeTenant.moveInDateBS) {
      const moveIn = this.nepaliCalendarService.parseBsDate(activeTenant.moveInDateBS);
      if (moveIn) {
        if (dto.yearBS < moveIn.yearBS || (dto.yearBS === moveIn.yearBS && dto.monthBS < moveIn.monthBS)) {
          const moveInMonthName = NEPALI_MONTH_NAMES[moveIn.monthBS - 1] || 'Baisakh';
          throw new BadRequestException(
            `Cannot enter electricity reading for a period before tenant moved in (${activeTenant.moveInDateBS}). Valid periods start from ${moveIn.yearBS} ${moveInMonthName}.`
          );
        }
      }
    }

    // Determine previous reading for this specific room
    let prevReading = dto.previousReading;
    if (prevReading === undefined || prevReading === null) {
      prevReading = await this.getLastReadingForRoom(dto.roomId, dto.yearBS, dto.monthBS);
    }

    // Validation: Current cannot be lower than previous reading
    if (dto.currentReading < prevReading) {
      throw new BadRequestException('Current meter reading cannot be lower than the previous reading.');
    }

    const unitsUsed = Number((dto.currentReading - prevReading).toFixed(2));
    const unitRate = await this.settingsService.getNumberSetting('ELECTRICITY_UNIT_RATE', 15);
    const totalCharge = Number((unitsUsed * unitRate).toFixed(2));

    const monthNameBS = NEPALI_MONTH_NAMES[dto.monthBS - 1] || 'Baisakh';

    return await executeWithIdempotency('electricity_reading', adminId, dto.idempotencyKey, async () => {
      const reading = await this.prisma.electricityReading.upsert({
        where: {
          roomId_yearBS_monthBS: {
            roomId: dto.roomId,
            yearBS: dto.yearBS,
            monthBS: dto.monthBS,
          },
        },
        update: {
          tenantId: activeTenant ? activeTenant.userId : null,
          previousReading: prevReading,
          currentReading: dto.currentReading,
          unitsUsed,
          unitRate,
          totalCharge,
          readingDateAD: new Date(),
          readingDateBS: todayBS.nepaliFormatted,
        },
        create: {
          roomId: dto.roomId,
          tenantId: activeTenant ? activeTenant.userId : null,
          yearBS: dto.yearBS,
          monthBS: dto.monthBS,
          monthNameBS,
          previousReading: prevReading,
          currentReading: dto.currentReading,
          unitsUsed,
          unitRate,
          totalCharge,
          readingDateAD: new Date(),
          readingDateBS: todayBS.nepaliFormatted,
        },
      });

    // 1. Immediately update / recalculate the monthly bill for this period and room
    try {
      await this.billingService.generateMonthlyBills(
        {
          yearBS: dto.yearBS,
          monthBS: dto.monthBS,
          roomId: dto.roomId,
        },
        adminId,
        ipAddress,
      );
    } catch (err) {
      console.error('Failed to update monthly bill after electricity reading:', err);
    }

    // 2. Cascade to all subsequent readings for this room in chronological order
    try {
      const subsequentReadings = await this.prisma.electricityReading.findMany({
        where: {
          roomId: dto.roomId,
          OR: [
            { yearBS: { gt: dto.yearBS } },
            { yearBS: dto.yearBS, monthBS: { gt: dto.monthBS } },
          ],
        },
        orderBy: [{ yearBS: 'asc' }, { monthBS: 'asc' }],
      });

      let carriedCurrent = dto.currentReading;
      for (const nextReading of subsequentReadings) {
        if (nextReading.currentReading >= carriedCurrent) {
          const nextUnits = Number((nextReading.currentReading - carriedCurrent).toFixed(2));
          const nextCharge = Number((nextUnits * nextReading.unitRate).toFixed(2));
          await this.prisma.electricityReading.update({
            where: { id: nextReading.id },
            data: {
              previousReading: carriedCurrent,
              unitsUsed: nextUnits,
              totalCharge: nextCharge,
            },
          });
          await this.billingService.generateMonthlyBills(
            {
              yearBS: nextReading.yearBS,
              monthBS: nextReading.monthBS,
              roomId: dto.roomId,
            },
            adminId,
            ipAddress,
          );
        }
        carriedCurrent = nextReading.currentReading;
      }
    } catch (err) {
      console.error('Failed to cascade electricity reading update:', err);
    }

      await this.auditLogService.log({
        userId: adminId,
        action: 'ELECTRICITY_READING_ENTERED',
        details: {
          roomId: dto.roomId,
          roomNumber: room.roomNumber,
          yearBS: dto.yearBS,
          monthBS: dto.monthBS,
          previousReading: prevReading,
          currentReading: dto.currentReading,
          unitsUsed,
          totalCharge,
        },
        ipAddress,
      });

      return reading;
    });
  }

  /**
   * Electricity status overview across all 6 rooms for a given BS period
   */
  async getDashboardStatus(yearBS?: number, monthBS?: number) {
    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
    const targetYear = yearBS || todayBS.yearBS;
    const targetMonth = monthBS || todayBS.monthBS;
    const unitRate = await this.settingsService.getNumberSetting('ELECTRICITY_UNIT_RATE', 15);

    const rooms = await this.prisma.room.findMany({
      orderBy: { roomNumber: 'asc' },
      include: {
        tenantProfiles: {
          where: { status: 'ACTIVE' },
          include: { user: true },
        },
        electricityReadings: {
          where: { yearBS: targetYear, monthBS: targetMonth },
        },
      },
    });

    const roomStatusList = await Promise.all(
      rooms.map(async (room) => {
        const activeTenant = room.tenantProfiles[0] || null;
        const currentReading = room.electricityReadings[0] || null;
        const prevReadingValue = await this.getLastReadingForRoom(room.id, targetYear, targetMonth);

        let isBeforeMoveIn = false;
        let moveInPeriodText = '';
        if (activeTenant && activeTenant.moveInDateBS) {
          const moveIn = this.nepaliCalendarService.parseBsDate(activeTenant.moveInDateBS);
          if (moveIn) {
            isBeforeMoveIn = targetYear < moveIn.yearBS || (targetYear === moveIn.yearBS && targetMonth < moveIn.monthBS);
            moveInPeriodText = `${moveIn.yearBS} ${NEPALI_MONTH_NAMES[moveIn.monthBS - 1]}`;
          }
        }

        const totalCost = currentReading ? currentReading.totalCharge : 0;
        const isLogged = !!currentReading;

        return {
          roomId: room.id,
          roomNumber: room.roomNumber,
          roomName: room.name,
          status: activeTenant ? 'OCCUPIED' : 'VACANT',
          tenantName: activeTenant ? activeTenant.user.fullName : 'Vacant',
          moveInDateBS: activeTenant?.moveInDateBS || null,
          isBeforeMoveIn,
          moveInPeriodText,
          previousReading: currentReading ? currentReading.previousReading : prevReadingValue,
          currentReading: currentReading ? currentReading.currentReading : null,
          unitsConsumed: currentReading ? currentReading.unitsUsed : 0,
          unitsUsed: currentReading ? currentReading.unitsUsed : 0,
          unitRate,
          totalAmount: totalCost,
          totalCost,
          isLogged,
          isUpdated: isLogged,
          readingDateBS: currentReading?.readingDateBS || null,
        };
      }),
    );

    const updatedRooms = roomStatusList.filter((r) => r.isLogged).length;
    const pendingRooms = roomStatusList.filter((r) => r.status === 'OCCUPIED' && !r.isLogged).length;
    const totalUnitsConsumed = roomStatusList.reduce((acc, curr) => acc + curr.unitsConsumed, 0);
    const totalElectricityCharge = roomStatusList.reduce((acc, curr) => acc + curr.totalAmount, 0);

    return {
      period: {
        yearBS: targetYear,
        monthBS: targetMonth,
        monthNameBS: NEPALI_MONTH_NAMES[targetMonth - 1] || 'Baisakh',
        formattedPeriod: this.nepaliCalendarService.formatMonthYearBS(targetYear, targetMonth),
      },
      unitRate,
      totalRooms: rooms.length,
      updatedRooms,
      pendingRooms,
      totalUnitsConsumed,
      totalElectricityCharge,
      totalElectricityAmount: totalElectricityCharge,
      totalCost: totalElectricityCharge,
      rooms: roomStatusList,
    };
  }

  /**
   * Historical electricity readings for a specific room
   */
  async getRoomHistory(roomId: string) {
    return this.prisma.electricityReading.findMany({
      where: { roomId },
      orderBy: [{ yearBS: 'desc' }, { monthBS: 'desc' }],
    });
  }

  /**
   * All historical electricity readings across all rooms
   */
  async getAllReadings() {
    return this.prisma.electricityReading.findMany({
      orderBy: [{ yearBS: 'desc' }, { monthBS: 'desc' }, { roomId: 'asc' }],
      include: {
        room: { select: { roomNumber: true, name: true } },
      },
    });
  }
}
