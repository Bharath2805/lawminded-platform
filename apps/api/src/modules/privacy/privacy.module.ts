import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrivacyAdminController } from './privacy-admin.controller';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

@Module({
  imports: [AuthModule],
  controllers: [PrivacyController, PrivacyAdminController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
