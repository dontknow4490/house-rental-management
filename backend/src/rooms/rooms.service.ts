import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto';

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
      const activeTenant = room.tenantProfiles.find((tp) => tp.status === 'ACTIVE' && tp.user) || room.tenantProfiles[0] || null;
      const currentReading = room.electricityReadings[0] || null;
      const currentBill = room.monthlyBills[0] || null;

      return {
        id: room.id,
        roomNumber: room.roomNumber,
        name: room.name,
        defaultRent: room.defaultRent,
        status: activeTenant ? 'OCCUPIED' : 'VACANT',
        tenantProfiles: room.tenantProfiles,
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
    return this.updateRoom(id, { defaultRent }, adminId, ipAddress);
  }

  async createRoom(dto: CreateRoomDto, adminId: string, ipAddress?: string) {
    const roomNum = parseInt(String(dto.roomNumber), 10);
    if (isNaN(roomNum) || roomNum <= 0) {
      throw new BadRequestException('Room number must be a positive integer');
    }

    const existing = await this.prisma.room.findUnique({
      where: { roomNumber: roomNum },
    });
    if (existing) {
      throw new BadRequestException(`Room ${roomNum} already exists`);
    }

    const defaultRent = Number(dto.defaultRent);
    if (isNaN(defaultRent) || defaultRent < 0) {
      throw new BadRequestException('Default rent must be a non-negative number');
    }

    const name = dto.name?.trim() || `Room ${roomNum}`;

    const room = await this.prisma.room.create({
      data: {
        roomNumber: roomNum,
        name,
        defaultRent,
        status: 'VACANT',
      },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'ROOM_CREATED',
      details: {
        roomId: room.id,
        roomNumber: room.roomNumber,
        name: room.name,
        defaultRent: room.defaultRent,
      },
      ipAddress,
    });

    return room;
  }

  async updateRoom(id: string, dto: UpdateRoomDto, adminId: string, ipAddress?: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const dataToUpdate: any = {};
    if (dto.name !== undefined && dto.name.trim().length > 0) {
      dataToUpdate.name = dto.name.trim();
    }
    if (dto.defaultRent !== undefined) {
      const rent = Number(dto.defaultRent);
      if (isNaN(rent) || rent < 0) {
        throw new BadRequestException('Default rent must be a non-negative number');
      }
      dataToUpdate.defaultRent = rent;
    }

    const updated = await this.prisma.room.update({
      where: { id },
      data: dataToUpdate,
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'ROOM_UPDATED',
      details: {
        roomId: id,
        roomNumber: room.roomNumber,
        changes: dataToUpdate,
      },
      ipAddress,
    });

    return updated;
  }

  async deleteRoom(id: string, adminId: string, ipAddress?: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        tenantProfiles: true,
        monthlyBills: true,
        electricityReadings: true,
        waterPurchases: true,
        customPurchases: true,
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const hasActiveTenant = (room.tenantProfiles || []).some((tp) => tp.status === 'ACTIVE');
    if (hasActiveTenant) {
      throw new BadRequestException(
        `Cannot delete Room ${room.roomNumber} while an active tenant is assigned. Move out or reassign the tenant first.`,
      );
    }

    const hasBills = (room.monthlyBills?.length || 0) > 0;
    const hasReadings = (room.electricityReadings?.length || 0) > 0;
    const hasWater = (room.waterPurchases?.length || 0) > 0;
    const hasPurchases = (room.customPurchases?.length || 0) > 0;

    if (hasBills || hasReadings || hasWater || hasPurchases) {
      throw new BadRequestException(
        `Cannot delete Room ${room.roomNumber} because historical records exist. This room must be retained to ensure financial and audit integrity.`,
      );
    }

    await this.prisma.room.delete({ where: { id } });

    await this.auditLogService.log({
      userId: adminId,
      action: 'ROOM_DELETED',
      details: {
        roomId: id,
        roomNumber: room.roomNumber,
        name: room.name,
      },
      ipAddress,
    });

    return { success: true, message: `Room ${room.roomNumber} deleted successfully` };
  }
}
