import { Test, TestingModule } from '@nestjs/testing';
import { WaterService } from './water.service';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BillingService } from '../billing/billing.service';
import { idempotencyStore } from '../common/utils/async-lock.util';

describe('WaterService - True Client-Driven Idempotency & Financial Safety', () => {
  let service: WaterService;
  let prismaService: any;
  let settingsService: any;
  let billingService: any;

  beforeEach(async () => {
    idempotencyStore.clear();

    let createdCounter = 0;
    prismaService = {
      room: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'room-1',
          roomNumber: 101,
          tenantProfiles: [{ userId: 'tenant-1', status: 'ACTIVE' }],
        }),
      },
      waterPurchase: {
        create: jest.fn().mockImplementation(({ data }) => {
          createdCounter++;
          return Promise.resolve({
            id: `water-rec-${createdCounter}`,
            ...data,
          });
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      monthlyBill: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    settingsService = {
      getNumberSetting: jest.fn().mockResolvedValue(45),
    };

    billingService = {
      generateMonthlyBills: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaterService,
        NepaliCalendarService,
        { provide: PrismaService, useValue: prismaService },
        { provide: SettingsService, useValue: settingsService },
        { provide: BillingService, useValue: billingService },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get<WaterService>(WaterService);
  });

  it('Test A: Two identical water purchases with DIFFERENT idempotency keys result in 2 legitimate records', async () => {
    const payload1 = {
      roomId: 'room-1',
      yearBS: 2083,
      monthBS: 5,
      quantity: 1,
      pricePerUnit: 45,
      purchaseDateBS: '2083-05-15',
      idempotencyKey: 'water-key-101',
    };

    const payload2 = {
      roomId: 'room-1',
      yearBS: 2083,
      monthBS: 5,
      quantity: 1,
      pricePerUnit: 45,
      purchaseDateBS: '2083-05-15',
      idempotencyKey: 'water-key-102', // Different key
    };

    const res1 = await service.addPurchase(payload1, 'admin-1');
    const res2 = await service.addPurchase(payload2, 'admin-1');

    // Exactly TWO distinct records created
    expect(prismaService.waterPurchase.create).toHaveBeenCalledTimes(2);
    expect(res1.id).toBe('water-rec-1');
    expect(res2.id).toBe('water-rec-2');
    expect(res1.id).not.toBe(res2.id);
  });

  it('Test E: Two identical requests with the SAME idempotency key sent concurrently with Promise.all result in exactly 1 transaction', async () => {
    const payload = {
      roomId: 'room-1',
      yearBS: 2083,
      monthBS: 5,
      quantity: 3,
      pricePerUnit: 50,
      purchaseDateBS: '2083-05-15',
      idempotencyKey: 'water-concurrent-same-key',
    };

    // Fire 2 concurrent requests simultaneously with same key
    const [res1, res2] = await Promise.all([
      service.addPurchase(payload, 'admin-1'),
      service.addPurchase(payload, 'admin-1'),
    ]);

    // Exactly ONE record is created in the database
    expect(prismaService.waterPurchase.create).toHaveBeenCalledTimes(1);

    // Both requests return the purchase with matching ID and totalAmount 150
    expect(res1.id).toBe('water-rec-1');
    expect(res2.id).toBe('water-rec-1');
    expect(res1.totalAmount).toBe(150);
    expect(res2.totalAmount).toBe(150);
  });

  it('Test F: Request retried after a transient network drop using the SAME key returns cached result without creating a duplicate', async () => {
    const payload = {
      roomId: 'room-1',
      yearBS: 2083,
      monthBS: 5,
      quantity: 2,
      pricePerUnit: 45,
      purchaseDateBS: '2083-05-15',
      idempotencyKey: 'water-retry-key-777',
    };

    // Initial successful call
    const initialRes = await service.addPurchase(payload, 'admin-1');
    expect(prismaService.waterPurchase.create).toHaveBeenCalledTimes(1);

    // Simulated network retry of the same logical submission
    const retryRes = await service.addPurchase(payload, 'admin-1');

    // DB create is NOT called a second time
    expect(prismaService.waterPurchase.create).toHaveBeenCalledTimes(1);
    expect(retryRes.id).toBe(initialRes.id);
  });
});
