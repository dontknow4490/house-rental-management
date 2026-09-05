import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { MaintenancePriority, MaintenanceStatus } from '@prisma/client';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

import { NotificationsService } from '../notifications/notifications.service';

export interface CreateMaintenanceDto {
  title: string;
  category?: string;
  description: string;
  priority?: MaintenancePriority;
  photoPath?: string;
}

export interface UpdateMaintenanceStatusDto {
  status: MaintenanceStatus | string;
  adminNotes?: string;
}

@Injectable()
export class MaintenanceService {
  constructor(
    private prisma: PrismaService,
    private nepaliCalendarService: NepaliCalendarService,
    private auditLogService: AuditLogService,
    private notificationsService: NotificationsService,
    @Optional() private cloudinaryService?: CloudinaryService,
  ) {}

  async createRequest(
    dto: CreateMaintenanceDto,
    tenantId: string,
    photoPath?: string,
    ipAddress?: string,
  ) {
    const profile = await this.prisma.tenantProfile.findUnique({
      where: { userId: tenantId },
      include: { room: true, user: true },
    });

    if (!profile) {
      throw new BadRequestException('Only active tenants assigned to a room can create maintenance requests');
    }

    if (!dto.title || !dto.title.trim()) {
      throw new BadRequestException('Issue title is required');
    }

    if (!dto.description || !dto.description.trim()) {
      throw new BadRequestException('Issue description is required');
    }

    const ALLOWED_CATEGORIES = ['Electrical', 'Internet', 'Door / Window', 'Other'];
    let category = dto.category?.trim() || 'Electrical';
    if (!ALLOWED_CATEGORIES.includes(category)) {
      category = 'Other';
    }

    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();

    const request = await this.prisma.maintenanceRequest.create({
      data: {
        tenantId,
        roomId: profile.roomId,
        title: dto.title.trim(),
        category,
        description: dto.description.trim(),
        priority: dto.priority || 'MEDIUM',
        photoPath: photoPath || dto.photoPath || null,
        status: 'NEW',
        createdDateBS: todayBS.nepaliFormatted,
      },
    });

    await this.auditLogService.log({
      userId: tenantId,
      action: 'MAINTENANCE_REQUEST_CREATED',
      details: {
        requestId: request.id,
        title: request.title,
        category: request.category,
        roomNumber: profile.room.roomNumber,
        priority: request.priority,
      },
      ipAddress,
    });

    // Notify all active Admins about the new maintenance request
    await this.notificationsService.notifyAdmins({
      type: 'MAINTENANCE_UPDATE',
      title: 'New Maintenance Request',
      message: `Room ${profile.room.roomNumber} (${profile.user?.fullName || 'Tenant'}): ${request.title} [${request.category}]`,
      link: '/admin/maintenance',
      data: {
        requestId: request.id,
        roomNumber: profile.room.roomNumber,
        category: request.category,
        priority: request.priority,
      },
    });

    return request;
  }

  async getRequests(tenantId?: string) {
    const where = tenantId ? { tenantId } : {};

    const requests = await this.prisma.maintenanceRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        room: { select: { roomNumber: true, name: true } },
        tenant: { select: { fullName: true, username: true, phone: true } },
      },
    });

    if (this.cloudinaryService && this.cloudinaryService.isConfigured()) {
      for (const req of requests) {
        if (req.photoPath && req.photoPath.includes('cloudinary.com')) {
          const publicId = this.cloudinaryService.extractPublicId(req.photoPath);
          if (publicId) {
            req.photoPath = this.cloudinaryService.generateSignedUrl(publicId, 3600);
          }
        }
      }
    }

    return requests;
  }

  async updateStatus(
    id: string,
    dto: UpdateMaintenanceStatusDto,
    adminId: string,
    ipAddress?: string,
  ) {
    const req = await this.prisma.maintenanceRequest.findUnique({
      where: { id },
      include: { room: true },
    });
    if (!req) throw new NotFoundException('Maintenance request not found');

    // Normalize incoming status from frontend safely to PostgreSQL enum (NEW, IN_PROGRESS, COMPLETED)
    const rawStatus = String(dto.status || '').toUpperCase();
    let status: MaintenanceStatus = 'NEW';
    if (rawStatus === 'IN_PROGRESS') {
      status = 'IN_PROGRESS';
    } else if (rawStatus === 'COMPLETED' || rawStatus === 'RESOLVED' || rawStatus === 'CANCELLED') {
      status = 'COMPLETED';
    } else {
      status = 'NEW';
    }

    const updated = await this.prisma.maintenanceRequest.update({
      where: { id },
      data: {
        status,
        adminNotes: dto.adminNotes !== undefined ? dto.adminNotes?.trim() : req.adminNotes,
      },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'MAINTENANCE_STATUS_UPDATED',
      details: { requestId: id, status, notes: dto.adminNotes },
      ipAddress,
    });

    // Notify the tenant about maintenance status update
    const statusLabels: Record<string, string> = {
      NEW: 'New',
      IN_PROGRESS: 'In Progress',
      COMPLETED: 'Completed',
    };
    const statusText = statusLabels[status] || status;

    await this.notificationsService.notifyTenant(req.tenantId, {
      type: 'MAINTENANCE_UPDATE',
      title: 'Maintenance Status Updated',
      message: `Your request "${req.title}" for Room ${req.room.roomNumber} is now ${statusText}.${dto.adminNotes ? ` Note: ${dto.adminNotes}` : ''}`,
      link: '/tenant/maintenance',
      data: {
        requestId: id,
        status: dto.status,
        adminNotes: dto.adminNotes,
      },
    });

    return updated;
  }
}
