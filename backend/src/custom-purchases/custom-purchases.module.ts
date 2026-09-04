import { Module } from '@nestjs/common';
import { CustomPurchasesService } from './custom-purchases.service';
import { CustomPurchasesController } from './custom-purchases.controller';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [CustomPurchasesController],
  providers: [CustomPurchasesService],
  exports: [CustomPurchasesService],
})
export class CustomPurchasesModule {}
