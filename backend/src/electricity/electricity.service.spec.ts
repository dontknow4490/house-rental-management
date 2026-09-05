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

  it('should guarantee complete room-specific reading isolation between Room 1 (high reading 5400) and Room 3 (low reading 120)', async () => {
    // Mock DB storing readings specifically per room
    const readingsDb: Record<string, any[]> = {
      'room-1': [{ yearBS: 2083, monthBS: 4, currentReading: 5400 }],
      'room-3': [{ yearBS: 2083, monthBS: 4, currentReading: 120 }],
    };

    prismaService.electricityReading.findFirst = jest.fn().mockImplementation(({ where }) => {
      const roomReadings = readingsDb[where.roomId] || [];
      return Promise.resolve(roomReadings[0] || null);
    });

    // 1. Fetch last reading for Room 1
    const lastR1 = await service.getLastReadingForRoom('room-1', 2083, 5);
    expect(lastR1).toBe(5400);

    // 2. Fetch last reading for Room 3
    const lastR3 = await service.getLastReadingForRoom('room-3', 2083, 5);
    expect(lastR3).toBe(120);

    // Verify Room 3's reading was NEVER affected by Room 1
    expect(lastR3).not.toBe(5400);

    // Enter new reading for Room 3 omitting previousReading (should auto-fetch 120)
    prismaService.room.findUnique = jest.fn().mockResolvedValue({
      id: 'room-3',
      roomNumber: 3,
      tenantProfiles: [{ userId: 'tenant-3' }],
    });

    const resR3 = await service.enterReading(
      {
        roomId: 'room-3',
        yearBS: 2083,
        monthBS: 5,
        currentReading: 180,
      },
      'admin-1',
    );

    expect(resR3.previousReading).toBe(120);
    expect(resR3.currentReading).toBe(180);
    expect(resR3.unitsUsed).toBe(60);
    expect(resR3.totalCharge).toBe(60 * 15);
  });

  it('should handle zero electricity consumption (current === previous reading) correctly without NaN or error', async () => {
    const result = await service.enterReading(
      {
        roomId: 'room-1',
        yearBS: 2083,
        monthBS: 5,
        previousReading: 1000,
        currentReading: 1000,
      },
      'admin-1',
    );

    expect(result.unitsUsed).toBe(0);
    expect(result.totalCharge).toBe(0);
    expect(isNaN(result.totalCharge)).toBe(false);
  });

  it('should correctly handle year rollover from Chaitra (month 12) to Baisakh (month 1 of next year)', async () => {
    // Mock Chaitra (2082/12) reading of 4500
    prismaService.electricityReading.findFirst = jest.fn().mockImplementation(({ where }) => {
      if (where.roomId === 'room-2' && where.OR) {
        return Promise.resolve({ yearBS: 2082, monthBS: 12, currentReading: 4500 });
      }
      return Promise.resolve(null);
    });

    prismaService.room.findUnique = jest.fn().mockResolvedValue({
      id: 'room-2',
      roomNumber: 2,
      tenantProfiles: [{ userId: 'tenant-2' }],
    });

    // Enter reading for 2083 Baisakh (month 1)
    const res = await service.enterReading(
      {
        roomId: 'room-2',
        yearBS: 2083,
        monthBS: 1,
        currentReading: 4585,
      },
      'admin-1',
    );

    expect(res.previousReading).toBe(4500);
    expect(res.currentReading).toBe(4585);
    expect(res.unitsUsed).toBe(85);
    expect(res.totalCharge).toBe(85 * 15);
  });

  it('should handle first reading ever for a new room correctly (previous reading = 0)', async () => {
    prismaService.electricityReading.findFirst = jest.fn().mockResolvedValue(null);

    prismaService.room.findUnique = jest.fn().mockResolvedValue({
      id: 'room-5',
      roomNumber: 5,
      tenantProfiles: [{ userId: 'tenant-5' }],
    });

    const res = await service.enterReading(
      {
        roomId: 'room-5',
        yearBS: 2083,
        monthBS: 1,
        currentReading: 42,
      },
      'admin-1',
    );

    expect(res.previousReading).toBe(0);
    expect(res.currentReading).toBe(42);
    expect(res.unitsUsed).toBe(42);
    expect(res.totalCharge).toBe(42 * 15);
  });

  it('should strictly isolate readings across all 6 rooms (Rooms 1–6) across multiple months', async () => {
    const multiRoomDb: Record<string, Array<{ yearBS: number; monthBS: number; currentReading: number }>> = {
      'room-1': [{ yearBS: 2083, monthBS: 3, currentReading: 5400 }],
      'room-2': [{ yearBS: 2083, monthBS: 3, currentReading: 2100 }],
      'room-3': [{ yearBS: 2083, monthBS: 3, currentReading: 120 }],
      'room-4': [{ yearBS: 2083, monthBS: 3, currentReading: 950 }],
      'room-5': [{ yearBS: 2083, monthBS: 3, currentReading: 3200 }],
      'room-6': [{ yearBS: 2083, monthBS: 3, currentReading: 700 }],
    };

    prismaService.electricityReading.findFirst = jest.fn().mockImplementation(({ where }) => {
      const readings = multiRoomDb[where.roomId] || [];
      return Promise.resolve(readings[0] || null);
    });

    for (let r = 1; r <= 6; r++) {
      const roomId = `room-${r}`;
      const lastReading = await service.getLastReadingForRoom(roomId, 2083, 4);
      expect(lastReading).toBe(multiRoomDb[roomId][0].currentReading);
    }
  });

  it('should support idempotent electricity reading submissions with the same idempotency key', async () => {
    const key = 'idem_elec_test_final';
    const firstRes = await service.enterReading(
      {
        roomId: 'room-1',
        yearBS: 2083,
        monthBS: 5,
        previousReading: 500,
        currentReading: 600,
        idempotencyKey: key,
      },
      'admin-1',
    );

    const secondRes = await service.enterReading(
      {
        roomId: 'room-1',
        yearBS: 2083,
        monthBS: 5,
        previousReading: 500,
        currentReading: 600,
        idempotencyKey: key,
      },
      'admin-1',
    );

    expect(secondRes).toEqual(firstRes);
    expect(secondRes.unitsUsed).toBe(100);
  });
});
