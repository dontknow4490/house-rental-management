import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class RoomsService {
  constructor(
    private prisma: PrismaService,
    private nepaliCalendarService: NepaliCalendarService,
    private auditLogService: AuditLogService,
  ) {}

  async getAllRooms() {
    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();

    const rooms = await this.prisma.room.findMany({
      orderBy: { roomNumber: 'asc' },
      include: {
        tenantProfiles: {
          where: { status: 'ACTIVE' },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                phone: true,
                status: true,
              },
            },
          },
        },
        electricityReadings: {
          where: {
            yearBS: todayBS.yearBS,
            monthBS: todayBS.monthBS,
          },
        },
        monthlyBills: {
          where: {
            yearBS: todayBS.yearBS,
            monthBS: todayBS.monthBS,
          },
        },
      },
    });

    return rooms.map((room) => {
      const activeTenant = room.tenantProfiles[0] || null;
      const currentReading = room.electricityReadings[0] || null;
      const currentBill = room.monthlyBills[0] || null;

      return {
        id: room.id,
        roomNumber: room.roomNumber,
        name: room.name,
        defaultRent: room.defaultRent,
        status: activeTenant ? 'OCCUPIED' : 'VACANT',
        tenant: activeTenant
          ? {
              id: activeTenant.user.id,
              profileId: activeTenant.id,
              fullName: activeTenant.user.fullName,
              username: activeTenant.user.username,
              phone: activeTenant.user.phone,
              numberOfPeople: activeTenant.numberOfPeople,
              monthlyRent: activeTenant.monthlyRent,
              moveInDateBS: activeTenant.moveInDateBS,
            }
          : null,
        currentBill: currentBill
          ? {
              id: currentBill.id,
              billNumber: currentBill.billNumber,
              totalAmount: currentBill.totalAmount,
              paidAmount: currentBill.paidAmount,
              balanceDue: currentBill.balanceDue,
              status: currentBill.status,
            }
          : null,
        electricityStatus: currentReading ? 'UPDATED' : 'PENDING',
        electricityUnits: currentReading ? currentReading.unitsUsed : null,
        currentReading: currentReading ? currentReading.currentReading : null,
        previousReading: currentReading ? currentReading.previousReading : null,
        unitsUsed: currentReading ? currentReading.unitsUsed : null,
        electricityReading: currentReading ? currentReading.currentReading : null,
        electricityCharge: currentReading ? currentReading.totalCharge : null,
      };
    });
  }

  async getRoomById(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        tenantProfiles: {
          include: {
            user: {
              select: { id: true, username: true, fullName: true, phone: true },
            },
          },
        },
        electricityReadings: {
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
        monthlyBills: {
          orderBy: { generatedAt: 'desc' },
          take: 12,
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async updateRoomRent(id: string, defaultRent: number, adminId: string, ipAddress?: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const updated = await this.prisma.room.update({
      where: { id },
      data: { defaultRent },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'ROOM_RENT_UPDATED',
      details: {
        roomId: id,
        roomNumber: room.roomNumber,
        oldRent: room.defaultRent,
        newRent: defaultRent,
      },
      ipAddress,
    });

    return updated;
  }
}
