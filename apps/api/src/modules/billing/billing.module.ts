import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingAdminController } from './billing-admin.controller';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuthModule],
  controllers: [BillingController, BillingAdminController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
