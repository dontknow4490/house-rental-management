import { Test, TestingModule } from '@nestjs/testing';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService } from '../nepali-calendar/nepali-calendar.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BadRequestException } from '@nestjs/common';

describe('RoomsService', () => {
  let service: RoomsService;
  let prismaService: any;
  let auditLogService: any;

  beforeEach(async () => {
    prismaService = {
      room: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r-1', roomNumber: 1, name: 'Room 1', defaultRent: 6000, status: 'VACANT' },
        ]),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'r-new', ...data })),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
        delete: jest.fn().mockResolvedValue({ id: 'r-target' }),
      },
      monthlyBill: {
        count: jest.fn().mockResolvedValue(0),
      },
      electricityReading: {
        count: jest.fn().mockResolvedValue(0),
      },
      waterPurchase: {
        count: jest.fn().mockResolvedValue(0),
      },
      customPurchase: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    auditLogService = {
      log: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        NepaliCalendarService,
        { provide: PrismaService, useValue: prismaService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
  });

  describe('Dynamic / Unlimited Room Creation', () => {
    it('successfully creates Room 7 without arbitrary limit', async () => {
      prismaService.room.findUnique.mockResolvedValue(null);

      const result = await service.createRoom(
        { roomNumber: 7, name: 'Room 7', defaultRent: 8000 },
        'admin-1',
      );

      expect(prismaService.room.create).toHaveBeenCalledWith({
        data: {
          roomNumber: 7,
          name: 'Room 7',
          defaultRent: 8000,
          status: 'VACANT',
        },
      });
      expect(result.roomNumber).toBe(7);
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('correctly maps active tenant and OCCUPIED status for Room 7 in getAllRooms', async () => {
      prismaService.room.findMany.mockResolvedValue([
        {
          id: 'r-7',
          roomNumber: 7,
          name: 'Room 7',
          defaultRent: 8500,
          tenantProfiles: [
            {
              id: 'tp-7',
              userId: 'u-7',
              status: 'ACTIVE',
              numberOfPeople: 2,
              monthlyRent: 8500,
              moveInDateBS: '2083-01-01',
              user: {
                id: 'u-7',
                username: 'tenant7',
                fullName: 'Tenant Seven',
                phone: '9800000007',
                status: 'ACTIVE',
              },
            },
          ],
          electricityReadings: [],
          monthlyBills: [],
        },
      ]);

      const rooms = await service.getAllRooms();

      expect(rooms).toHaveLength(1);
      expect(rooms[0].roomNumber).toBe(7);
      expect(rooms[0].status).toBe('OCCUPIED');
      expect(rooms[0].tenant.fullName).toBe('Tenant Seven');
      expect(rooms[0].tenant.id).toBe('u-7');
    });

    it('rejects creating a room if roomNumber already exists', async () => {
      prismaService.room.findUnique.mockResolvedValue({ id: 'r-1', roomNumber: 1 });

      await expect(
        service.createRoom({ roomNumber: 1, defaultRent: 6000 }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Safe Room Deletion & Data Safety Guard', () => {
    it('rejects deletion if room has active tenant', async () => {
      prismaService.room.findUnique.mockResolvedValue({
        id: 'r-1',
        roomNumber: 1,
        status: 'OCCUPIED',
        tenantProfiles: [{ id: 'tp-1', status: 'ACTIVE' }],
        monthlyBills: [],
        electricityReadings: [],
        waterPurchases: [],
        customPurchases: [],
      });

      await expect(service.deleteRoom('r-1', 'admin-1')).rejects.toThrow(
        /Cannot delete Room 1 while an active tenant is assigned/,
      );
    });

    it('rejects deletion if room has historical bills or purchases', async () => {
      prismaService.room.findUnique.mockResolvedValue({
        id: 'r-2',
        roomNumber: 2,
        status: 'VACANT',
        tenantProfiles: [],
        monthlyBills: [{ id: 'b-1' }],
        electricityReadings: [],
        waterPurchases: [],
        customPurchases: [],
      });

      await expect(service.deleteRoom('r-2', 'admin-1')).rejects.toThrow(
        /historical records exist/,
      );
      expect(prismaService.room.delete).not.toHaveBeenCalled();
    });

    it('allows deletion of clean, unused room without historical records', async () => {
      prismaService.room.findUnique.mockResolvedValue({
        id: 'r-99',
        roomNumber: 99,
        status: 'VACANT',
        tenantProfiles: [],
        monthlyBills: [],
        electricityReadings: [],
        waterPurchases: [],
        customPurchases: [],
      });

      const result = await service.deleteRoom('r-99', 'admin-1');

      expect(prismaService.room.delete).toHaveBeenCalledWith({ where: { id: 'r-99' } });
      expect(result.success).toBe(true);
      expect(auditLogService.log).toHaveBeenCalled();
    });
  });
});
