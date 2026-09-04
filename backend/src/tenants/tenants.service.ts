import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import * as bcrypt from 'bcryptjs';

import { BillingService } from '../billing/billing.service';

export interface CreateTenantDto {
  username: string;
  password?: string;
  fullName: string;
  phone?: string;
  roomId: string;
  numberOfPeople: number;
  monthlyRent: number;
  moveInDateBS: string;
  internetEnabled?: boolean;
  citizenshipNumber?: string;
  notes?: string;
}

export interface UpdateTenantDto {
  username?: string;
  fullName?: string;
  phone?: string;
  numberOfPeople?: number;
  monthlyRent?: number;
  moveInDateBS?: string;
  internetEnabled?: boolean;
  citizenshipNumber?: string;
  notes?: string;
}

@Injectable()
export class TenantsService {
  constructor(
    private prisma: PrismaService,
    private nepaliCalendarService: NepaliCalendarService,
    private auditLogService: AuditLogService,
    private billingService: BillingService,
  ) {}

  async getAllTenants() {
    const tenants = await this.prisma.user.findMany({
      where: { role: 'TENANT' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        fullName: true,
        phone: true,
        status: true,
        createdAt: true,
        tenantProfile: {
          include: {
            room: {
              select: {
                id: true,
                roomNumber: true,
                name: true,
                defaultRent: true,
              },
            },
          },
        },
        bills: {
          orderBy: { generatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            billNumber: true,
            totalAmount: true,
            paidAmount: true,
            balanceDue: true,
            status: true,
            monthNameBS: true,
            yearBS: true,
          },
        },
      },
    });

    return tenants.map((t) => ({
      id: t.id,
      username: t.username,
      fullName: t.fullName,
      phone: t.phone,
      status: t.status,
      createdAt: t.createdAt,
      profile: t.tenantProfile
        ? {
            id: t.tenantProfile.id,
            roomId: t.tenantProfile.roomId,
            roomNumber: t.tenantProfile.room?.roomNumber,
            roomName: t.tenantProfile.room?.name,
            room: t.tenantProfile.room
              ? {
                  id: t.tenantProfile.room.id,
                  roomNumber: t.tenantProfile.room.roomNumber,
                  name: t.tenantProfile.room.name,
                  defaultRent: t.tenantProfile.room.defaultRent,
                }
              : null,
            numberOfPeople: t.tenantProfile.numberOfPeople,
            monthlyRent: t.tenantProfile.monthlyRent,
            moveInDateBS: t.tenantProfile.moveInDateBS,
            moveOutDateBS: t.tenantProfile.moveOutDateBS,
            internetEnabled: t.tenantProfile.internetEnabled ?? true,
            status: t.tenantProfile.status,
            citizenshipNumber: t.tenantProfile.citizenshipNumber,
            citizenshipDocPath: t.tenantProfile.citizenshipDocPath,
            notes: t.tenantProfile.notes,
          }
        : null,
      latestBill: t.bills[0] || null,
    }));
  }

  async getTenantById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        phone: true,
        status: true,
        role: true,
        createdAt: true,
        tenantProfile: {
          include: {
            room: true,
          },
        },
        bills: {
          orderBy: { generatedAt: 'desc' },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Tenant not found');
    }

    return user;
  }

  async createTenant(dto: CreateTenantDto, adminId: string, ipAddress?: string) {
    const username = dto.username.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      throw new ConflictException(`Username '${username}' is already in use.`);
    }

    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      include: {
        tenantProfiles: {
          where: { status: 'ACTIVE' },
        },
      },
    });
    if (!room) {
      throw new NotFoundException('Selected room not found');
    }

    if (room.tenantProfiles.length > 0 || room.status === 'OCCUPIED') {
      throw new BadRequestException(`Room ${room.roomNumber} is currently occupied.`);
    }

    // Default password if not provided
    const rawPassword = dto.password?.trim() || 'Tenant@123';
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
    const moveInDateBS = dto.moveInDateBS || todayBS.nepaliFormatted;
    const parsedMoveIn = this.nepaliCalendarService.parseBsDate(moveInDateBS);
    const moveInDateAD = parsedMoveIn
      ? this.nepaliCalendarService.bsToAd(parsedMoveIn.yearBS, parsedMoveIn.monthBS, parsedMoveIn.dayBS)
      : new Date();

    const internetEnabled = dto.internetEnabled !== undefined ? Boolean(dto.internetEnabled) : true;

    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        fullName: dto.fullName.trim(),
        phone: dto.phone?.trim() || null,
        role: 'TENANT',
        status: 'ACTIVE',
        tenantProfile: {
          create: {
            roomId: room.id,
            numberOfPeople: Number(dto.numberOfPeople) || 1,
            monthlyRent: Number(dto.monthlyRent) || room.defaultRent,
            moveInDateBS,
            moveInDateAD,
            internetEnabled,
            status: 'ACTIVE',
            citizenshipNumber: dto.citizenshipNumber?.trim() || null,
            notes: dto.notes?.trim() || null,
          },
        },
      },
      include: {
        tenantProfile: {
          include: {
            room: true,
          },
        },
      },
    });

    // Update room status
    await this.prisma.room.update({
      where: { id: room.id },
      data: { status: 'OCCUPIED' },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'TENANT_CREATED',
      details: {
        tenantId: user.id,
        username: user.username,
        fullName: user.fullName,
        roomNumber: room.roomNumber,
        rent: dto.monthlyRent,
        internetEnabled,
      },
      ipAddress,
    });

    // Automatically generate missing monthly bills from move-in month up to current month
    try {
      await this.billingService.generateBackBillsForTenant(
        user.id,
        room.id,
        moveInDateBS,
        adminId,
        ipAddress,
      );
    } catch (err) {
      console.error('Failed to generate back bills for new tenant:', err);
    }

    return {
      message: 'Tenant created successfully',
      tenant: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        phone: user.phone,
        roomNumber: room.roomNumber,
        monthlyRent: user.tenantProfile?.monthlyRent,
        internetEnabled: user.tenantProfile?.internetEnabled,
      },
    };
  }

  async updateTenant(userId: string, dto: UpdateTenantDto, adminId: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenantProfile: true },
    });

    if (!user) {
      throw new NotFoundException('Tenant not found');
    }

    // Handle move-in date update if provided
    let newMoveInBS = user.tenantProfile?.moveInDateBS;
    let newMoveInAD = user.tenantProfile?.moveInDateAD;
    if (dto.moveInDateBS && dto.moveInDateBS.trim() !== '') {
      newMoveInBS = dto.moveInDateBS.trim();
      const parsed = this.nepaliCalendarService.parseBsDate(newMoveInBS);
      if (parsed) {
        newMoveInAD = this.nepaliCalendarService.bsToAd(parsed.yearBS, parsed.monthBS, parsed.dayBS);
      }
    }

    // Handle username update if provided
    let newUsername = user.username;
    if (dto.username && dto.username.trim() !== '') {
      const cleanUsername = dto.username.trim().toLowerCase();
      if (cleanUsername !== user.username) {
        const existing = await this.prisma.user.findFirst({
          where: {
            username: cleanUsername,
            id: { not: userId },
          },
        });
        if (existing) {
          throw new ConflictException(`Username "${cleanUsername}" is already taken.`);
        }
        newUsername = cleanUsername;
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        username: newUsername,
        fullName: dto.fullName !== undefined ? dto.fullName.trim() : user.fullName,
        phone: dto.phone !== undefined ? dto.phone?.trim() || null : user.phone,
        tenantProfile: user.tenantProfile
          ? {
              update: {
                numberOfPeople:
                    dto.numberOfPeople !== undefined
                      ? Number(dto.numberOfPeople)
                      : user.tenantProfile.numberOfPeople,
                monthlyRent:
                    dto.monthlyRent !== undefined
                      ? Number(dto.monthlyRent)
                      : user.tenantProfile.monthlyRent,
                internetEnabled:
                    dto.internetEnabled !== undefined
                      ? Boolean(dto.internetEnabled)
                      : user.tenantProfile.internetEnabled,
                moveInDateBS: newMoveInBS,
                moveInDateAD: newMoveInAD,
                citizenshipNumber:
                    dto.citizenshipNumber !== undefined
                      ? dto.citizenshipNumber?.trim() || null
                      : user.tenantProfile.citizenshipNumber,
                notes:
                    dto.notes !== undefined
                      ? dto.notes?.trim() || null
                      : user.tenantProfile.notes,
              },
            }
          : undefined,
      },
      include: {
        tenantProfile: {
          include: { room: true },
        },
      },
    });

    // If billing-related fields (internetEnabled, numberOfPeople, monthlyRent) changed,
    // refresh the tenant's current unpaid/ongoing monthly bill so changes take effect immediately
    if (dto.internetEnabled !== undefined || dto.numberOfPeople !== undefined || dto.monthlyRent !== undefined) {
      try {
        const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
        if (updatedUser.tenantProfile?.roomId) {
          await this.billingService.generateMonthlyBills(
            {
              yearBS: todayBS.yearBS,
              monthBS: todayBS.monthBS,
              roomId: updatedUser.tenantProfile.roomId,
            },
            adminId,
            ipAddress,
          );
        }
      } catch (err) {
        console.error('Failed to refresh current monthly bill on tenant update:', err);
      }
    }

    await this.auditLogService.log({
      userId: adminId,
      action: 'TENANT_UPDATED',
      details: { tenantId: userId, updates: dto },
      ipAddress,
    });

    return updatedUser;
  }

  async moveTenantRoom(userId: string, newRoomId: string, adminId: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenantProfile: true },
    });

    if (!user || !user.tenantProfile) {
      throw new NotFoundException('Tenant profile not found');
    }

    const oldRoomId = user.tenantProfile.roomId;
    if (oldRoomId === newRoomId) {
      throw new BadRequestException('Tenant is already assigned to this room');
    }

    const newRoom = await this.prisma.room.findUnique({ where: { id: newRoomId } });
    if (!newRoom) {
      throw new NotFoundException('Target room not found');
    }

    await this.prisma.tenantProfile.update({
      where: { userId },
      data: { roomId: newRoomId },
    });

    // Mark new room as OCCUPIED
    await this.prisma.room.update({
      where: { id: newRoomId },
      data: { status: 'OCCUPIED' },
    });

    // Check if old room has any other active tenant
    const activeInOld = await this.prisma.tenantProfile.count({
      where: { roomId: oldRoomId, status: 'ACTIVE', userId: { not: userId } },
    });

    if (activeInOld === 0) {
      await this.prisma.room.update({
        where: { id: oldRoomId },
        data: { status: 'VACANT' },
      });
    }

    await this.auditLogService.log({
      userId: adminId,
      action: 'TENANT_ROOM_MOVED',
      details: { tenantId: userId, oldRoomId, newRoomId, newRoomNumber: newRoom.roomNumber },
      ipAddress,
    });

    return { message: `Tenant moved to Room ${newRoom.roomNumber} successfully` };
  }

  async resetPassword(userId: string, newPassword: string, adminId: string, ipAddress?: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters long');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'TENANT_PASSWORD_RESET',
      details: { targetUserId: userId, username: user.username },
      ipAddress,
    });

    return { message: 'Tenant password has been reset successfully' };
  }

  async toggleStatus(userId: string, adminId: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Tenant not found');

    const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: newStatus },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'TENANT_STATUS_TOGGLED',
      details: { targetUserId: userId, newStatus },
      ipAddress,
    });

    return updated;
  }

  async moveOutTenant(userId: string, moveOutDateBS: string, adminId: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenantProfile: true },
    });

    if (!user || !user.tenantProfile) {
      throw new NotFoundException('Tenant not found');
    }

    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
    const finalMoveOutDate = moveOutDateBS || todayBS.nepaliFormatted;

    await this.prisma.tenantProfile.update({
      where: { userId },
      data: {
        status: 'MOVED_OUT',
        moveOutDateBS: finalMoveOutDate,
        moveOutDateAD: new Date(),
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'INACTIVE' },
    });

    // Check if room is now vacant
    const remainingActive = await this.prisma.tenantProfile.count({
      where: { roomId: user.tenantProfile.roomId, status: 'ACTIVE' },
    });

    if (remainingActive === 0) {
      await this.prisma.room.update({
        where: { id: user.tenantProfile.roomId },
        data: { status: 'VACANT' },
      });
    }

    await this.auditLogService.log({
      userId: adminId,
      action: 'TENANT_MOVED_OUT',
      details: { tenantId: userId, roomId: user.tenantProfile.roomId, moveOutDateBS: finalMoveOutDate },
      ipAddress,
    });

    return { message: 'Tenant marked as Moved Out and room updated.' };
  }

  async deleteOrArchiveTenant(userId: string, adminId: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenantProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Tenant not found');
    }

    // Determine if tenant is already archived (purge request)
    const isAlreadyArchived = user.tenantProfile?.status === 'ARCHIVED';

    // Count dependent records
    const [billsCount, paymentsCount, waterCount, elecCount, adjCount, customCount] = await Promise.all([
      this.prisma.monthlyBill.count({ where: { tenantId: userId } }),
      this.prisma.payment.count({ where: { tenantId: userId } }),
      this.prisma.waterPurchase.count({ where: { tenantId: userId } }),
      this.prisma.electricityReading.count({ where: { tenantId: userId } }),
      this.prisma.adjustment.count({ where: { tenantId: userId } }),
      this.prisma.customPurchase.count({ where: { tenantId: userId } }),
    ]);

    const totalFinancialRecords = billsCount + paymentsCount + waterCount + elecCount + adjCount + customCount;

    // Ensure room status is set to VACANT if this tenant was the only active one
    if (user.tenantProfile?.roomId) {
      const remainingActive = await this.prisma.tenantProfile.count({
        where: { roomId: user.tenantProfile.roomId, status: 'ACTIVE', userId: { not: userId } },
      });
      if (remainingActive === 0) {
        await this.prisma.room.update({
          where: { id: user.tenantProfile.roomId },
          data: { status: 'VACANT' },
        });
      }
    }

    // If tenant is already ARCHIVED or has zero financial records → permanent delete (purge)
    if (isAlreadyArchived || totalFinancialRecords === 0) {
      // Permanently delete all related records that don't cascade automatically.
      await this.prisma.waterPurchase.deleteMany({ where: { tenantId: userId } });
      await this.prisma.electricityReading.deleteMany({ where: { tenantId: userId } });
      await this.prisma.adjustment.deleteMany({ where: { tenantId: userId } });
      await this.prisma.customPurchase.deleteMany({ where: { tenantId: userId } });
      await this.prisma.notification.deleteMany({ where: { userId } });
      await this.prisma.maintenanceRequest.deleteMany({ where: { tenantId: userId } });

      // Disassociate audit logs to prevent foreign key restriction on user deletion
      await this.prisma.auditLog.updateMany({
        where: { userId },
        data: { userId: null },
      });

      // Delete tenant profile
      if (user.tenantProfile) {
        await this.prisma.tenantProfile.delete({ where: { userId } });
      }

      // Delete user (cascades to MonthlyBill, Payment, DigitalReceipt)
      await this.prisma.user.delete({ where: { id: userId } });

      const reason = isAlreadyArchived
        ? `Purged archived tenant with ${totalFinancialRecords} historical records`
        : 'Zero dependent financial records';

      await this.auditLogService.log({
        userId: adminId,
        action: 'TENANT_DELETED',
        details: {
          targetUserId: userId,
          username: user.username,
          reason,
          recordsPurged: totalFinancialRecords,
        },
        ipAddress,
      });

      return {
        message: `Tenant ${user.fullName} (@${user.username}) and all associated records were permanently deleted.`,
        action: 'DELETED',
        recordsRetained: 0,
      };
    } else {
      // First-time delete on a non-archived tenant with financial records → safe archive
      await this.prisma.tenantProfile.updateMany({
        where: { userId },
        data: {
          status: 'ARCHIVED',
        },
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          status: 'INACTIVE',
        },
      });

      // Remove non-financial ephemeral records
      await this.prisma.notification.deleteMany({ where: { userId } });

      await this.auditLogService.log({
        userId: adminId,
        action: 'TENANT_ARCHIVED',
        details: {
          targetUserId: userId,
          username: user.username,
          billsCount,
          paymentsCount,
          waterCount,
        },
        ipAddress,
      });

      return {
        message: `Tenant ${user.fullName} profile was safely archived. Historical financial records (${billsCount} bills, ${paymentsCount} payments) preserved. To permanently delete, use Delete again from the Archived tab.`,
        action: 'ARCHIVED',
        recordsRetained: totalFinancialRecords,
      };
    }
  }
}
