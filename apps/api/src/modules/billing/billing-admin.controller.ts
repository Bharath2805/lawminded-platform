import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { BillingService } from './billing.service';
import { UpdatePlanSettingsDto } from './dto/update-plan-settings.dto';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('admin')
@Controller('api/admin/billing')
export class BillingAdminController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  public listPlans() {
    return this.billingService.listAdminPlans();
  }

  @Patch('plans/:planKey')
  public updatePlan(
    @CurrentUser() adminUser: AuthenticatedUser,
    @Param('planKey') planKey: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdatePlanSettingsDto,
  ) {
    return this.billingService.updatePlanSettings(adminUser.id, planKey, body);
  }
}
