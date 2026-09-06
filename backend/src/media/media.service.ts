import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface MediaItem {
  id: string;
  publicId: string;
  category: 'ESEWA_QR' | 'BANK_QR' | 'PAYMENT_PROOF' | 'MAINTENANCE_PHOTO' | 'CITIZENSHIP_DOC' | 'UNCATEGORIZED';
  categoryLabel: string;
  url: string;
  isPrivate: boolean;
  isReferenced: boolean;
  referencedBy?: string;
  createdAt?: Date | string;
  details?: Record<string, any>;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private auditLogService: AuditLogService,
  ) {}

  /**
   * Scans actual Cloudinary API resources and correlates with database references
   */
  async getMediaAudit() {
    const dbReferencesMap = new Map<string, { category: MediaItem['category']; label: string; refText: string; isPrivate: boolean }>();

    // 1. System Settings QR Codes
    const settings = await this.prisma.systemSetting.findMany({
      where: {
        key: { in: ['ESEWA_QR_IMAGE', 'BANK_QR_IMAGE'] },
      },
    });

    for (const setting of settings) {
      if (setting.value && setting.value.trim() !== '') {
        const isEsewa = setting.key === 'ESEWA_QR_IMAGE';
        const publicId = this.cloudinaryService.extractPublicId(setting.value);
        if (publicId) {
          dbReferencesMap.set(publicId, {
            category: isEsewa ? 'ESEWA_QR' : 'BANK_QR',
            label: isEsewa ? 'eSewa QR Code' : 'Bank Transfer QR Code',
            refText: `System Setting (${setting.key})`,
            isPrivate: false,
          });
        }
      }
    }

    // 2. Payments Proof Images
    const payments = await this.prisma.payment.findMany({
      where: { proofImagePath: { not: null } },
      select: {
        id: true,
        proofImagePath: true,
        receiptNumber: true,
        amount: true,
        createdAt: true,
        tenant: { select: { fullName: true } },
      },
    });

    for (const p of payments) {
      if (p.proofImagePath) {
        const publicId = this.cloudinaryService.extractPublicId(p.proofImagePath);
        if (publicId) {
          dbReferencesMap.set(publicId, {
            category: 'PAYMENT_PROOF',
            label: 'Payment Proof Screenshot',
            refText: `Payment (${p.receiptNumber || p.id}) - ${p.tenant?.fullName || 'Tenant'} (NPR ${p.amount})`,
            isPrivate: true,
          });
        }
      }
    }

    // 3. Maintenance Request Photos
    const maintenance = await this.prisma.maintenanceRequest.findMany({
      where: { photoPath: { not: null } },
      select: {
        id: true,
        title: true,
        photoPath: true,
        createdAt: true,
        room: { select: { roomNumber: true } },
      },
    });

    for (const m of maintenance) {
      if (m.photoPath) {
        const publicId = this.cloudinaryService.extractPublicId(m.photoPath);
        if (publicId) {
          dbReferencesMap.set(publicId, {
            category: 'MAINTENANCE_PHOTO',
            label: 'Maintenance Request Photo',
            refText: `Maintenance Request (Room ${m.room?.roomNumber || '?'}) - ${m.title}`,
            isPrivate: true,
          });
        }
      }
    }

    // 4. Tenant Citizenship Documents
    const profiles = await this.prisma.tenantProfile.findMany({
      where: { citizenshipDocPath: { not: null } },
      select: {
        id: true,
        citizenshipDocPath: true,
        createdAt: true,
        user: { select: { fullName: true } },
        room: { select: { roomNumber: true } },
      },
    });

    for (const prof of profiles) {
      if (prof.citizenshipDocPath) {
        const publicId = this.cloudinaryService.extractPublicId(prof.citizenshipDocPath);
        if (publicId) {
          dbReferencesMap.set(publicId, {
            category: 'CITIZENSHIP_DOC',
            label: 'Citizenship ID Document',
            refText: `Tenant Citizenship (${prof.user?.fullName || 'Tenant'}, Room ${prof.room?.roomNumber || '?'})`,
            isPrivate: true,
          });
        }
      }
    }

    // Fetch actual resources directly from Cloudinary API
    const actualCloudinaryResources = await this.cloudinaryService.listAllCloudinaryResources('house-rental/');
    const items: MediaItem[] = [];
    const processedPublicIds = new Set<string>();

    // A. Add actual Cloudinary resources
    for (const res of actualCloudinaryResources) {
      const publicId = res.public_id;
      processedPublicIds.add(publicId);

      const dbMeta = dbReferencesMap.get(publicId);
      const isPrivate = res.accessType === 'private' || (dbMeta ? dbMeta.isPrivate : true);

      let url = res.secure_url || '';
      if (isPrivate && this.cloudinaryService.isConfigured()) {
        try {
          url = this.cloudinaryService.generateSignedUrl(publicId, 3600);
        } catch {
          url = res.secure_url || '';
        }
      }

      // Infer category from folder structure if not in DB
      let category: MediaItem['category'] = dbMeta?.category || 'UNCATEGORIZED';
      let categoryLabel = dbMeta?.label || 'Application Asset';
      if (!dbMeta) {
        if (publicId.includes('/qr/')) {
          category = 'ESEWA_QR';
          categoryLabel = 'QR Code Asset';
        } else if (publicId.includes('/proofs/')) {
          category = 'PAYMENT_PROOF';
          categoryLabel = 'Payment Proof Screenshot';
        } else if (publicId.includes('/maintenance/')) {
          category = 'MAINTENANCE_PHOTO';
          categoryLabel = 'Maintenance Request Photo';
        } else if (publicId.includes('/citizenship/')) {
          category = 'CITIZENSHIP_DOC';
          categoryLabel = 'Citizenship ID Document';
        }
      }

      items.push({
        id: publicId,
        publicId,
        category,
        categoryLabel,
        url,
        isPrivate,
        isReferenced: !!dbMeta,
        referencedBy: dbMeta ? dbMeta.refText : 'None (Orphaned File)',
        createdAt: res.created_at || new Date().toISOString(),
      });
    }

    // B. Add database-referenced items that were not returned by Cloudinary API scan (e.g. fallback local files)
    for (const [publicId, dbMeta] of dbReferencesMap.entries()) {
      if (!processedPublicIds.has(publicId)) {
        let url = publicId;
        if (dbMeta.isPrivate && publicId.includes('cloudinary.com') && this.cloudinaryService.isConfigured()) {
          try {
            url = this.cloudinaryService.generateSignedUrl(publicId, 3600);
          } catch {
            url = publicId;
          }
        }
        items.push({
          id: publicId,
          publicId,
          category: dbMeta.category,
          categoryLabel: dbMeta.label,
          url,
          isPrivate: dbMeta.isPrivate,
          isReferenced: true,
          referencedBy: dbMeta.refText,
        });
      }
    }

    const referencedCount = items.filter((i) => i.isReferenced).length;
    const orphanedCount = items.filter((i) => !i.isReferenced).length;

    return {
      stats: {
        totalFiles: items.length,
        referencedFiles: referencedCount,
        orphanedFiles: orphanedCount,
        publicFiles: items.filter((i) => !i.isPrivate).length,
        privateFiles: items.filter((i) => i.isPrivate).length,
      },
      media: items,
    };
  }

  /**
   * Safely deletes a Cloudinary asset with reference verification and path restriction
   */
  async deleteMediaItem(publicId: string, force: boolean, adminUserId: string, ipAddress?: string) {
    if (!publicId) {
      throw new BadRequestException('Media public ID is required');
    }

    // Security restriction: prevent path traversal or deleting assets outside house-rental/ folder
    if (!publicId.startsWith('house-rental/')) {
      throw new BadRequestException('Invalid public ID prefix. Deletion is restricted to application assets under house-rental/');
    }

    const audit = await this.getMediaAudit();
    const targetItem = audit.media.find(
      (i) => i.publicId === publicId || i.url.includes(publicId),
    );

    if (targetItem && targetItem.isReferenced && !force) {
      throw new BadRequestException(
        `File is currently referenced by ${targetItem.referencedBy}. Set force=true to override and delete.`,
      );
    }

    const resourceType = 'image';
    const isPrivate = targetItem?.isPrivate ?? true;
    const accessType = isPrivate ? 'authenticated' : 'upload';

    const result = await this.cloudinaryService.deleteAsset(publicId, resourceType, accessType);

    await this.auditLogService.log({
      userId: adminUserId,
      action: 'MEDIA_ASSET_DELETED',
      details: { publicId, category: targetItem?.category, referencedBy: targetItem?.referencedBy, force },
      ipAddress,
    });

    return {
      message: 'Media asset deleted successfully',
      publicId,
      result,
    };
  }
}
