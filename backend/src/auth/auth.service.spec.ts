import { Test, TestingModule } from '@nestjs/testing';
process.env.TEST_ADMIN_USERNAME = 'test_admin';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: any;
  let jwtService: any;

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('Secret@123', 10);

    prismaService = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.username === 'test_admin' || where.id === 'user-admin') {
            return Promise.resolve({
              id: 'user-admin',
              username: process.env.TEST_ADMIN_USERNAME,
              passwordHash: hashedPassword,
              fullName: 'Admin User',
              role: 'ADMIN',
              status: 'ACTIVE',
            });
          }
          return Promise.resolve(null);
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'user-admin', ...data })),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock_jwt_token_123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should authenticate valid admin credentials and return JWT token', async () => {
    const { execSync } = require('child_process');
    process.env.TEST_ACCOUNT_NAME = 'Test Account';
    process.env.TEST_HOUSE_NAME = 'Test House';
    const user = await service.validateUser({
      username: process.env.TEST_ADMIN_USERNAME,
      password: 'Secret@123',
    });

    expect(user).toBeDefined();
    expect(user.username).toBe(process.env.TEST_ADMIN_USERNAME);

    const loginResult = await service.login(user);
    expect(loginResult.accessToken).toBe('mock_jwt_token_123');
    expect(loginResult.user.role).toBe('ADMIN');
  });

  it('should reject invalid password with UnauthorizedException', async () => {
    await expect(
      service.validateUser({
        username: process.env.TEST_ADMIN_USERNAME,
        password: 'WrongPassword',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
