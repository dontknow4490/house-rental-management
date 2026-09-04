import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('PaymentsService - Data Integrity & Audit Verification', () => {
  let service: PaymentsService;
  let prismaService: any;
  let nepaliCalendarService: any;

  beforeEach(async () => {
    prismaService = {
      payment: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      monthlyBill: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      waterPurchase: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      digitalReceipt: {
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'rec-1', ...data })),
      },
      tenantProfile: {
        findUnique: jest.fn().mockResolvedValue({ advanceBalance: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          fullName: 'Ram Bahadur',
          username: 'ram',
          tenantProfile: {
            room: { roomNumber: 1 },
          },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    nepaliCalendarService = {
      getCurrentNepaliDate: jest.fn().mockReturnValue({
        yearBS: 2083,
        monthBS: 5,
        dayBS: 15,
        nepaliFormatted: '2083-05-15',
        nepaliFullFormatted: 'Bhadra 15, 2083 BS',
      }),
      parseBsDate: jest.fn().mockImplementation((d: string) => {
        const parts = d.split('-').map(Number);
        return { yearBS: parts[0], monthBS: parts[1], dayBS: parts[2] };
      }),
      toNepaliDigits: jest.fn().mockImplementation((x: number | string) => String(x)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: NepaliCalendarService, useValue: nepaliCalendarService },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: NotificationsService,
          useValue: { createNotification: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('Water Purchase Data Integrity - Section 14 Audit', () => {
    it('should NEVER delete water purchases when verifyPayment settles a bill; it must update isSettled: true', async () => {
      const mockPayment = {
        id: 'pay-101',
        tenantId: 'tenant-1',
        billId: 'bill-1',
        amount: 8000,
        status: 'PENDING_VERIFICATION',
        paymentMethod: 'KHALTI',
        tenant: { fullName: 'Ram Bahadur', username: 'ram' },
        bill: {
          id: 'bill-1',
          yearBS: 2083,
          monthBS: 5,
          totalAmount: 8000,
          room: { roomNumber: 1 },
          billingPeriodBS: '2083 Bhadra',
        },
      };

      prismaService.payment.findUnique.mockResolvedValue(mockPayment);
      prismaService.payment.update.mockResolvedValue({ ...mockPayment, status: 'VERIFIED' });

      // After reconcile, bill balanceDue is 0 (settled)
      prismaService.monthlyBill.findMany
        .mockResolvedValueOnce([
          // In reconcileTenantBillsAndAdvance
          {
            id: 'bill-1',
            yearBS: 2083,
            monthBS: 5,
            totalAmount: 8000,
            paidAmount: 8000,
            balanceDue: 0,
            status: 'PAID',
            roomId: 'room-1',
          },
        ])
        .mockResolvedValueOnce([
          // In Step 6: allPaidBills
          {
            id: 'bill-1',
            yearBS: 2083,
            monthBS: 5,
            totalAmount: 8000,
            paidAmount: 8000,
            balanceDue: 0,
            roomId: 'room-1',
          },
        ]);

      prismaService.payment.findMany.mockResolvedValue([
        { id: 'pay-101', amount: 8000, status: 'VERIFIED' },
      ]);

      await service.verifyPayment('pay-101', { verified: true }, 'admin-1');

      // CRITICAL AUDIT CHECK: deleteMany MUST NOT be called on waterPurchase
      expect(prismaService.waterPurchase.deleteMany).not.toHaveBeenCalled();

      // updateMany MUST be called to mark purchases settled
      expect(prismaService.waterPurchase.updateMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { billId: 'bill-1' },
            { roomId: 'room-1', yearBS: 2083, monthBS: 5 },
          ],
        },
        data: expect.objectContaining({
          isSettled: true,
          settledDateBS: '2083-05-15',
        }),
      });
    });

    it('should NEVER delete water purchases when recordCashPayment settles a bill', async () => {
      const targetBill = {
        id: 'bill-1',
        tenantId: 'tenant-1',
        yearBS: 2083,
        monthBS: 5,
        totalAmount: 8000,
        paidAmount: 0,
        balanceDue: 8000,
        roomId: 'room-1',
        room: { roomNumber: 1 },
      };

      prismaService.monthlyBill.findFirst.mockResolvedValue(targetBill);
      prismaService.payment.create.mockResolvedValue({
        id: 'pay-cash-1',
        tenantId: 'tenant-1',
        amount: 8000,
        status: 'VERIFIED',
      });

      // reconcile finds bill and marks paid
      prismaService.monthlyBill.findMany
        .mockResolvedValueOnce([
          {
            id: 'bill-1',
            yearBS: 2083,
            monthBS: 5,
            totalAmount: 8000,
            paidAmount: 8000,
            balanceDue: 0,
            status: 'PAID',
            roomId: 'room-1',
          },
        ])
        .mockResolvedValueOnce([
          // Step 6: allPaidBills
          {
            id: 'bill-1',
            yearBS: 2083,
            monthBS: 5,
            totalAmount: 8000,
            paidAmount: 8000,
            balanceDue: 0,
            roomId: 'room-1',
          },
        ]);

      prismaService.payment.findMany.mockResolvedValue([
        { id: 'pay-cash-1', amount: 8000, status: 'VERIFIED' },
      ]);

      await service.recordCashPayment(
        {
          tenantId: 'tenant-1',
          amount: 8000,
        },
        'admin-1',
      );

      // CRITICAL AUDIT CHECK: deleteMany MUST NOT be called on waterPurchase
      expect(prismaService.waterPurchase.deleteMany).not.toHaveBeenCalled();

      // updateMany MUST be called to mark purchases settled
      expect(prismaService.waterPurchase.updateMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { billId: 'bill-1' },
            { roomId: 'room-1', yearBS: 2083, monthBS: 5 },
          ],
        },
        data: expect.objectContaining({
          isSettled: true,
          settledDateBS: '2083-05-15',
        }),
      });
    });
  });

  describe('Digital Receipt Collision Resistance - Section 11', () => {
    it('should increment receipt sequence if a receipt number already exists', async () => {
      // First candidate REC-2083-05-0002 already exists
      prismaService.digitalReceipt.findUnique
        .mockResolvedValueOnce({ id: 'existing-rec', receiptNumber: 'REC-2083-05-0002' })
        .mockResolvedValueOnce(null); // Next one REC-2083-05-0003 is available

      const targetBill = {
        id: 'bill-1',
        tenantId: 'tenant-1',
        yearBS: 2083,
        monthBS: 5,
        totalAmount: 5000,
        paidAmount: 0,
        balanceDue: 5000,
        roomId: 'room-1',
        room: { roomNumber: 1 },
      };

      prismaService.monthlyBill.findFirst.mockResolvedValue(targetBill);
      prismaService.payment.create.mockResolvedValue({
        id: 'pay-cash-2',
        tenantId: 'tenant-1',
        amount: 5000,
        status: 'VERIFIED',
      });
      prismaService.monthlyBill.findMany.mockResolvedValue([]);
      prismaService.payment.findMany.mockResolvedValue([]);

      await service.recordCashPayment(
        {
          tenantId: 'tenant-1',
          amount: 5000,
        },
        'admin-1',
      );

      // Receipt must be created with sequence incremented to 0003
      expect(prismaService.digitalReceipt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            receiptNumber: 'REC-2083-05-0003',
          }),
        }),
      );
    });
  });
});
