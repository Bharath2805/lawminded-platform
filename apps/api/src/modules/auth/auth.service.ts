import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import type { CookieOptions, Request } from 'express';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type {
  AuthenticatedSession,
  AuthenticatedUser,
  SessionRequestMeta,
} from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const DEFAULT_SESSION_COOKIE_NAME = 'lm_session';
const DEFAULT_SESSION_TTL_HOURS = 24 * 14;
const MAX_ACTIVE_SESSIONS = 5;
const USER_ROLE = 'user';
const ADMIN_ROLE = 'admin';
const ASSISTANT_ACCESS_ROLE = 'assistant_access';

type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

type SessionIssueResult = {
  sessionId: string;
  token: string;
  expiresAt: Date;
};

type AuthIssueResult = {
  user: AuthenticatedUser;
  sessionToken: string;
  sessionExpiresAt: Date;
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessionSecret: string;
  private readonly sessionCookieName: string;
  private readonly sessionTtlHours: number;
  private readonly cookieDomain: string | null;
  private readonly adminEmail: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.sessionSecret =
      this.configService.getOrThrow<string>('SESSION_SECRET');
    this.sessionCookieName =
      this.configService.get<string>('SESSION_COOKIE_NAME')?.trim() ||
      DEFAULT_SESSION_COOKIE_NAME;

    const sessionTtlRaw = Number(
      this.configService.get<string>('SESSION_TTL_HOURS') ??
        `${DEFAULT_SESSION_TTL_HOURS}`,
    );

    this.sessionTtlHours =
      Number.isFinite(sessionTtlRaw) && sessionTtlRaw > 0
        ? sessionTtlRaw
        : DEFAULT_SESSION_TTL_HOURS;

    const cookieDomainValue = this.configService.get<string>('COOKIE_DOMAIN');
    this.cookieDomain = cookieDomainValue?.trim() || null;

    const configuredAdminEmail = this.configService.get<string>('ADMIN_EMAIL');
    this.adminEmail = this.normalizeEmail(configuredAdminEmail);
  }

  public async onModuleInit(): Promise<void> {
    await this.ensureBaseRoles();
    await this.ensureBootstrapAdminRole();
  }

  public getSessionCookieName(): string {
    return this.sessionCookieName;
  }

  public buildSessionCookieOptions(expiresAt: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      ...(this.cookieDomain ? { domain: this.cookieDomain } : {}),
    };
  }

  public buildClearSessionCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: '/',
      expires: new Date(0),
      ...(this.cookieDomain ? { domain: this.cookieDomain } : {}),
    };
  }

  public extractSessionToken(request: Request): string | null {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[this.sessionCookieName];

    if (typeof value !== 'string') {
      return null;
    }

    const token = value.trim();
    return token.length >= 24 ? token : null;
  }

  public getRequestMeta(request: Request): SessionRequestMeta {
    const forwardedFor = request.headers['x-forwarded-for'];
    let ip: string | null = null;

    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
      ip = forwardedFor.split(',')[0]?.trim() ?? null;
    } else if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      ip = forwardedFor[0]?.split(',')[0]?.trim() ?? null;
    } else if (typeof request.ip === 'string' && request.ip.length > 0) {
      ip = request.ip;
    }

    const userAgentHeader = request.headers['user-agent'];
    const userAgent =
      typeof userAgentHeader === 'string' && userAgentHeader.trim().length > 0
        ? userAgentHeader.slice(0, 512)
        : null;

    return { ip, userAgent };
  }

  public async register(
    input: RegisterDto,
    meta: SessionRequestMeta,
  ): Promise<AuthIssueResult> {
    const email = this.normalizeEmail(input.email);

    if (!email) {
      throw new UnauthorizedException('Email is invalid');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const roleNames = [USER_ROLE];

    if (this.adminEmail && email === this.adminEmail) {
      roleNames.push(ADMIN_ROLE);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      });

      await this.assignRoles(tx, created.id, roleNames);

      return tx.user.findUniqueOrThrow({
        where: { id: created.id },
        include: { roles: { include: { role: true } } },
      });
    });

    const session = await this.issueSession(user.id, meta);

    return {
      user: this.toAuthenticatedUser(user),
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
    };
  }

  public async login(
    input: LoginDto,
    meta: SessionRequestMeta,
  ): Promise<AuthIssueResult> {
    const user = await this.validateCredentials(input.email, input.password);
    const normalizedUser = await this.ensureConfiguredAdminRoleForUser(user);
    const session = await this.issueSession(normalizedUser.id, meta);

    return {
      user: this.toAuthenticatedUser(normalizedUser),
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
    };
  }

  public async revokeSession(sessionToken: string): Promise<void> {
    const sessionHash = this.hashSessionToken(sessionToken);

    await this.prisma.session.updateMany({
      where: {
        sessionHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  public async resolveSession(
    sessionToken: string,
  ): Promise<AuthenticatedSession | null> {
    const sessionHash = this.hashSessionToken(sessionToken);

    const session = await this.prisma.session.findFirst({
      where: {
        sessionHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          include: {
            roles: {
              include: { role: true },
            },
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    if (session.user.status !== UserStatus.ACTIVE) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      return null;
    }

    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      user: this.toAuthenticatedUser(session.user),
    };
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private normalizeEmail(value: string | undefined | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private hashSessionToken(sessionToken: string): string {
    return createHmac('sha256', this.sessionSecret)
      .update(sessionToken)
      .digest('hex');
  }

  private hashIp(ip: string): string {
    return createHmac('sha256', this.sessionSecret).update(ip).digest('hex');
  }

  private async validateCredentials(
    emailInput: string,
    password: string,
  ): Promise<UserWithRoles> {
    const email = this.normalizeEmail(emailInput);

    if (!email) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.DELETED
    ) {
      throw new ForbiddenException('Account is not active');
    }

    const isValid = await argon2.verify(user.passwordHash, password);

    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  private async issueSession(
    userId: string,
    meta: SessionRequestMeta,
  ): Promise<SessionIssueResult> {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.sessionTtlHours * 60 * 60 * 1000,
    );

    const token = randomBytes(48).toString('base64url');
    const sessionHash = this.hashSessionToken(token);

    const created = await this.prisma.session.create({
      data: {
        userId,
        sessionHash,
        ipHash: meta.ip ? this.hashIp(meta.ip) : null,
        userAgent: meta.userAgent,
        expiresAt,
      },
    });

    await this.cleanupExpiredSessions();
    await this.enforceSessionLimit(userId);

    return {
      sessionId: created.id,
      token,
      expiresAt,
    };
  }

  private async cleanupExpiredSessions(): Promise<void> {
    await this.prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });
  }

  private async enforceSessionLimit(userId: string): Promise<void> {
    const activeSessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (activeSessions.length <= MAX_ACTIVE_SESSIONS) {
      return;
    }

    const overflow = activeSessions
      .slice(MAX_ACTIVE_SESSIONS)
      .map((session) => session.id);

    await this.prisma.session.updateMany({
      where: { id: { in: overflow } },
      data: { revokedAt: new Date() },
    });
  }

  private toAuthenticatedUser(user: UserWithRoles): AuthenticatedUser {
    const roles = Array.from(
      new Set(user.roles.map((entry) => entry.role.name)),
    ).sort((a, b) => a.localeCompare(b));

    return {
      id: user.id,
      email: user.email,
      roles,
    };
  }

  private async ensureBaseRoles(): Promise<void> {
    await this.prisma.role.upsert({
      where: { name: USER_ROLE },
      update: {
        description: 'Standard authenticated user',
      },
      create: {
        name: USER_ROLE,
        description: 'Standard authenticated user',
      },
    });

    await this.prisma.role.upsert({
      where: { name: ADMIN_ROLE },
      update: {
        description: 'System administrator',
      },
      create: {
        name: ADMIN_ROLE,
        description: 'System administrator',
      },
    });

    await this.prisma.role.upsert({
      where: { name: ASSISTANT_ACCESS_ROLE },
      update: {
        description: 'AI assistant access',
      },
      create: {
        name: ASSISTANT_ACCESS_ROLE,
        description: 'AI assistant access',
      },
    });
  }

  private async ensureBootstrapAdminRole(): Promise<void> {
    if (!this.adminEmail) {
      return;
    }

    const adminUser = await this.prisma.user.findUnique({
      where: { email: this.adminEmail },
      select: { id: true },
    });

    if (!adminUser) {
      this.logger.warn(
        `ADMIN_EMAIL ${this.adminEmail} does not exist yet. Admin role will be assigned on registration.`,
      );
      return;
    }

    const adminRole = await this.prisma.role.findUnique({
      where: { name: ADMIN_ROLE },
      select: { id: true },
    });

    if (!adminRole) {
      return;
    }

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: adminUser.id,
          roleId: adminRole.id,
        },
      },
      update: {},
      create: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    });
  }

  private async ensureConfiguredAdminRoleForUser(
    user: UserWithRoles,
  ): Promise<UserWithRoles> {
    if (!this.adminEmail || user.email !== this.adminEmail) {
      return user;
    }

    const hasAdminRole = user.roles.some(
      (entry) => entry.role.name === ADMIN_ROLE,
    );

    if (hasAdminRole) {
      return user;
    }

    const adminRole = await this.prisma.role.findUnique({
      where: { name: ADMIN_ROLE },
      select: { id: true },
    });

    if (!adminRole) {
      return user;
    }

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: adminRole.id,
        },
      },
      update: {
        assignedAt: new Date(),
      },
      create: {
        userId: user.id,
        roleId: adminRole.id,
      },
    });

    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { roles: { include: { role: true } } },
    });
  }

  private async assignRoles(
    tx: Prisma.TransactionClient,
    userId: string,
    roleNames: string[],
  ): Promise<void> {
    const uniqueRoleNames = Array.from(new Set(roleNames));

    const roles = await tx.role.findMany({
      where: { name: { in: uniqueRoleNames } },
      select: { id: true },
    });

    if (roles.length === 0) {
      return;
    }

    await tx.userRole.createMany({
      data: roles.map((role) => ({
        userId,
        roleId: role.id,
      })),
      skipDuplicates: true,
    });
  }
}
