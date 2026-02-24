import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ResourcesAdminController } from './resources-admin.controller';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [ResourcesController, ResourcesAdminController],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
