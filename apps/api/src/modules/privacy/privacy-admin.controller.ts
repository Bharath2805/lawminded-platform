import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { ListPrivacyQueryDto } from './dto/list-privacy-query.dto';
import { UpdateDsarRequestStatusDto } from './dto/update-dsar-request-status.dto';
import { PrivacyService } from './privacy.service';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('admin')
@Controller('api/admin/privacy')
export class PrivacyAdminController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get('consents')
  public listConsentLogs(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListPrivacyQueryDto,
  ) {
    return this.privacyService.listConsentLogs(
      query.limit ?? 25,
      query.window ?? '30d',
    );
  }

  @Get('dsar')
  public listDsarRequests(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListPrivacyQueryDto,
  ) {
    return this.privacyService.listDsarRequests(
      query.limit ?? 25,
      query.window ?? '30d',
      query.status ?? 'ALL',
    );
  }

  @Patch('dsar/:requestId/status')
  public updateDsarRequestStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateDsarRequestStatusDto,
  ) {
    return this.privacyService.updateDsarRequestStatus(
      user.id,
      requestId,
      body,
    );
  }

  @Get('export/:userId')
  public exportUserData(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.privacyService.exportUserDataForAdmin(user.id, userId);
  }

  @Get('audit')
  public listAuditLogs(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListPrivacyQueryDto,
  ) {
    return this.privacyService.listAdminAuditLogs(query.limit ?? 25);
  }
}
