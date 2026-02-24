import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DsarRequestStatus,
  Prisma,
  type DsarRequestType,
} from '@prisma/client';
import type { Request } from 'express';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateDsarRequestDto } from './dto/create-dsar-request.dto';
import {
  type DsarStatusFilter,
  type PrivacyWindow,
} from './dto/list-privacy-query.dto';
import { UpdateCookiePreferencesDto } from './dto/update-cookie-preferences.dto';
import { UpdateDsarRequestStatusDto } from './dto/update-dsar-request-status.dto';

const DEFAULT_PRIVACY_POLICY_VERSION = '2026-02-17';
const DEFAULT_CONSENT_SOURCE = 'website';

@Injectable()
export class PrivacyService {
  private readonly sessionSecret: string;
  private readonly defaultPolicyVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.sessionSecret =
      this.configService.getOrThrow<string>('SESSION_SECRET');

    this.defaultPolicyVersion =
      this.configService.get<string>('PRIVACY_POLICY_VERSION')?.trim() ||
      DEFAULT_PRIVACY_POLICY_VERSION;
  }

  public async getCurrentConsent(
    request: Request,
    anonymousIdInput?: string,
  ): Promise<{
    preference: {
      necessary: boolean;
      analytics: boolean;
      marketing: boolean;
      policyVersion: string;
      updatedAt: string | null;
      subject: 'user' | 'anonymous' | 'none';
    };
  }> {
    const user = await this.resolveOptionalAuthUser(request);
    const anonymousId = this.normalizeAnonymousId(anonymousIdInput);

    const preference =
      (user
        ? await this.prisma.cookiePreference.findUnique({
            where: { userId: user.id },
          })
        : null) ??
      (anonymousId
        ? await this.prisma.cookiePreference.findUnique({
            where: { anonymousId },
          })
        : null);

    if (!preference) {
      return {
        preference: {
          necessary: true,
          analytics: false,
          marketing: false,
          policyVersion: this.defaultPolicyVersion,
          updatedAt: null,
          subject: user ? 'user' : anonymousId ? 'anonymous' : 'none',
        },
      };
    }

    return {
      preference: {
        necessary: preference.necessary,
        analytics: preference.analytics,
        marketing: preference.marketing,
        policyVersion: preference.policyVersion,
        updatedAt: preference.updatedAt.toISOString(),
        subject: preference.userId ? 'user' : 'anonymous',
      },
    };
  }

  public async upsertConsentPreferences(
    request: Request,
    input: UpdateCookiePreferencesDto,
  ) {
    const user = await this.resolveOptionalAuthUser(request);
    const anonymousId = this.normalizeAnonymousId(input.anonymousId);

    if (!user && !anonymousId) {
      throw new BadRequestException(
        'anonymousId is required for unauthenticated consent updates',
      );
    }

    const requestMeta = this.getRequestMeta(request);
    const policyVersion = this.normalizePolicyVersion(input.policyVersion);
    const source = this.normalizeSource(input.source);

    try {
      const preference = await this.prisma.$transaction(async (tx) => {
        if (user?.id && anonymousId) {
          const guestPreference = await tx.cookiePreference.findUnique({
            where: { anonymousId },
          });

          if (guestPreference && !guestPreference.userId) {
            await tx.cookiePreference.delete({
              where: { id: guestPreference.id },
            });
          }
        }

        const nextData = {
          necessary: true,
          analytics: input.analytics,
          marketing: input.marketing,
          policyVersion,
          source,
          ipHash: requestMeta.ipHash,
          userAgent: requestMeta.userAgent,
        };

        const savedPreference = user
          ? await tx.cookiePreference.upsert({
              where: { userId: user.id },
              update: {
                ...nextData,
                anonymousId: anonymousId ?? undefined,
              },
              create: {
                ...nextData,
                userId: user.id,
                anonymousId,
              },
            })
          : await tx.cookiePreference.upsert({
              where: { anonymousId: anonymousId as string },
              update: nextData,
              create: {
                ...nextData,
                anonymousId,
              },
            });

        await tx.consentLog.create({
          data: {
            preferenceId: savedPreference.id,
            userId: user?.id,
            anonymousId: anonymousId ?? savedPreference.anonymousId,
            necessary: true,
            analytics: input.analytics,
            marketing: input.marketing,
            policyVersion,
            source,
            ipHash: requestMeta.ipHash,
            userAgent: requestMeta.userAgent,
          },
        });

        return savedPreference;
      });

      return {
        preference: {
          necessary: preference.necessary,
          analytics: preference.analytics,
          marketing: preference.marketing,
          policyVersion: preference.policyVersion,
          updatedAt: preference.updatedAt.toISOString(),
          subject: preference.userId ? 'user' : 'anonymous',
        },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Consent preference conflict. Please refresh and retry.',
        );
      }

      throw error;
    }
  }

  public async createDsarRequest(
    user: AuthenticatedUser,
    input: CreateDsarRequestDto,
  ) {
    const created = await this.prisma.dsarRequest.create({
      data: {
        userId: user.id,
        requesterEmail: user.email,
        type: input.type,
        details: this.normalizeOptionalText(input.details, 4000),
        source: 'self-service',
      },
    });

    return { request: this.serializeDsarRequest(created) };
  }

  public async listOwnDsarRequests(userId: string) {
    const requests = await this.prisma.dsarRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });

    return {
      requests: requests.map((request) => this.serializeDsarRequest(request)),
    };
  }

  public async exportOwnData(userId: string) {
    return this.exportUserDataByUserId(userId);
  }

  public async exportUserDataForAdmin(adminUserId: string, userId: string) {
    const exportPayload = await this.exportUserDataByUserId(userId);

    await this.createAdminAuditLog(
      adminUserId,
      'privacy.export.user_data',
      'user',
      userId,
      {
        generatedAt: exportPayload.generatedAt,
      },
    );

    return exportPayload;
  }

  public async listConsentLogs(limit: number, window: PrivacyWindow) {
    const windowStart = this.resolveWindowStart(window);

    const rows = await this.prisma.consentLog.findMany({
      where: windowStart
        ? {
            consentedAt: {
              gte: windowStart,
            },
          }
        : undefined,
      take: limit,
      orderBy: { consentedAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return {
      window,
      consents: rows.map((row) => ({
        id: row.id,
        user: row.user,
        anonymousId: row.anonymousId,
        necessary: row.necessary,
        analytics: row.analytics,
        marketing: row.marketing,
        policyVersion: row.policyVersion,
        source: row.source,
        consentedAt: row.consentedAt.toISOString(),
      })),
    };
  }

  public async listDsarRequests(
    limit: number,
    window: PrivacyWindow,
    statusFilter: DsarStatusFilter,
  ) {
    const windowStart = this.resolveWindowStart(window);
    const where: Prisma.DsarRequestWhereInput = {
      ...(windowStart
        ? {
            requestedAt: {
              gte: windowStart,
            },
          }
        : {}),
      ...(statusFilter !== 'ALL'
        ? {
            status: statusFilter as DsarRequestStatus,
          }
        : {}),
    };

    const rows = await this.prisma.dsarRequest.findMany({
      where,
      take: limit,
      orderBy: { requestedAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return {
      window,
      status: statusFilter,
      requests: rows.map((row) => ({
        id: row.id,
        requesterEmail: row.requesterEmail,
        type: row.type,
        status: row.status,
        details: row.details,
        source: row.source,
        requestedAt: row.requestedAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        resolutionNote: row.resolutionNote,
        user: row.user,
        resolvedBy: row.resolvedBy,
      })),
    };
  }

  private resolveWindowStart(window: PrivacyWindow): Date | null {
    const now = new Date();
    const days =
      window === '7d'
        ? 7
        : window === '30d'
          ? 30
          : window === '90d'
            ? 90
            : null;

    if (days === null) {
      return null;
    }

    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  public async updateDsarRequestStatus(
    adminUserId: string,
    requestId: string,
    input: UpdateDsarRequestStatusDto,
  ) {
    const existing = await this.prisma.dsarRequest.findUnique({
      where: { id: requestId },
    });

    if (!existing) {
      throw new NotFoundException('DSAR request not found');
    }

    const shouldResolve =
      input.status === DsarRequestStatus.COMPLETED ||
      input.status === DsarRequestStatus.REJECTED;

    const updated = await this.prisma.dsarRequest.update({
      where: { id: requestId },
      data: {
        status: input.status,
        resolutionNote: this.normalizeOptionalText(input.resolutionNote, 2000),
        resolvedAt: shouldResolve ? new Date() : null,
        resolvedByUserId: shouldResolve ? adminUserId : null,
      },
    });

    await this.createAdminAuditLog(
      adminUserId,
      'privacy.dsar.status_update',
      'dsar_request',
      updated.id,
      {
        status: updated.status,
      },
    );

    return { request: this.serializeDsarRequest(updated) };
  }

  public async listAdminAuditLogs(limit: number) {
    const rows = await this.prisma.adminAuditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        adminUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return {
      logs: rows.map((row) => ({
        id: row.id,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        details: row.details,
        createdAt: row.createdAt.toISOString(),
        adminUser: row.adminUser,
      })),
    };
  }

  private async exportUserDataByUserId(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        sessions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
            ipHash: true,
            userAgent: true,
          },
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          include: {
            plan: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: {
            plan: true,
          },
        },
        cookiePreferences: {
          orderBy: { updatedAt: 'desc' },
        },
        consentLogs: {
          orderBy: { consentedAt: 'desc' },
        },
        dsarRequests: {
          orderBy: { requestedAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [demoRequests, contactMessages, newsletterSubscriber] =
      await Promise.all([
        this.prisma.demoRequest.findMany({
          where: { workEmail: user.email },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.contactMessage.findMany({
          where: { email: user.email },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.newsletterSubscriber.findUnique({
          where: { email: user.email },
        }),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        roles: user.roles.map((entry) => entry.role.name).sort(),
      },
      sessions: user.sessions.map((session) => ({
        id: session.id,
        ipHash: session.ipHash,
        userAgent: session.userAgent,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        revokedAt: session.revokedAt?.toISOString() ?? null,
      })),
      billing: {
        subscriptions: user.subscriptions.map((subscription) => ({
          id: subscription.id,
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          currentPeriodStart:
            subscription.currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd:
            subscription.currentPeriodEnd?.toISOString() ?? null,
          canceledAt: subscription.canceledAt?.toISOString() ?? null,
          createdAt: subscription.createdAt.toISOString(),
          plan: subscription.plan
            ? {
                key: subscription.plan.key,
                name: subscription.plan.name,
                amountCents: subscription.plan.amountCents,
                currency: subscription.plan.currency,
                interval: subscription.plan.interval,
              }
            : null,
        })),
        payments: user.payments.map((payment) => ({
          id: payment.id,
          amountCents: payment.amountCents,
          currency: payment.currency,
          status: payment.status,
          paidAt: payment.paidAt?.toISOString() ?? null,
          failedAt: payment.failedAt?.toISOString() ?? null,
          createdAt: payment.createdAt.toISOString(),
          plan: payment.plan
            ? {
                key: payment.plan.key,
                name: payment.plan.name,
                interval: payment.plan.interval,
              }
            : null,
        })),
      },
      leads: {
        demoRequests: demoRequests.map((row) => ({
          id: row.id,
          fullName: row.fullName,
          company: row.company,
          jobTitle: row.jobTitle,
          teamSize: row.teamSize,
          useCase: row.useCase,
          message: row.message,
          status: row.status,
          source: row.source,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
        contactMessages: contactMessages.map((row) => ({
          id: row.id,
          fullName: row.fullName,
          company: row.company,
          topic: row.topic,
          message: row.message,
          source: row.source,
          createdAt: row.createdAt.toISOString(),
        })),
        newsletterSubscriber: newsletterSubscriber
          ? {
              id: newsletterSubscriber.id,
              fullName: newsletterSubscriber.fullName,
              status: newsletterSubscriber.status,
              subscribedAt:
                newsletterSubscriber.subscribedAt?.toISOString() ?? null,
              unsubscribedAt:
                newsletterSubscriber.unsubscribedAt?.toISOString() ?? null,
              source: newsletterSubscriber.source,
              createdAt: newsletterSubscriber.createdAt.toISOString(),
              updatedAt: newsletterSubscriber.updatedAt.toISOString(),
            }
          : null,
      },
      privacy: {
        cookiePreferences: user.cookiePreferences.map((preference) => ({
          id: preference.id,
          anonymousId: preference.anonymousId,
          necessary: preference.necessary,
          analytics: preference.analytics,
          marketing: preference.marketing,
          policyVersion: preference.policyVersion,
          source: preference.source,
          updatedAt: preference.updatedAt.toISOString(),
        })),
        consentLogs: user.consentLogs.map((log) => ({
          id: log.id,
          anonymousId: log.anonymousId,
          necessary: log.necessary,
          analytics: log.analytics,
          marketing: log.marketing,
          policyVersion: log.policyVersion,
          source: log.source,
          consentedAt: log.consentedAt.toISOString(),
        })),
        dsarRequests: user.dsarRequests.map((request) =>
          this.serializeDsarRequest(request),
        ),
      },
    };
  }

  private async resolveOptionalAuthUser(
    request: Request,
  ): Promise<AuthenticatedUser | null> {
    const sessionToken = this.authService.extractSessionToken(request);

    if (!sessionToken) {
      return null;
    }

    const session = await this.authService.resolveSession(sessionToken);
    return session?.user ?? null;
  }

  private getRequestMeta(request: Request): {
    ipHash: string | null;
    userAgent: string | null;
  } {
    const ip = this.extractIp(request);
    const ipHash = ip ? this.hashIp(ip) : null;

    const userAgentHeader = request.headers['user-agent'];
    const userAgent =
      typeof userAgentHeader === 'string' && userAgentHeader.trim().length > 0
        ? userAgentHeader.slice(0, 512)
        : null;

    return {
      ipHash,
      userAgent,
    };
  }

  private extractIp(request: Request): string | null {
    const forwardedFor = request.headers['x-forwarded-for'];

    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
      return forwardedFor.split(',')[0]?.trim() ?? null;
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0]?.split(',')[0]?.trim() ?? null;
    }

    return typeof request.ip === 'string' && request.ip.length > 0
      ? request.ip
      : null;
  }

  private hashIp(ip: string): string {
    return createHmac('sha256', this.sessionSecret).update(ip).digest('hex');
  }

  private normalizeAnonymousId(value: string | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, '');

    if (sanitized.length < 8) {
      return null;
    }

    return sanitized.slice(0, 120);
  }

  private normalizePolicyVersion(value: string | undefined): string {
    if (typeof value !== 'string') {
      return this.defaultPolicyVersion;
    }

    const trimmed = value.trim();
    return trimmed.length > 0
      ? trimmed.slice(0, 64)
      : this.defaultPolicyVersion;
  }

  private normalizeSource(value: string | undefined): string {
    if (typeof value !== 'string') {
      return DEFAULT_CONSENT_SOURCE;
    }

    const trimmed = value.trim();
    return trimmed.length > 0
      ? trimmed.toLowerCase().slice(0, 32)
      : DEFAULT_CONSENT_SOURCE;
  }

  private normalizeOptionalText(
    value: string | undefined,
    maxLength: number,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed.slice(0, maxLength);
  }

  private serializeDsarRequest(request: {
    id: string;
    requesterEmail: string;
    type: DsarRequestType;
    status: DsarRequestStatus;
    details: string | null;
    source: string | null;
    requestedAt: Date;
    resolvedAt: Date | null;
    resolutionNote: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: request.id,
      requesterEmail: request.requesterEmail,
      type: request.type,
      status: request.status,
      details: request.details,
      source: request.source,
      requestedAt: request.requestedAt.toISOString(),
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
      resolutionNote: request.resolutionNote,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  private async createAdminAuditLog(
    adminUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: Prisma.JsonObject,
  ) {
    await this.prisma.adminAuditLog.create({
      data: {
        adminUserId,
        action,
        targetType,
        targetId,
        details,
      },
    });
  }
}
