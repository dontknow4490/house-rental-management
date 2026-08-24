import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { NepaliCalendarModule } from './nepali-calendar/nepali-calendar.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { SettingsModule } from './settings/settings.module';
import { AuthModule } from './auth/auth.module';
import { RoomsModule } from './rooms/rooms.module';
import { TenantsModule } from './tenants/tenants.module';
import { ElectricityModule } from './electricity/electricity.module';
import { WaterModule } from './water/water.module';
import { BorrowingModule } from './borrowing/borrowing.module';
import { AdjustmentsModule } from './adjustments/adjustments.module';
import { BillingModule } from './billing/billing.module';
import { PaymentsModule } from './payments/payments.module';
import { DocumentsModule } from './documents/documents.module';
import { NoticesModule } from './notices/notices.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('THROTTLE_TTL') || 60000,
            limit: configService.get<number>('THROTTLE_LIMIT') || 100,
          },
        ],
      }),
    }),
    PrismaModule,
    NepaliCalendarModule,
    AuditLogModule,
    SettingsModule,
    AuthModule,
    RoomsModule,
    TenantsModule,
    ElectricityModule,
    WaterModule,
    BorrowingModule,
    AdjustmentsModule,
    BillingModule,
    PaymentsModule,
    DocumentsModule,
    NoticesModule,
    MaintenanceModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
