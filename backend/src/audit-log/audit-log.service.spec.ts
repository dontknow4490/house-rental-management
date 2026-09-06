import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prismaService: any;

  beforeEach(async () => {
    prismaService = {
      auditLog: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'log-1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  describe('Pagination and Filtering', () => {
    it('returns paginated data with correct totalPages count', async () => {
      prismaService.auditLog.findMany.mockResolvedValue([
        { id: 'l-1', action: 'ROOM_CREATED', details: '{"roomNumber":7}' },
      ]);
      prismaService.auditLog.count.mockResolvedValue(45);

      const result = await service.getLogs({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(45);
      expect(result.totalPages).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('Safe Audit Log Purge Safeguards', () => {
    it('requires explicit filter or confirmation before deleting logs', async () => {
      await expect(service.deleteLogs({}, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('logs AUDIT_LOGS_PURGED before executing deleteMany', async () => {
      const result = await service.deleteLogs({ olderThanDays: 30 }, 'admin-1', '127.0.0.1');

      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin-1',
          action: 'AUDIT_LOGS_PURGED',
        }),
      });
      expect(prismaService.auditLog.deleteMany).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.count).toBe(5);
    });
  });
});
