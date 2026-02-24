import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { BillingService } from './billing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';

@Controller('api')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('billing/plans')
  public listPlans() {
    return this.billingService.listPlans();
  }

  @Get('billing/me')
  @UseGuards(SessionAuthGuard)
  public me(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getBillingForUser(user.id);
  }

  @Get('billing/chat-entitlement')
  @UseGuards(SessionAuthGuard)
  public chatEntitlement(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getChatEntitlement(user.id);
  }

  @Post('billing/checkout-session')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  public createCheckoutSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreateCheckoutSessionDto,
  ) {
    return this.billingService.createCheckoutSession(user.id, body.planKey);
  }

  @Post('billing/portal-session')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  public createPortalSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreatePortalSessionDto,
  ) {
    return this.billingService.createPortalSession(user.id, body.returnPath);
  }

  @Post('stripe/webhook')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  public async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!signature || signature.trim().length === 0) {
      throw new BadRequestException('Missing Stripe signature');
    }

    if (!request.rawBody || request.rawBody.length === 0) {
      throw new BadRequestException('Missing webhook raw body');
    }

    await this.billingService.handleWebhook(signature, request.rawBody);

    return {
      received: true,
    };
  }
}
