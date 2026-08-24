import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
  ) {}

  async saveCitizenshipDoc(
    tenantId: string,
    filePath?: string,
    citizenshipNumber?: string,
    adminId?: string,
    ipAddress?: string,
  ) {
    const profile = await this.prisma.tenantProfile.findUnique({
      where: { userId: tenantId },
    });

    if (!profile) {
      throw new NotFoundException('Tenant profile not found');
    }

    const data: any = {};
    if (filePath) {
      data.citizenshipDocPath = filePath;
    }
    if (citizenshipNumber !== undefined) {
      data.citizenshipNumber = citizenshipNumber ? citizenshipNumber.trim() : null;
    }

    const updated = await this.prisma.tenantProfile.update({
      where: { userId: tenantId },
      data,
    });

    await this.auditLogService.log({
      userId: adminId,
      action: 'TENANT_CITIZENSHIP_SAVED',
      details: { tenantId, filePath, citizenshipNumber },
      ipAddress,
    });

    return updated;
  }

  async getCitizenshipDoc(tenantId: string) {
    const profile = await this.prisma.tenantProfile.findUnique({
      where: { userId: tenantId },
      select: {
        id: true,
        citizenshipNumber: true,
        citizenshipDocPath: true,
        user: { select: { fullName: true, username: true } },
      },
    });

    if (!profile || !profile.citizenshipDocPath) {
      throw new NotFoundException('Citizenship document not found for this tenant');
    }

    return profile;
  }
}
