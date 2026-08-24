import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto, ChangePasswordDto, UpdateAccountDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private auditLogService: AuditLogService,
  ) {}

  async validateUser(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: loginDto.username.trim().toLowerCase() },
      include: {
        tenantProfile: {
          include: {
            room: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('This account is disabled. Please contact administrator.');
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid username or password');
    }

    return user;
  }

  async login(user: any, ipAddress?: string) {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
    };

    const token = this.jwtService.sign(payload);

    await this.auditLogService.log({
      userId: user.id,
      username: user.username,
      action: 'USER_LOGIN',
      details: { role: user.role },
      ipAddress,
    });

    return {
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        tenantProfile: user.tenantProfile
          ? {
              id: user.tenantProfile.id,
              roomId: user.tenantProfile.roomId,
              roomNumber: user.tenantProfile.room?.roomNumber,
              roomName: user.tenantProfile.room?.name,
              numberOfPeople: user.tenantProfile.numberOfPeople,
              monthlyRent: user.tenantProfile.monthlyRent,
              moveInDateBS: user.tenantProfile.moveInDateBS,
            }
          : null,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        tenantProfile: {
          select: {
            id: true,
            roomId: true,
            numberOfPeople: true,
            monthlyRent: true,
            moveInDateBS: true,
            room: {
              select: {
                id: true,
                roomNumber: true,
                name: true,
                defaultRent: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      tenantProfile: user.tenantProfile
        ? {
            id: user.tenantProfile.id,
            roomId: user.tenantProfile.roomId,
            roomNumber: user.tenantProfile.room?.roomNumber,
            roomName: user.tenantProfile.room?.name,
            numberOfPeople: user.tenantProfile.numberOfPeople,
            monthlyRent: user.tenantProfile.monthlyRent,
            moveInDateBS: user.tenantProfile.moveInDateBS,
            room: user.tenantProfile.room,
          }
        : null,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Current password does not match');
    }

    if (dto.newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await this.auditLogService.log({
      userId: user.id,
      username: user.username,
      action: 'PASSWORD_CHANGED',
      ipAddress,
    });

    return { message: 'Password updated successfully' };
  }

  async updateAccount(userId: string, dto: UpdateAccountDto, ipAddress?: string) {
    const newUsername = dto.username.trim().toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: {
        username: newUsername,
        id: { not: userId },
      },
    });

    if (existing) {
      throw new ConflictException('Username is already taken');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        username: newUsername,
        fullName: dto.fullName.trim(),
        phone: dto.phone?.trim() || null,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        phone: true,
        role: true,
      },
    });

    await this.auditLogService.log({
      userId,
      username: updated.username,
      action: 'ACCOUNT_UPDATED',
      details: { newUsername: updated.username, fullName: updated.fullName },
      ipAddress,
    });

    // Reissue token with updated username
    const payload = {
      sub: updated.id,
      username: updated.username,
      role: updated.role,
      fullName: updated.fullName,
    };
    const newAccessToken = this.jwtService.sign(payload);

    return {
      message: 'Account updated successfully',
      user: updated,
      accessToken: newAccessToken,
    };
  }
}
