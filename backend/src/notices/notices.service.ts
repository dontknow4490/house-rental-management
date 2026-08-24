import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NoticeCategory } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';

export interface CreateNoticeDto {
  title: string;
  content: string;
  category?: NoticeCategory;
  isActive?: boolean;
}

@Injectable()
export class NoticesService {
  constructor(
    private prisma: PrismaService,
    private nepaliCalendarService: NepaliCalendarService,
    private auditLogService: AuditLogService,
    private notificationsService: NotificationsService,
  ) {}

  async getActiveNotices() {
    return this.prisma.notice.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllNotices() {
    return this.prisma.notice.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createNotice(dto: CreateNoticeDto, adminId: string, ipAddress?: string) {
    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();

    const VALID_CATEGORIES = ['GENERAL', 'WATER', 'ELECTRICITY', 'URGENT'];
    let category: NoticeCategory = 'GENERAL';
    if (dto.category && VALID_CATEGORIES.includes(dto.category as string)) {
      category = dto.category as NoticeCategory;
    }

    const notice = await this.prisma.notice.create({
      data: {
        title: dto.title.trim(),
        content: dto.content.trim(),
        category,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        createdDateBS: todayBS.nepaliFormatted,
        createdDateAD: new Date(),
      },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'NOTICE_CREATED',
      details: { noticeId: notice.id, title: notice.title },
      ipAddress,
    });

    // Notify all active Tenants about the new notice
    if (notice.isActive) {
      await this.notificationsService.notifyAllActiveTenants({
        type: 'SYSTEM',
        title: `Notice: ${notice.title}`,
        message: notice.content.length > 80 ? `${notice.content.slice(0, 80)}...` : notice.content,
        link: '/tenant/notices',
        data: {
          noticeId: notice.id,
          category: notice.category,
        },
      });
    }

    return notice;
  }

  async toggleNoticeStatus(id: string, adminId: string, ipAddress?: string) {
    const notice = await this.prisma.notice.findUnique({ where: { id } });
    if (!notice) throw new NotFoundException('Notice not found');

    const updated = await this.prisma.notice.update({
      where: { id },
      data: { isActive: !notice.isActive },
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'NOTICE_STATUS_TOGGLED',
      details: { noticeId: id, isActive: updated.isActive },
      ipAddress,
    });

    return updated;
  }

  async deleteNotice(id: string, adminId: string, ipAddress?: string) {
    await this.prisma.notice.delete({ where: { id } });

    await this.auditLogService.log({
      userId: adminId,
      action: 'NOTICE_DELETED',
      details: { noticeId: id },
      ipAddress,
    });

    return { message: 'Notice deleted' };
  }
}
