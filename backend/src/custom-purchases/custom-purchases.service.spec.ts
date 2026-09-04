import { Test, TestingModule } from '@nestjs/testing';
import { CustomPurchasesService } from './custom-purchases.service';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BillingService } from '../billing/billing.service';

describe('CustomPurchasesService', () => {
  let service: CustomPurchasesService;
  let prismaService: any;
  let billingService: any;

  beforeEach(async () => {
    prismaService = {
      room: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'room-1',
          roomNumber: 1,
          tenantProfiles: [{ userId: 'tenant-1', status: 'ACTIVE' }],
        }),
      },
      customPurchase: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cp-1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'cp-1',
          roomId: 'room-1',
          itemName: 'Momo',
          quantity: 2,
          unitPrice: 120,
          totalAmount: 240,
          yearBS: 2083,
          monthBS: 5,
        }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cp-1', ...data })),
        delete: jest.fn().mockResolvedValue({ id: 'cp-1' }),
      },
      $transaction: jest.fn().mockImplementation((cb) =>
        typeof cb === 'function' ? cb(prismaService) : Promise.all(cb)
      ),
    };

    billingService = {
      generateMonthlyBills: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomPurchasesService,
        NepaliCalendarService,
        { provide: PrismaService, useValue: prismaService },
        { provide: BillingService, useValue: billingService },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get<CustomPurchasesService>(CustomPurchasesService);
  });

  describe('Quantity and Unit Price Calculation Cases', () => {
    it('Case 1: Unit price Rs.120, quantity 1 -> totalAmount Rs.120', async () => {
      const result = await service.addPurchase(
        {
          roomId: 'room-1',
          itemName: 'Momo',
          unitPrice: 120,
          quantity: 1,
          yearBS: 2083,
          monthBS: 5,
        },
        'admin-1',
      );

      expect(result.quantity).toBe(1);
      expect(result.unitPrice).toBe(120);
      expect(result.totalAmount).toBe(120);
      expect(billingService.generateMonthlyBills).toHaveBeenCalledWith(
        { roomId: 'room-1', yearBS: 2083, monthBS: 5 },
        'admin-1',
        undefined,
      );
    });

    it('Case 2: Unit price Rs.120, quantity 2 -> totalAmount Rs.240', async () => {
      const result = await service.addPurchase(
        {
          roomId: 'room-1',
          itemName: 'Momo',
          unitPrice: 120,
          quantity: 2,
          yearBS: 2083,
          monthBS: 5,
        },
        'admin-1',
      );

      expect(result.quantity).toBe(2);
      expect(result.unitPrice).toBe(120);
      expect(result.totalAmount).toBe(240);
    });

    it('Case 3: Unit price Rs.120, quantity 3 -> totalAmount Rs.360', async () => {
      const result = await service.addPurchase(
        {
          roomId: 'room-1',
          itemName: 'Momo',
          unitPrice: 120,
          quantity: 3,
          yearBS: 2083,
          monthBS: 5,
        },
        'admin-1',
      );

      expect(result.quantity).toBe(3);
      expect(result.unitPrice).toBe(120);
      expect(result.totalAmount).toBe(360);
    });

    it('Case 4: Update purchase quantity from 2 to 3 -> recalculates totalAmount to Rs.360', async () => {
      const result = await service.updatePurchase(
        'cp-1',
        {
          quantity: 3,
          unitPrice: 120,
        },
        'admin-1',
      );

      expect(result.quantity).toBe(3);
      expect(result.unitPrice).toBe(120);
      expect(result.totalAmount).toBe(360);
      expect(billingService.generateMonthlyBills).toHaveBeenCalled();
    });
  });

  describe('Transactional Multi-Item Batch Purchases', () => {
    it('Case 1: Atomically creates multiple items with quantity * unitPrice and returns correct grandTotal', async () => {
      const batchDto = {
        roomId: 'room-1',
        yearBS: 2083,
        monthBS: 5,
        items: [
          { itemName: 'Momo', quantity: 2, unitPrice: 150 }, // 300
          { itemName: 'Chowmein', quantity: 1, unitPrice: 120 }, // 120
          { itemName: 'Cold Drink', quantity: 3, unitPrice: 80 }, // 240
        ],
      };

      const result = await service.addBatchPurchases(batchDto, 'admin-1');

      expect(prismaService.$transaction).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(3);
      expect(result.items[0].totalAmount).toBe(300);
      expect(result.items[1].totalAmount).toBe(120);
      expect(result.items[2].totalAmount).toBe(240);
      expect(result.grandTotal).toBe(300 + 120 + 240); // 660

      // Verified monthly bill recalculation only occurs once after full batch persistence
      expect(billingService.generateMonthlyBills).toHaveBeenCalledTimes(1);
      expect(billingService.generateMonthlyBills).toHaveBeenCalledWith(
        { roomId: 'room-1', yearBS: 2083, monthBS: 5 },
        'admin-1',
        undefined,
      );
    });

    it('Case 2: Pre-validates all items and throws error without creating any items if item 3 is invalid', async () => {
      const invalidBatchDto = {
        roomId: 'room-1',
        yearBS: 2083,
        monthBS: 5,
        items: [
          { itemName: 'Momo', quantity: 2, unitPrice: 150 },
          { itemName: 'Chowmein', quantity: 1, unitPrice: 120 },
          { itemName: '', quantity: 2, unitPrice: 100 }, // Invalid: empty name
        ],
      };

      await expect(service.addBatchPurchases(invalidBatchDto, 'admin-1')).rejects.toThrow(
        /Item #3: Item name cannot be empty/
      );

      // Verify no database creation was performed
      expect(prismaService.customPurchase.create).not.toHaveBeenCalled();
      // Verify monthly bill recalculation was NOT triggered
      expect(billingService.generateMonthlyBills).not.toHaveBeenCalled();
    });

    it('Case 3: Fails and does not persist if quantity or unitPrice is <= 0', async () => {
      const invalidBatchDto = {
        roomId: 'room-1',
        yearBS: 2083,
        monthBS: 5,
        items: [
          { itemName: 'Momo', quantity: 0, unitPrice: 150 }, // Invalid quantity
        ],
      };

      await expect(service.addBatchPurchases(invalidBatchDto, 'admin-1')).rejects.toThrow(
        /Quantity must be a positive integer/
      );
    });

    it('Case 4: Rolls back entire batch if transaction fails on item 3', async () => {
      prismaService.$transaction.mockRejectedValueOnce(
        new Error('Database transaction constraint failure on item 3')
      );

      const batchDto = {
        roomId: 'room-1',
        yearBS: 2083,
        monthBS: 5,
        items: [
          { itemName: 'Item 1', quantity: 1, unitPrice: 100 },
          { itemName: 'Item 2', quantity: 1, unitPrice: 100 },
          { itemName: 'Item 3', quantity: 1, unitPrice: 100 },
        ],
      };

      await expect(service.addBatchPurchases(batchDto, 'admin-1')).rejects.toThrow(
        'Database transaction constraint failure on item 3'
      );

      // Monthly bills must never be generated on failed transaction
      expect(billingService.generateMonthlyBills).not.toHaveBeenCalled();
    });
  });
});
