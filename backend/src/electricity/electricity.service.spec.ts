import { Test, TestingModule } from '@nestjs/testing';
import { ElectricityService } from './electricity.service';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BadRequestException } from '@nestjs/common';

import { BillingService } from '../billing/billing.service';

describe('ElectricityService', () => {
  let service: ElectricityService;
  let prismaService: any;
  let settingsService: any;
  let billingService: any;

  beforeEach(async () => {
    prismaService = {
      room: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'room-1',
          roomNumber: 1,
          defaultRent: 6000,
          tenantProfiles: [{ userId: 'tenant-1' }],
        }),
      },
      electricityReading: {
        findFirst: jest.fn().mockResolvedValue({ currentReading: 1250 }),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    settingsService = {
      getNumberSetting: jest.fn().mockResolvedValue(15),
    };

    billingService = {
      generateMonthlyBills: jest.fn().mockResolvedValue({ bills: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElectricityService,
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

    service = module.get<ElectricityService>(ElectricityService);
  });

  it('should calculate valid electricity usage and charge correctly (Prev: 1250, Curr: 1330, Rate: 15 -> Usage: 80, Charge: 1200)', async () => {
    const result = await service.enterReading(
      {
        roomId: 'room-1',
        yearBS: 2083,
        monthBS: 5,
        previousReading: 1250,
        currentReading: 1330,
      },
      'admin-1',
    );

    expect(result.unitsUsed).toBe(80);
    expect(result.unitRate).toBe(15);
    expect(result.totalCharge).toBe(1200);
    expect(result.previousReading).toBe(1250);
    expect(result.currentReading).toBe(1330);
  });

  it('should throw BadRequestException when current reading is lower than previous reading (Prev: 1330, Curr: 1250)', async () => {
    await expect(
      service.enterReading(
        {
          roomId: 'room-1',
          yearBS: 2083,
          monthBS: 5,
          previousReading: 1330,
          currentReading: 1250,
        },
        'admin-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
