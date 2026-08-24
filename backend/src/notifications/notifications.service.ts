import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  data?: any;
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create an in-app notification
   */
  async createNotification(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        link: dto.link || null,
        data: dto.data || null,
      },
    });
  }

  /**
   * Get notifications for a user with unread count
   */
  async getUserNotifications(userId: string, limit = 20) {
    const [unreadCount, notifications] = await Promise.all([
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    return {
      unreadCount,
      notifications,
    };
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { message: 'All notifications marked as read' };
  }

  /**
   * Delete a single notification for a user
   */
  async deleteNotification(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    return { message: 'Notification deleted successfully' };
  }

  /**
   * Clear all notifications for a specific user
   */
  async clearAllNotifications(userId: string) {
    await this.prisma.notification.deleteMany({
      where: { userId },
    });

    return { message: 'All notifications cleared successfully' };
  }

  /**
   * Broadcast a notification to all active Administrators
   */
  async notifyAdmins(data: { type: NotificationType; title: string; message: string; link?: string; data?: any }) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
    });

    for (const admin of admins) {
      await this.createNotification({
        userId: admin.id,
        type: data.type,
        title: data.title,
        message: data.message,
        link: data.link,
        data: data.data,
      });
    }
  }

  /**
   * Broadcast a notification to all active Tenants
   */
  async notifyAllActiveTenants(data: { type: NotificationType; title: string; message: string; link?: string; data?: any }) {
    const tenants = await this.prisma.user.findMany({
      where: { role: 'TENANT', status: 'ACTIVE' },
    });

    for (const tenant of tenants) {
      await this.createNotification({
        userId: tenant.id,
        type: data.type,
        title: data.title,
        message: data.message,
        link: data.link,
        data: data.data,
      });
    }
  }

  /**
   * Send notification to a specific tenant
   */
  async notifyTenant(tenantId: string, data: { type: NotificationType; title: string; message: string; link?: string; data?: any }) {
    return this.createNotification({
      userId: tenantId,
      type: data.type,
      title: data.title,
      message: data.message,
      link: data.link,
      data: data.data,
    });
  }
}
