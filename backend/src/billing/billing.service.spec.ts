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
      borrowing: {
        findMany: jest.fn().mockResolvedValue([
          {
            outstandingAmount: 500,
          },
        ]),
      },
      monthlyBill: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
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

  it('should accurately calculate total monthly bill: Rent (6000) + Internet (250) + Electricity (1200) + Water (90) + Borrowing (500) = 8040', async () => {
    const result = await service.generateMonthlyBills(
      { yearBS: 2083, monthBS: 5 },
      'admin-1',
    );

    expect(result.bills.length).toBe(1);
    const bill = result.bills[0];
    expect(bill.rentAmount).toBe(6000);
    expect(bill.internetAmount).toBe(250);
    expect(bill.electricityAmount).toBe(1200);
    expect(bill.waterAmount).toBe(90);
    expect(bill.borrowingAmount).toBe(500);
    expect(bill.totalAmount).toBe(8040);
    expect(bill.balanceDue).toBe(8040);
    expect(bill.status).toBe('UNPAID');
  });
});
