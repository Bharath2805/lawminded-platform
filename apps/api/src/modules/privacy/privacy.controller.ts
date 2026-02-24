import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CreateDsarRequestDto } from './dto/create-dsar-request.dto';
import { UpdateCookiePreferencesDto } from './dto/update-cookie-preferences.dto';
import { PrivacyService } from './privacy.service';

@Controller('api/privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get('consent')
  public getCurrentConsent(
    @Req() request: Request,
    @Query('anonymousId') anonymousId?: string,
  ) {
    return this.privacyService.getCurrentConsent(request, anonymousId);
  }

  @Post('consent')
  @HttpCode(HttpStatus.OK)
  public updateConsent(
    @Req() request: Request,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateCookiePreferencesDto,
  ) {
    return this.privacyService.upsertConsentPreferences(request, body);
  }

  @Get('dsar/me')
  @UseGuards(SessionAuthGuard)
  public getMyDsarRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.privacyService.listOwnDsarRequests(user.id);
  }

  @Post('dsar')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  public createDsarRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreateDsarRequestDto,
  ) {
    return this.privacyService.createDsarRequest(user, body);
  }

  @Get('export/me')
  @UseGuards(SessionAuthGuard)
  public exportMyData(@CurrentUser() user: AuthenticatedUser) {
    return this.privacyService.exportOwnData(user.id);
  }
}
