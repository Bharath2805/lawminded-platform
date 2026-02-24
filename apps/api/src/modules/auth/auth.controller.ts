import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionAuthGuard } from './guards/session-auth.guard';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  public async register(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(
      body,
      this.authService.getRequestMeta(request),
    );

    response.cookie(
      this.authService.getSessionCookieName(),
      result.sessionToken,
      this.authService.buildSessionCookieOptions(result.sessionExpiresAt),
    );

    return {
      user: result.user,
      session: {
        expiresAt: result.sessionExpiresAt.toISOString(),
      },
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  public async login(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      body,
      this.authService.getRequestMeta(request),
    );

    response.cookie(
      this.authService.getSessionCookieName(),
      result.sessionToken,
      this.authService.buildSessionCookieOptions(result.sessionExpiresAt),
    );

    return {
      user: result.user,
      session: {
        expiresAt: result.sessionExpiresAt.toISOString(),
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  public async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = this.authService.extractSessionToken(request);

    if (token) {
      await this.authService.revokeSession(token);
    }

    response.clearCookie(
      this.authService.getSessionCookieName(),
      this.authService.buildClearSessionCookieOptions(),
    );

    return {
      success: true,
    };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  public me(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      user,
      session: {
        id: request.auth?.sessionId,
        expiresAt: request.auth?.expiresAt.toISOString() ?? null,
      },
    };
  }
}
