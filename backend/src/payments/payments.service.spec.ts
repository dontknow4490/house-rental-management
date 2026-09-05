import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { idempotencyStore } from '../common/utils/async-lock.util';

describe('PaymentsService - Data Integrity & Audit Verification', () => {
  let service: PaymentsService;
  let prismaService: any;
  let nepaliCalendarService: any;

  beforeEach(async () => {
    idempotencyStore.clear();
    prismaService = {
      payment: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
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
        aggregate: jest.fn().mockResolvedValue({ _sum: { balanceDue: 0 } }),
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
        findUnique: jest.fn().mockResolvedValue({ id: 'prof-1', advanceBalance: 0 }),
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

  describe('Financial Correctness Fix 1 — Payment Bill Scoping & Reconcile', () => {
    it('Scenario 5: Submitting payment for Bill A marks only Bill A as PENDING_VERIFICATION, while Bills B and C remain UNPAID', async () => {
      const billA = {
        id: 'bill-A',
        tenantId: 'tenant-1',
        yearBS: 2083,
        monthBS: 3,
        totalAmount: 5000,
        paidAmount: 0,
        balanceDue: 5000,
        status: 'UNPAID',
        tenant: { fullName: 'Ram', username: 'ram' },
        room: { roomNumber: 101 },
      };

      prismaService.monthlyBill.findUnique.mockResolvedValue(billA);
      prismaService.payment.create.mockResolvedValue({
        id: 'pay-A',
        billId: 'bill-A',
        tenantId: 'tenant-1',
        amount: 5000,
        status: 'PENDING_VERIFICATION',
      });

      // Tenant submits payment for Bill A
      await service.submitPayment(
        {
          billId: 'bill-A',
          amount: 5000,
          paymentMethod: 'ESEWA',
          transactionId: 'TXN-12345',
          proofImagePath: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        },
        'tenant-1',
      );

      // Verify ONLY Bill A was updated to PENDING_VERIFICATION
      expect(prismaService.monthlyBill.update).toHaveBeenCalledWith({
        where: { id: 'bill-A' },
        data: { status: 'PENDING_VERIFICATION' },
      });
      // Ensure update was not called for other bills or using blanket updateMany
      expect(prismaService.monthlyBill.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'PENDING_VERIFICATION' },
        }),
      );

      // Now verify reconciliation scoping:
      // Bill A has a pending payment, but Bill B and C have NO pending payments
      const allBills = [
        { id: 'bill-A', totalAmount: 5000, yearBS: 2083, monthBS: 3 },
        { id: 'bill-B', totalAmount: 4000, yearBS: 2083, monthBS: 4 },
        { id: 'bill-C', totalAmount: 3000, yearBS: 2083, monthBS: 5 },
      ];
      prismaService.monthlyBill.findMany.mockResolvedValue(allBills);
      prismaService.payment.findMany
        .mockResolvedValueOnce([]) // verifiedPayments = empty
        .mockResolvedValueOnce([{ id: 'pay-A', billId: 'bill-A', status: 'PENDING_VERIFICATION' }]); // pendingPayments

      await service.reconcileTenantBillsAndAdvance('tenant-1');

      // Bill A updated with PENDING_VERIFICATION
      expect(prismaService.monthlyBill.update).toHaveBeenCalledWith({
        where: { id: 'bill-A' },
        data: {
          paidAmount: 0,
          balanceDue: 5000,
          status: 'PENDING_VERIFICATION',
        },
      });

      // Bill B MUST remain UNPAID (not PENDING_VERIFICATION)
      expect(prismaService.monthlyBill.update).toHaveBeenCalledWith({
        where: { id: 'bill-B' },
        data: {
          paidAmount: 0,
          balanceDue: 4000,
          status: 'UNPAID',
        },
      });

      // Bill C MUST remain UNPAID (not PENDING_VERIFICATION)
      expect(prismaService.monthlyBill.update).toHaveBeenCalledWith({
        where: { id: 'bill-C' },
        data: {
          paidAmount: 0,
          balanceDue: 3000,
          status: 'UNPAID',
        },
      });
    });

    it('Scenario 6: Partial payment on one bill correctly allocates paid amount and preserves balanceDue', async () => {
      const allBills = [
        { id: 'bill-1', totalAmount: 10000, yearBS: 2083, monthBS: 1 },
      ];
      prismaService.monthlyBill.findMany.mockResolvedValue(allBills);
      prismaService.payment.findMany
        .mockResolvedValueOnce([{ id: 'pay-partial', amount: 4000, status: 'VERIFIED' }]) // verified payments
        .mockResolvedValueOnce([]); // no pending payments

      await service.reconcileTenantBillsAndAdvance('tenant-1');

      expect(prismaService.monthlyBill.update).toHaveBeenCalledWith({
        where: { id: 'bill-1' },
        data: {
          paidAmount: 4000,
          balanceDue: 6000,
          status: 'PARTIALLY_PAID',
        },
      });
    });

    it('Scenario 7: Payment verification reconciles sequentially and issues digital receipt', async () => {
      const mockPayment = {
        id: 'pay-rec',
        tenantId: 'tenant-1',
        billId: 'bill-1',
        amount: 6000,
        status: 'PENDING_VERIFICATION',
        paymentMethod: 'KHALTI',
        tenant: { fullName: 'Ram Bahadur', username: 'ram' },
        bill: {
          id: 'bill-1',
          yearBS: 2083,
          monthBS: 1,
          totalAmount: 5000,
          room: { roomNumber: 1 },
          billingPeriodBS: '2083 Baisakh',
        },
      };

      prismaService.payment.findUnique.mockResolvedValue(mockPayment);
      prismaService.payment.update.mockResolvedValue({ ...mockPayment, status: 'VERIFIED' });

      // Two bills: bill-1 (5000) and bill-2 (5000)
      prismaService.monthlyBill.findMany.mockResolvedValue([
        { id: 'bill-1', totalAmount: 5000, yearBS: 2083, monthBS: 1 },
        { id: 'bill-2', totalAmount: 5000, yearBS: 2083, monthBS: 2 },
      ]);
      // Verified payments total 6000
      prismaService.payment.findMany
        .mockResolvedValueOnce([{ id: 'pay-rec', amount: 6000, status: 'VERIFIED' }])
        .mockResolvedValueOnce([]); // pending payments

      await service.verifyPayment('pay-rec', { verified: true }, 'admin-1');

      // Bill 1 fully settled (5000 paid, 0 due)
      expect(prismaService.monthlyBill.update).toHaveBeenCalledWith({
        where: { id: 'bill-1' },
        data: {
          paidAmount: 5000,
          balanceDue: 0,
          status: 'PAID',
        },
      });

      // Remaining 1000 applied to Bill 2 (1000 paid, 4000 due, PARTIALLY_PAID)
      expect(prismaService.monthlyBill.update).toHaveBeenCalledWith({
        where: { id: 'bill-2' },
        data: {
          paidAmount: 1000,
          balanceDue: 4000,
          status: 'PARTIALLY_PAID',
        },
      });

      // Advance balance should be 0 since all 6000 was consumed across bills
      expect(prismaService.tenantProfile.update).toHaveBeenCalledWith({
        where: { id: expect.anything() },
        data: { advanceBalance: 0 },
      });
    });

    it('Scenario 8: Existing financial invariant totalAmount = paidAmount + balanceDue holds strictly', async () => {
      const testCases = [
        { total: 5000, verified: 0, expectedPaid: 0, expectedDue: 5000, status: 'UNPAID' },
        { total: 5000, verified: 2000, expectedPaid: 2000, expectedDue: 3000, status: 'PARTIALLY_PAID' },
        { total: 5000, verified: 5000, expectedPaid: 5000, expectedDue: 0, status: 'PAID' },
        { total: 5000, verified: 7500, expectedPaid: 5000, expectedDue: 0, status: 'PAID' },
      ];

      for (const tc of testCases) {
        prismaService.monthlyBill.findMany.mockResolvedValue([
          { id: 'inv-bill', totalAmount: tc.total, yearBS: 2083, monthBS: 1 },
        ]);
        prismaService.payment.findMany
          .mockResolvedValueOnce(tc.verified > 0 ? [{ id: 'p', amount: tc.verified, status: 'VERIFIED' }] : [])
          .mockResolvedValueOnce([]);

        await service.reconcileTenantBillsAndAdvance('tenant-1');

        expect(prismaService.monthlyBill.update).toHaveBeenCalledWith({
          where: { id: 'inv-bill' },
          data: {
            paidAmount: tc.expectedPaid,
            balanceDue: tc.expectedDue,
            status: tc.status,
          },
        });

        // Invariant check
        expect(tc.expectedPaid + tc.expectedDue).toBe(tc.total);
      }
    });
  });

  describe('Financial Correctness Fix 2 — True Client-Driven Idempotency', () => {
    it('Test C: Two identical cash payments with DIFFERENT idempotency keys result in 2 legitimate payments', async () => {
      const targetBill = {
        id: 'bill-diff-cash',
        tenantId: 'tenant-1',
        yearBS: 2083,
        monthBS: 5,
        totalAmount: 10000,
        paidAmount: 0,
        balanceDue: 10000,
        roomId: 'room-1',
        room: { roomNumber: 1 },
      };

      prismaService.monthlyBill.findUnique.mockResolvedValue(targetBill);
      prismaService.monthlyBill.findFirst.mockResolvedValue(targetBill);
      prismaService.monthlyBill.findMany.mockResolvedValue([]);
      prismaService.payment.findMany.mockResolvedValue([]);

      let paymentCounter = 0;
      prismaService.payment.create.mockImplementation(({ data }) => {
        paymentCounter++;
        return Promise.resolve({
          id: `pay-cash-${paymentCounter}`,
          ...data,
          digitalReceipt: { id: `rec-${paymentCounter}`, receiptNumber: `REC-2083-05-000${paymentCounter}` },
        });
      });

      const payload1 = {
        tenantId: 'tenant-1',
        billId: 'bill-diff-cash',
        amount: 2000,
        paymentDateBS: '2083-05-15',
        idempotencyKey: 'cash-key-1',
      };

      const payload2 = {
        tenantId: 'tenant-1',
        billId: 'bill-diff-cash',
        amount: 2000,
        paymentDateBS: '2083-05-15',
        idempotencyKey: 'cash-key-2', // Different key
      };

      const res1 = await service.recordCashPayment(payload1, 'admin-1');
      const res2 = await service.recordCashPayment(payload2, 'admin-1');

      // Both payments were processed legitimately
      expect(prismaService.payment.create).toHaveBeenCalledTimes(2);
      expect(res1.payment.id).toBe('pay-cash-1');
      expect(res2.payment.id).toBe('pay-cash-2');
    });

    it('Test D: Two identical tenant payment submissions with DIFFERENT idempotency keys result in 2 separate submissions', async () => {
      const targetBill = {
        id: 'bill-diff-sub',
        tenantId: 'tenant-1',
        yearBS: 2083,
        monthBS: 5,
        totalAmount: 8000,
        paidAmount: 0,
        balanceDue: 8000,
        roomId: 'room-1',
        room: { roomNumber: 1 },
        tenant: { fullName: 'Ram', username: 'ram' },
      };

      prismaService.monthlyBill.findUnique.mockResolvedValue(targetBill);

      let subCounter = 0;
      prismaService.payment.create.mockImplementation(({ data }) => {
        subCounter++;
        return Promise.resolve({
          id: `pay-sub-${subCounter}`,
          ...data,
        });
      });

      const payload1 = {
        billId: 'bill-diff-sub',
        amount: 4000,
        paymentMethod: 'ESEWA' as const,
        transactionId: 'TXN-901',
        proofImagePath: 'https://res.cloudinary.com/demo/image/upload/rec1.png',
        idempotencyKey: 'sub-key-1',
      };

      const payload2 = {
        billId: 'bill-diff-sub',
        amount: 4000,
        paymentMethod: 'ESEWA' as const,
        transactionId: 'TXN-902',
        proofImagePath: 'https://res.cloudinary.com/demo/image/upload/rec2.png',
        idempotencyKey: 'sub-key-2', // Different key
      };

      const res1 = await service.submitPayment(payload1, 'tenant-1');
      const res2 = await service.submitPayment(payload2, 'tenant-1');

      // Both submissions were created
      expect(prismaService.payment.create).toHaveBeenCalledTimes(2);
      expect(res1.payment.id).toBe('pay-sub-1');
      expect(res2.payment.id).toBe('pay-sub-2');
    });

    it('Test E: Two identical cash payments with SAME idempotency key via Promise.all result in exactly 1 payment', async () => {
      const targetBill = {
        id: 'bill-concurrent-cash',
        tenantId: 'tenant-1',
        yearBS: 2083,
        monthBS: 5,
        totalAmount: 5000,
        paidAmount: 0,
        balanceDue: 5000,
        roomId: 'room-1',
        room: { roomNumber: 1 },
      };

      prismaService.monthlyBill.findUnique.mockResolvedValue(targetBill);
      prismaService.monthlyBill.findFirst.mockResolvedValue(targetBill);
      prismaService.monthlyBill.findMany.mockResolvedValue([]);
      prismaService.payment.findMany.mockResolvedValue([]);

      prismaService.payment.create.mockImplementation(({ data }) => {
        return Promise.resolve({
          id: 'pay-concurrent-1',
          ...data,
          digitalReceipt: { id: 'rec-1', receiptNumber: 'REC-2083-05-0001' },
        });
      });

      const payload = {
        tenantId: 'tenant-1',
        billId: 'bill-concurrent-cash',
        amount: 5000,
        paymentDateBS: '2083-05-15',
        idempotencyKey: 'cash-same-key-concurrent',
      };

      // Fire 2 concurrent requests simultaneously with the same key
      const [res1, res2] = await Promise.all([
        service.recordCashPayment(payload, 'admin-1'),
        service.recordCashPayment(payload, 'admin-1'),
      ]);

      // Exactly ONE payment record created in DB
      expect(prismaService.payment.create).toHaveBeenCalledTimes(1);

      // Both requests resolve with identical payment ID
      expect(res1.payment.id).toBe('pay-concurrent-1');
      expect(res2.payment.id).toBe('pay-concurrent-1');
    });

    it('Test E (Tenant): Two identical tenant payment submissions with SAME idempotency key via Promise.all result in exactly 1 creation', async () => {
      const targetBill = {
        id: 'bill-concurrent-sub',
        tenantId: 'tenant-1',
        yearBS: 2083,
        monthBS: 5,
        totalAmount: 5000,
        paidAmount: 0,
        balanceDue: 5000,
        roomId: 'room-1',
        room: { roomNumber: 1 },
        tenant: { fullName: 'Ram', username: 'ram' },
      };

      prismaService.monthlyBill.findUnique.mockResolvedValue(targetBill);

      prismaService.payment.create.mockImplementation(({ data }) => {
        return Promise.resolve({
          id: 'pay-sub-1',
          ...data,
        });
      });

      const payload = {
        billId: 'bill-concurrent-sub',
        amount: 5000,
        paymentMethod: 'ESEWA' as const,
        transactionId: 'CONCURRENT-TXN-999',
        proofImagePath: 'https://res.cloudinary.com/demo/image/upload/receipt.png',
        idempotencyKey: 'tenant-same-key-concurrent',
      };

      // Fire 2 concurrent submissions simultaneously
      const [res1, res2] = await Promise.all([
        service.submitPayment(payload, 'tenant-1'),
        service.submitPayment(payload, 'tenant-1'),
      ]);

      // Exactly ONE payment was created
      expect(prismaService.payment.create).toHaveBeenCalledTimes(1);

      // Both callers receive the payment
      expect(res1.payment.id).toBe('pay-sub-1');
      expect(res2.payment.id).toBe('pay-sub-1');
    });

    it('Test F: Cash payment request retried with SAME key returns cached payment without double-crediting', async () => {
      const targetBill = {
        id: 'bill-retry-cash',
        tenantId: 'tenant-1',
        yearBS: 2083,
        monthBS: 5,
        totalAmount: 5000,
        paidAmount: 0,
        balanceDue: 5000,
        roomId: 'room-1',
        room: { roomNumber: 1 },
      };

      prismaService.monthlyBill.findUnique.mockResolvedValue(targetBill);
      prismaService.monthlyBill.findFirst.mockResolvedValue(targetBill);
      prismaService.monthlyBill.findMany.mockResolvedValue([]);
      prismaService.payment.findMany.mockResolvedValue([]);

      prismaService.payment.create.mockImplementation(({ data }) => {
        return Promise.resolve({
          id: 'pay-cash-retry',
          ...data,
          digitalReceipt: { id: 'rec-retry', receiptNumber: 'REC-2083-05-0099' },
        });
      });

      const payload = {
        tenantId: 'tenant-1',
        billId: 'bill-retry-cash',
        amount: 3000,
        paymentDateBS: '2083-05-15',
        idempotencyKey: 'cash-retry-key-123',
      };

      const res1 = await service.recordCashPayment(payload, 'admin-1');
      expect(prismaService.payment.create).toHaveBeenCalledTimes(1);

      // Retry of the same request
      const res2 = await service.recordCashPayment(payload, 'admin-1');
      expect(prismaService.payment.create).toHaveBeenCalledTimes(1);
      expect(res2.payment.id).toBe(res1.payment.id);
    });
  });
});
