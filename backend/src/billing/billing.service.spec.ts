import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('BillingService', () => {
  let service: BillingService;
  let prismaService: any;
  let settingsService: any;

  beforeEach(async () => {
    prismaService = {
      room: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'room-1',
            roomNumber: 1,
            defaultRent: 6000,
            tenantProfiles: [
              {
                userId: 'tenant-1',
                numberOfPeople: 1,
                monthlyRent: 6000,
                status: 'ACTIVE',
              },
            ],
            electricityReadings: [
              {
                unitsUsed: 80,
                unitRate: 15,
                totalCharge: 1200,
              },
            ],
            waterPurchases: [
              {
                totalAmount: 90,
              },
            ],
            adjustments: [],
          },
        ]),
      },
      waterPurchase: {
        findMany: jest.fn().mockResolvedValue([
          {
            totalAmount: 90,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customPurchase: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      monthlyBill: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
        update: jest.fn().mockResolvedValue({}),
      },
      tenantProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1', advanceBalance: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      electricityReading: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      adjustment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    settingsService = {
      getNumberSetting: jest.fn().mockImplementation((key, def) => {
        if (key === 'INTERNET_PER_PERSON_RATE') return 250;
        return def;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        NepaliCalendarService,
        { provide: PrismaService, useValue: prismaService },
        { provide: SettingsService, useValue: settingsService },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  it('should accurately calculate total monthly bill: Rent (6000) + Internet (250) + Electricity (1200) + Garbage (100) + Water (90) = 7640', async () => {
    const result = await service.generateMonthlyBills(
      { yearBS: 2083, monthBS: 5 },
      'admin-1',
    );

    expect(result.bills.length).toBe(1);
    const bill = result.bills[0];
    expect(bill.rentAmount).toBe(6000);
    expect(bill.internetAmount).toBe(250);
    expect(bill.electricityAmount).toBe(1200);
    expect(bill.garbageAmount).toBe(100);
    expect(bill.waterAmount).toBe(90);
    expect(bill.totalAmount).toBe(7640);
    expect(bill.balanceDue).toBe(7640);
    expect(bill.status).toBe('UNPAID');
  });

  describe('Custom Purchases Exact Unit Price * Quantity Tests', () => {
    it('Case 1: Unit price Rs.120, quantity 1 -> customPurchasesAmount Rs.120', async () => {
      prismaService.customPurchase.findMany.mockResolvedValue([
        {
          id: 'cp-1',
          itemName: 'Momo',
          quantity: 1,
          unitPrice: 120,
          totalAmount: 120,
        },
      ]);

      const result = await service.generateMonthlyBills(
        { yearBS: 2083, monthBS: 5 },
        'admin-1',
      );

      const bill = result.bills[0];
      expect(bill.customPurchasesAmount).toBe(120);
      expect(bill.totalAmount).toBe(7640 + 120); // 7760
    });

    it('Case 2: Unit price Rs.120, quantity 2 -> customPurchasesAmount Rs.240', async () => {
      prismaService.customPurchase.findMany.mockResolvedValue([
        {
          id: 'cp-1',
          itemName: 'Momo',
          quantity: 2,
          unitPrice: 120,
          totalAmount: 240,
        },
      ]);

      const result = await service.generateMonthlyBills(
        { yearBS: 2083, monthBS: 5 },
        'admin-1',
      );

      const bill = result.bills[0];
      expect(bill.customPurchasesAmount).toBe(240);
      expect(bill.totalAmount).toBe(7640 + 240); // 7880
    });

    it('Case 3: Unit price Rs.120, quantity 3 -> customPurchasesAmount Rs.360', async () => {
      prismaService.customPurchase.findMany.mockResolvedValue([
        {
          id: 'cp-1',
          itemName: 'Momo',
          quantity: 3,
          unitPrice: 120,
          totalAmount: 360,
        },
      ]);

      const result = await service.generateMonthlyBills(
        { yearBS: 2083, monthBS: 5 },
        'admin-1',
      );

      const bill = result.bills[0];
      expect(bill.customPurchasesAmount).toBe(360);
      expect(bill.totalAmount).toBe(7640 + 360); // 8000
    });

    it('Case 4 & 5: Tenant with rent already fully paid + Momo Rs.120 x 2 -> outstanding increases by exactly Rs.240 without modifying payments', async () => {
      const baseRentTotal = 7000;
      prismaService.room.findMany.mockResolvedValue([
        {
          id: 'room-1',
          roomNumber: 1,
          defaultRent: 6000,
          tenantProfiles: [
            {
              userId: 'tenant-1',
              numberOfPeople: 1,
              monthlyRent: 6000,
              status: 'ACTIVE',
            },
          ],
          electricityReadings: [{ totalCharge: 150, unitsUsed: 10, unitRate: 15 }],
          waterPurchases: [],
          adjustments: [],
        },
      ]);
      prismaService.waterPurchase.findMany.mockResolvedValue([]);

      // Before purchase: Bill total is 7000
      // With custom purchase of Momo 120 x 2 = 240:
      prismaService.customPurchase.findMany.mockResolvedValue([
        {
          id: 'cp-1',
          itemName: 'Momo',
          quantity: 2,
          unitPrice: 120,
          totalAmount: 240,
        },
      ]);

      // Tenant has already made a verified payment equal to the base bill (6500)
      prismaService.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          amount: 6500,
          status: 'VERIFIED',
        },
      ]);

      // MonthlyBill already existed with paidAmount 6500, balanceDue 0
      prismaService.monthlyBill.findUnique
        .mockResolvedValueOnce({
          id: 'bill-1',
          billNumber: 'BILL-2083-05-R1',
          totalAmount: 6500,
          paidAmount: 6500,
          balanceDue: 0,
          status: 'PAID',
        })
        .mockResolvedValue({
          id: 'bill-1',
          billNumber: 'BILL-2083-05-R1',
          rentAmount: 6000,
          internetAmount: 250,
          electricityAmount: 150,
          garbageAmount: 100,
          waterAmount: 0,
          adjustmentsAmount: 0,
          customPurchasesAmount: 240,
          totalAmount: 6740,
          paidAmount: 6500,
          balanceDue: 240,
          status: 'PARTIALLY_PAID',
        });

      // Mock findMany for reconcile
      prismaService.monthlyBill.findMany.mockResolvedValue([
        {
          id: 'bill-1',
          yearBS: 2083,
          monthBS: 5,
          totalAmount: 6500 + 240, // 6740
          paidAmount: 6500,
          balanceDue: 240,
          status: 'PARTIALLY_PAID',
        },
      ]);

      const result = await service.generateMonthlyBills(
        { yearBS: 2083, monthBS: 5 },
        'admin-1',
      );

      const bill = result.bills[0];
      expect(bill.customPurchasesAmount).toBe(240);
      expect(bill.totalAmount).toBe(6500 + 240); // 6740
      // Base rent and other items remained untouched
      expect(bill.rentAmount).toBe(6000);
      expect(bill.internetAmount).toBe(250);
      expect(bill.electricityAmount).toBe(150);
      expect(bill.garbageAmount).toBe(100);
    });
  });

  describe('Room 2 / Multi-Month Breakdown Contract Regression Tests', () => {
    it('MUST return numeric balanceDue, totalDue, totalOutstanding, totalAmount, paidAmount (never NaN, null, undefined, or Infinity)', async () => {
      // Setup Room 2 with 2 unpaid monthly bills
      const mockBills = [
        {
          id: 'bill-room2-month1',
          billNumber: 'BILL-2083-04-R2',
          yearBS: 2083,
          monthBS: 4,
          roomId: 'room-2',
          tenantId: 'tenant-2',
          rentAmount: 5500,
          electricityAmount: 450,
          waterAmount: 100,
          internetAmount: 250,
          garbageAmount: 100,
          adjustmentsAmount: 0,
          customPurchasesAmount: 0,
          totalAmount: 6400,
          paidAmount: 0,
          balanceDue: 6400,
          status: 'UNPAID',
          room: { id: 'room-2', roomNumber: 2, name: 'Room 2' },
          tenant: { id: 'tenant-2', fullName: 'Bikash Thapa', phone: '9812345678' },
          payments: [],
          customPurchases: [],
          adjustments: [],
          waterPurchases: [],
        },
        {
          id: 'bill-room2-month2',
          billNumber: 'BILL-2083-05-R2',
          yearBS: 2083,
          monthBS: 5,
          roomId: 'room-2',
          tenantId: 'tenant-2',
          rentAmount: 5500,
          electricityAmount: 600,
          waterAmount: 100,
          internetAmount: 250,
          garbageAmount: 100,
          adjustmentsAmount: 0,
          customPurchasesAmount: 200,
          totalAmount: 6650,
          paidAmount: 1000,
          balanceDue: 5650,
          status: 'PARTIALLY_PAID',
          room: { id: 'room-2', roomNumber: 2, name: 'Room 2' },
          tenant: { id: 'tenant-2', fullName: 'Bikash Thapa', phone: '9812345678' },
          payments: [],
          customPurchases: [],
          adjustments: [],
          waterPurchases: [],
        },
      ];

      prismaService.monthlyBill.findMany.mockResolvedValue(mockBills);
      prismaService.monthlyBill.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(mockBills.find((b) => b.id === where.id) || null)
      );

      const result = await service.getMultiBillDetails([
        'bill-room2-month1',
        'bill-room2-month2',
      ]);

      // 1. Check top-level contract
      expect(result).toBeDefined();
      expect(result.isMultiMonth).toBe(true);
      expect(result.billCount).toBe(2);

      // 2. Validate balanceDue is a real number and mathematically correct
      expect(typeof result.balanceDue).toBe('number');
      expect(Number.isFinite(result.balanceDue)).toBe(true);
      expect(Number.isNaN(result.balanceDue)).toBe(false);
      expect(result.balanceDue).toBe(6400 + 5650); // 12050

      // 3. Validate totalDue is a real number
      expect(typeof result.totalDue).toBe('number');
      expect(Number.isFinite(result.totalDue)).toBe(true);
      expect(Number.isNaN(result.totalDue)).toBe(false);
      expect(result.totalDue).toBe(12050);

      // 4. Validate totalOutstanding is a real number
      expect(typeof result.totalOutstanding).toBe('number');
      expect(Number.isFinite(result.totalOutstanding)).toBe(true);
      expect(Number.isNaN(result.totalOutstanding)).toBe(false);
      expect(result.totalOutstanding).toBe(12050);

      // 5. Validate totalAmount and paidAmount
      expect(typeof result.totalAmount).toBe('number');
      expect(Number.isFinite(result.totalAmount)).toBe(true);
      expect(Number.isNaN(result.totalAmount)).toBe(false);
      expect(result.totalAmount).toBe(6400 + 6650); // 13050

      expect(typeof result.paidAmount).toBe('number');
      expect(Number.isFinite(result.paidAmount)).toBe(true);
      expect(Number.isNaN(result.paidAmount)).toBe(false);
      expect(result.paidAmount).toBe(1000);

      // 6. Invariant check: totalAmount === paidAmount + balanceDue
      expect(result.totalAmount).toBe(result.paidAmount + result.balanceDue);

      // 7. Verify room and tenant objects exist for modal display
      expect(result.room).toBeDefined();
      expect(result.room.roomNumber).toBe(2);
      expect(result.tenant).toBeDefined();
      expect(result.tenant.fullName).toBe('Bikash Thapa');

      // 8. Individual bill items must also have real numeric values
      for (const bill of result.bills) {
        expect(typeof bill.balanceDue).toBe('number');
        expect(Number.isFinite(bill.balanceDue)).toBe(true);
        expect(Number.isNaN(bill.balanceDue)).toBe(false);

        expect(typeof bill.totalAmount).toBe('number');
        expect(Number.isFinite(bill.totalAmount)).toBe(true);
        expect(Number.isNaN(bill.totalAmount)).toBe(false);

        expect(typeof bill.paidAmount).toBe('number');
        expect(Number.isFinite(bill.paidAmount)).toBe(true);
        expect(Number.isNaN(bill.paidAmount)).toBe(false);
      }
    });
  });
});
