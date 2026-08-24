import { Test, TestingModule } from '@nestjs/testing';
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
          if (where.username === 'yubraj_99' || where.id === 'user-admin') {
            return Promise.resolve({
              id: 'user-admin',
              username: 'yubraj_99',
              passwordHash: hashedPassword,
              fullName: 'Yubraj Admin',
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
    const user = await service.validateUser({
      username: 'yubraj_99',
      password: 'Secret@123',
    });

    expect(user).toBeDefined();
    expect(user.username).toBe('yubraj_99');

    const loginResult = await service.login(user);
    expect(loginResult.accessToken).toBe('mock_jwt_token_123');
    expect(loginResult.user.role).toBe('ADMIN');
  });

  it('should reject invalid password with UnauthorizedException', async () => {
    await expect(
      service.validateUser({
        username: 'yubraj_99',
        password: 'WrongPassword',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
