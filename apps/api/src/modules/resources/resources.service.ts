import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ResourceAccessAction,
  ResourceDeliveryType,
  ResourceEntitlementMode,
  ResourceVisibility,
  type Prisma,
} from '@prisma/client';
import type { Request } from 'express';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BillingService } from '../billing/billing.service';
import { AttachResourceFileDto } from './dto/attach-resource-file.dto';
import { CreateResourceUploadUrlDto } from './dto/create-resource-upload-url.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { type ResourceAccessLogWindow } from './dto/list-resource-access-logs-query.dto';
import { LogResourceAccessDto } from './dto/log-resource-access.dto';
import { RequestResourceDownloadDto } from './dto/request-resource-download.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';

const DEFAULT_ACCESS_SOURCE = 'web';

type AccessContext = {
  user: AuthenticatedUser | null;
  activePlanId: string | null;
  activePlanKey: string | null;
};

type AccessDecision = {
  canAccess: boolean;
  requiresPlan: boolean;
  isLocked: boolean;
  requiredPlanKeys: string[];
};

type ResourceWithRelations = Prisma.ResourceGetPayload<{
  include: {
    planEntitlements: {
      include: {
        plan: {
          select: {
            id: true;
            key: true;
          };
        };
      };
    };
    asset: true;
  };
}>;

const DEFAULT_RESOURCES: Array<{
  key: string;
  title: string;
  summary: string;
  category: string;
  href: string;
  visibility: ResourceVisibility;
  sortOrder: number;
  deliveryType: ResourceDeliveryType;
  entitlementMode: ResourceEntitlementMode;
}> = [
  {
    key: 'eu-ai-act-regulation',
    title: 'EU AI Act Regulation (Official Text)',
    summary:
      'Primary legal text used for obligations, scope checks, and governance mapping.',
    category: 'Regulation',
    href: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj',
    visibility: ResourceVisibility.PUBLIC,
    sortOrder: 10,
    deliveryType: ResourceDeliveryType.LINK,
    entitlementMode: ResourceEntitlementMode.ALL_AUTHENTICATED,
  },
  {
    key: 'eu-ai-act-readiness-checklist',
    title: 'EU AI Act Readiness Checklist',
    summary:
      'Internal checklist for pre-release compliance readiness and evidence collection.',
    category: 'Checklist',
    href: '/resources',
    visibility: ResourceVisibility.AUTHENTICATED,
    sortOrder: 20,
    deliveryType: ResourceDeliveryType.LINK,
    entitlementMode: ResourceEntitlementMode.ALL_AUTHENTICATED,
  },
  {
    key: 'article-11-doc-template',
    title: 'Article 11 Technical Documentation Template',
    summary:
      'Structured template for documenting design decisions, controls, and test evidence.',
    category: 'Template',
    href: '/resources',
    visibility: ResourceVisibility.AUTHENTICATED,
    sortOrder: 30,
    deliveryType: ResourceDeliveryType.LINK,
    entitlementMode: ResourceEntitlementMode.ALL_AUTHENTICATED,
  },
  {
    key: 'governance-operating-model-guide',
    title: 'Governance Operating Model Guide',
    summary:
      'Team ownership model for legal, product, engineering, and security stakeholders.',
    category: 'Guide',
    href: '/resources',
    visibility: ResourceVisibility.PUBLIC,
    sortOrder: 40,
    deliveryType: ResourceDeliveryType.LINK,
    entitlementMode: ResourceEntitlementMode.ALL_AUTHENTICATED,
  },
];

@Injectable()
export class ResourcesService implements OnModuleInit {
  private readonly sessionSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly billingService: BillingService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {
    this.sessionSecret =
      this.configService.getOrThrow<string>('SESSION_SECRET');
  }

  public async onModuleInit(): Promise<void> {
    for (const resource of DEFAULT_RESOURCES) {
      await this.prisma.resource.upsert({
        where: { key: resource.key },
        update: {},
        create: {
          key: resource.key,
          title: resource.title,
          summary: resource.summary,
          category: resource.category,
          href: resource.href,
          visibility: resource.visibility,
          deliveryType: resource.deliveryType,
          entitlementMode: resource.entitlementMode,
          sortOrder: resource.sortOrder,
          active: true,
        },
      });
    }
  }

  public async listResources(request: Request) {
    const access = await this.resolveAccessContext(request);

    const resources = await this.prisma.resource.findMany({
      where: {
        active: true,
        visibility: access.user
          ? {
              in: [ResourceVisibility.PUBLIC, ResourceVisibility.AUTHENTICATED],
            }
          : ResourceVisibility.PUBLIC,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        asset: true,
        planEntitlements: {
          include: {
            plan: {
              select: {
                id: true,
                key: true,
              },
            },
          },
        },
      },
    });

    return {
      resources: resources.map((resource) =>
        this.toClientResource(resource, access),
      ),
    };
  }

  public async listAuthenticatedResources(request: Request) {
    const access = await this.resolveAccessContext(request);

    if (!access.user) {
      throw new UnauthorizedException('Authentication required');
    }

    const resources = await this.prisma.resource.findMany({
      where: {
        active: true,
        visibility: {
          in: [ResourceVisibility.PUBLIC, ResourceVisibility.AUTHENTICATED],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        asset: true,
        planEntitlements: {
          include: {
            plan: {
              select: {
                id: true,
                key: true,
              },
            },
          },
        },
      },
    });

    return {
      resources: resources.map((resource) =>
        this.toClientResource(resource, access),
      ),
    };
  }

  public async logResourceAccess(
    request: Request,
    resourceId: string,
    input: LogResourceAccessDto,
  ) {
    const access = await this.resolveAccessContext(request);

    const resource = await this.findActiveResource(resourceId);

    const decision = this.resolveAccessDecision(resource, access);

    if (!decision.canAccess) {
      this.raiseAccessError(resource, access);
    }

    const anonymousId = this.normalizeAnonymousId(input.anonymousId);

    if (!access.user && !anonymousId) {
      throw new BadRequestException(
        'anonymousId is required for unauthenticated resource access tracking',
      );
    }

    await this.createAccessLog({
      request,
      resourceId: resource.id,
      userId: access.user?.id,
      anonymousId,
      action: input.action ?? ResourceAccessAction.VIEW,
      source: this.normalizeSource(input.source),
    });

    return {
      success: true,
      resource: {
        id: resource.id,
        key: resource.key,
        href: resource.href,
      },
    };
  }

  public async requestResourceDownload(
    request: Request,
    resourceId: string,
    input: RequestResourceDownloadDto,
  ) {
    const access = await this.resolveAccessContext(request);
    const resource = await this.findActiveResource(resourceId);
    const decision = this.resolveAccessDecision(resource, access);

    if (!decision.canAccess) {
      this.raiseAccessError(resource, access);
    }

    const anonymousId = this.normalizeAnonymousId(input.anonymousId);

    if (!access.user && !anonymousId) {
      throw new BadRequestException(
        'anonymousId is required for unauthenticated resource downloads',
      );
    }

    if (resource.deliveryType === ResourceDeliveryType.FILE) {
      if (!resource.asset) {
        throw new NotFoundException('File is not attached for this resource');
      }

      const signed = await this.storageService.createResourceDownloadUrl({
        storageKey: resource.asset.storageKey,
        fileName: resource.asset.fileName,
      });

      await this.createAccessLog({
        request,
        resourceId: resource.id,
        userId: access.user?.id,
        anonymousId,
        action: ResourceAccessAction.DOWNLOAD,
        source: this.normalizeSource(input.source),
      });

      return {
        downloadUrl: signed.url,
        expiresInSeconds: signed.expiresInSeconds,
        direct: false,
        fileName: resource.asset.fileName,
      };
    }

    await this.createAccessLog({
      request,
      resourceId: resource.id,
      userId: access.user?.id,
      anonymousId,
      action: ResourceAccessAction.VIEW,
      source: this.normalizeSource(input.source),
    });

    return {
      downloadUrl: resource.href,
      expiresInSeconds: null,
      direct: true,
      fileName: null,
    };
  }

  public async listAdminResources(limit: number) {
    const resources = await this.prisma.resource.findMany({
      take: limit,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: {
            accessLogs: true,
          },
        },
        asset: true,
        planEntitlements: {
          include: {
            plan: {
              select: {
                key: true,
              },
            },
          },
        },
      },
    });

    const resourceIds = resources.map((resource) => resource.id);
    const latestAccessByResource =
      resourceIds.length > 0
        ? await this.prisma.resourceAccessLog.groupBy({
            by: ['resourceId'],
            where: {
              resourceId: {
                in: resourceIds,
              },
            },
            _max: {
              createdAt: true,
            },
          })
        : [];

    const latestByResource = new Map<string, string | null>(
      latestAccessByResource.map((entry) => [
        entry.resourceId,
        entry._max.createdAt?.toISOString() ?? null,
      ]),
    );

    return {
      resources: resources.map((resource) => ({
        id: resource.id,
        key: resource.key,
        title: resource.title,
        summary: resource.summary,
        category: resource.category,
        href: resource.href,
        visibility: resource.visibility,
        deliveryType: resource.deliveryType,
        entitlementMode: resource.entitlementMode,
        entitledPlanKeys: resource.planEntitlements.map(
          (entry) => entry.plan.key,
        ),
        active: resource.active,
        sortOrder: resource.sortOrder,
        hasFile: Boolean(resource.asset),
        fileName: resource.asset?.fileName ?? null,
        fileSizeBytes: resource.asset?.sizeBytes ?? null,
        fileMimeType: resource.asset?.mimeType ?? null,
        totalAccesses: resource._count.accessLogs,
        lastAccessAt: latestByResource.get(resource.id) ?? null,
      })),
    };
  }

  public getAdminStorageStatus() {
    return this.storageService.getStorageStatus();
  }

  public async createResource(adminUserId: string, input: CreateResourceDto) {
    const key = this.normalizeResourceKey(input.key);
    const entitlementMode =
      input.entitlementMode ?? ResourceEntitlementMode.ALL_AUTHENTICATED;
    const planKeys = this.normalizePlanKeys(input.entitledPlanKeys);

    const planIds =
      planKeys.length > 0 ? await this.resolvePlanIdsByKeys(planKeys) : [];

    if (
      entitlementMode === ResourceEntitlementMode.PLAN_RESTRICTED &&
      planIds.length === 0
    ) {
      throw new BadRequestException(
        'At least one entitled plan key is required for plan-restricted resources',
      );
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const createdResource = await tx.resource.create({
          data: {
            key,
            title: input.title.trim(),
            summary: input.summary.trim(),
            category: this.normalizeOptionalString(input.category, 80),
            href: this.normalizeResourceHref(input.href),
            visibility: input.visibility ?? ResourceVisibility.AUTHENTICATED,
            deliveryType: input.deliveryType ?? ResourceDeliveryType.LINK,
            entitlementMode,
            active: input.active ?? true,
            sortOrder: input.sortOrder ?? 100,
          },
        });

        if (planIds.length > 0) {
          await tx.planResourceEntitlement.createMany({
            data: planIds.map((planId) => ({
              planId,
              resourceId: createdResource.id,
            })),
          });
        }

        return createdResource;
      });

      await this.createAdminAuditLog(
        adminUserId,
        'resources.create',
        'resource',
        created.id,
        {
          key: created.key,
        },
      );

      return {
        resource: {
          id: created.id,
          key: created.key,
        },
      };
    } catch (error) {
      if (
        this.isUniqueConstraintError(error) &&
        this.includesConstraintTarget(error, 'key')
      ) {
        throw new ConflictException('Resource key already exists');
      }

      throw error;
    }
  }

  public async updateResource(
    adminUserId: string,
    resourceId: string,
    input: UpdateResourceDto,
  ) {
    const existing = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      include: {
        planEntitlements: {
          select: {
            planId: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Resource not found');
    }

    const nextEntitlementMode =
      input.entitlementMode ?? existing.entitlementMode;
    const hasPlanKeysInput = Array.isArray(input.entitledPlanKeys);
    const normalizedPlanKeys = this.normalizePlanKeys(input.entitledPlanKeys);
    const planIdsFromInput = hasPlanKeysInput
      ? await this.resolvePlanIdsByKeys(normalizedPlanKeys)
      : null;

    if (
      nextEntitlementMode === ResourceEntitlementMode.PLAN_RESTRICTED &&
      hasPlanKeysInput &&
      (planIdsFromInput?.length ?? 0) === 0
    ) {
      throw new BadRequestException(
        'At least one entitled plan key is required for plan-restricted resources',
      );
    }

    if (
      nextEntitlementMode === ResourceEntitlementMode.PLAN_RESTRICTED &&
      !hasPlanKeysInput &&
      existing.planEntitlements.length === 0
    ) {
      throw new BadRequestException(
        'At least one entitled plan key is required for plan-restricted resources',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.resource.update({
        where: { id: resourceId },
        data: {
          ...(typeof input.title === 'string'
            ? { title: input.title.trim() }
            : {}),
          ...(typeof input.summary === 'string'
            ? { summary: input.summary.trim() }
            : {}),
          ...(typeof input.category === 'string'
            ? {
                category: this.normalizeOptionalString(input.category, 80),
              }
            : {}),
          ...(typeof input.href === 'string'
            ? { href: this.normalizeResourceHref(input.href) }
            : {}),
          ...(input.visibility ? { visibility: input.visibility } : {}),
          ...(input.deliveryType ? { deliveryType: input.deliveryType } : {}),
          ...(input.entitlementMode
            ? { entitlementMode: input.entitlementMode }
            : {}),
          ...(typeof input.active === 'boolean'
            ? { active: input.active }
            : {}),
          ...(typeof input.sortOrder === 'number'
            ? { sortOrder: input.sortOrder }
            : {}),
        },
      });

      if (nextEntitlementMode === ResourceEntitlementMode.ALL_AUTHENTICATED) {
        await tx.planResourceEntitlement.deleteMany({
          where: {
            resourceId,
          },
        });
      } else if (planIdsFromInput) {
        await tx.planResourceEntitlement.deleteMany({
          where: {
            resourceId,
          },
        });

        if (planIdsFromInput.length > 0) {
          await tx.planResourceEntitlement.createMany({
            data: planIdsFromInput.map((planId) => ({
              planId,
              resourceId,
            })),
          });
        }
      }

      return row;
    });

    await this.createAdminAuditLog(
      adminUserId,
      'resources.update',
      'resource',
      updated.id,
      {
        key: updated.key,
      },
    );

    return {
      resource: {
        id: updated.id,
        key: updated.key,
      },
    };
  }

  public async createResourceFileUploadUrl(
    adminUserId: string,
    resourceId: string,
    input: CreateResourceUploadUrlDto,
  ) {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { id: true, key: true },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    const upload = await this.storageService.createResourceUploadUrl({
      resourceId,
      fileName: input.fileName,
      mimeType: input.mimeType,
    });

    await this.createAdminAuditLog(
      adminUserId,
      'resources.file_upload_url',
      'resource',
      resourceId,
      {
        key: resource.key,
        storageKey: upload.storageKey,
      },
    );

    return upload;
  }

  public async attachResourceFile(
    adminUserId: string,
    resourceId: string,
    input: AttachResourceFileDto,
  ) {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { id: true, key: true },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    const normalizedStorageKey = input.storageKey.trim();

    if (!normalizedStorageKey.includes(`/resources/${resourceId}/`)) {
      throw new BadRequestException(
        'storageKey must match the generated upload key for this resource',
      );
    }

    await this.storageService.assertObjectExists(
      normalizedStorageKey,
      input.sizeBytes,
    );

    const bucket = this.storageService.getBucket();

    const asset = await this.prisma.$transaction(async (tx) => {
      await tx.resource.update({
        where: { id: resourceId },
        data: {
          deliveryType: ResourceDeliveryType.FILE,
        },
      });

      return tx.resourceAsset.upsert({
        where: {
          resourceId,
        },
        update: {
          storageKey: normalizedStorageKey,
          bucket,
          fileName: input.fileName.trim(),
          mimeType: input.mimeType.trim().toLowerCase(),
          sizeBytes: input.sizeBytes,
          checksumSha256: input.checksumSha256?.toLowerCase() ?? null,
          uploadedByUserId: adminUserId,
        },
        create: {
          resourceId,
          storageKey: normalizedStorageKey,
          bucket,
          fileName: input.fileName.trim(),
          mimeType: input.mimeType.trim().toLowerCase(),
          sizeBytes: input.sizeBytes,
          checksumSha256: input.checksumSha256?.toLowerCase() ?? null,
          uploadedByUserId: adminUserId,
        },
      });
    });

    await this.createAdminAuditLog(
      adminUserId,
      'resources.file_attach',
      'resource',
      resourceId,
      {
        key: resource.key,
        storageKey: normalizedStorageKey,
        fileName: asset.fileName,
      },
    );

    return {
      file: {
        id: asset.id,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
      },
    };
  }

  public async listResourceAccessLogs(
    limit: number,
    window: ResourceAccessLogWindow,
  ) {
    const now = new Date();
    const windowDays =
      window === '7d'
        ? 7
        : window === '30d'
          ? 30
          : window === '90d'
            ? 90
            : null;
    const windowStart =
      typeof windowDays === 'number'
        ? new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
        : null;

    const logs = await this.prisma.resourceAccessLog.findMany({
      where: windowStart
        ? {
            createdAt: {
              gte: windowStart,
            },
          }
        : undefined,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        resource: {
          select: {
            id: true,
            key: true,
            title: true,
          },
        },
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
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        source: log.source,
        createdAt: log.createdAt.toISOString(),
        anonymousId: log.anonymousId,
        user: log.user,
        resource: log.resource,
      })),
    };
  }

  private async findActiveResource(
    resourceId: string,
  ): Promise<ResourceWithRelations> {
    const resource = await this.prisma.resource.findFirst({
      where: {
        id: resourceId,
        active: true,
      },
      include: {
        asset: true,
        planEntitlements: {
          include: {
            plan: {
              select: {
                id: true,
                key: true,
              },
            },
          },
        },
      },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    return resource;
  }

  private toClientResource(
    resource: ResourceWithRelations,
    access: AccessContext,
  ) {
    const decision = this.resolveAccessDecision(resource, access);

    return {
      id: resource.id,
      key: resource.key,
      title: resource.title,
      summary: resource.summary,
      category: resource.category,
      href: resource.href,
      visibility: resource.visibility,
      deliveryType: resource.deliveryType,
      entitlementMode: resource.entitlementMode,
      isGated: resource.visibility !== ResourceVisibility.PUBLIC,
      requiresPlan: decision.requiresPlan,
      isLocked: decision.isLocked,
      requiredPlanKeys: decision.requiredPlanKeys,
      hasFile: Boolean(resource.asset),
      fileName: resource.asset?.fileName ?? null,
      fileSizeBytes: resource.asset?.sizeBytes ?? null,
      fileMimeType: resource.asset?.mimeType ?? null,
    };
  }

  private resolveAccessDecision(
    resource: ResourceWithRelations,
    access: AccessContext,
  ): AccessDecision {
    const requiredPlanKeys = resource.planEntitlements
      .map((entry) => entry.plan.key)
      .sort();

    if (resource.visibility === ResourceVisibility.PUBLIC) {
      return {
        canAccess: true,
        requiresPlan: false,
        isLocked: false,
        requiredPlanKeys,
      };
    }

    if (!access.user) {
      return {
        canAccess: false,
        requiresPlan:
          resource.entitlementMode === ResourceEntitlementMode.PLAN_RESTRICTED,
        isLocked: true,
        requiredPlanKeys,
      };
    }

    if (
      resource.entitlementMode === ResourceEntitlementMode.ALL_AUTHENTICATED
    ) {
      return {
        canAccess: true,
        requiresPlan: false,
        isLocked: false,
        requiredPlanKeys,
      };
    }

    const entitledPlanIds = new Set(
      resource.planEntitlements.map((entry) => entry.plan.id),
    );

    const canAccess = access.activePlanId
      ? entitledPlanIds.has(access.activePlanId)
      : false;

    return {
      canAccess,
      requiresPlan: true,
      isLocked: !canAccess,
      requiredPlanKeys,
    };
  }

  private async resolveAccessContext(request: Request): Promise<AccessContext> {
    const user = await this.resolveOptionalAuthUser(request);

    if (!user) {
      return {
        user: null,
        activePlanId: null,
        activePlanKey: null,
      };
    }

    const subscription = await this.billingService.findLatestActiveSubscription(
      user.id,
    );

    return {
      user,
      activePlanId: subscription?.plan?.id ?? null,
      activePlanKey: subscription?.plan?.key ?? null,
    };
  }

  private raiseAccessError(
    resource: ResourceWithRelations,
    access: AccessContext,
  ): never {
    if (!access.user) {
      throw new UnauthorizedException(
        'Authentication required for this resource',
      );
    }

    if (resource.entitlementMode === ResourceEntitlementMode.PLAN_RESTRICTED) {
      throw new ForbiddenException(
        'Active subscription plan does not grant access to this resource',
      );
    }

    throw new ForbiddenException('Access denied for this resource');
  }

  private async createAccessLog(input: {
    request: Request;
    resourceId: string;
    userId: string | undefined;
    anonymousId: string | null;
    action: ResourceAccessAction;
    source: string;
  }): Promise<void> {
    const requestMeta = this.getRequestMeta(input.request);

    await this.prisma.resourceAccessLog.create({
      data: {
        resourceId: input.resourceId,
        userId: input.userId,
        anonymousId: input.anonymousId,
        action: input.action,
        source: input.source,
        ipHash: requestMeta.ipHash,
        userAgent: requestMeta.userAgent,
      },
    });
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
    const forwardedFor = request.headers['x-forwarded-for'];

    const ip =
      typeof forwardedFor === 'string' && forwardedFor.trim().length > 0
        ? (forwardedFor.split(',')[0]?.trim() ?? null)
        : Array.isArray(forwardedFor) && forwardedFor.length > 0
          ? (forwardedFor[0]?.split(',')[0]?.trim() ?? null)
          : typeof request.ip === 'string' && request.ip.length > 0
            ? request.ip
            : null;

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

  private normalizeSource(value: string | undefined): string {
    if (typeof value !== 'string') {
      return DEFAULT_ACCESS_SOURCE;
    }

    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed.slice(0, 32) : DEFAULT_ACCESS_SOURCE;
  }

  private normalizeResourceKey(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);

    if (!normalized) {
      throw new BadRequestException('Resource key is invalid');
    }

    return normalized;
  }

  private normalizeResourceHref(value: string): string {
    const trimmed = value.trim();

    if (!trimmed) {
      throw new BadRequestException('Resource href is required');
    }

    if (trimmed.startsWith('/')) {
      return trimmed.slice(0, 500);
    }

    try {
      const url = new URL(trimmed);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new BadRequestException('Resource href must use http or https');
      }

      return url.toString().slice(0, 500);
    } catch {
      throw new BadRequestException(
        'Resource href must be an absolute URL or root-relative path',
      );
    }
  }

  private normalizeOptionalString(
    value: string | undefined,
    maxLength: number,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
  }

  private normalizePlanKeys(keys: string[] | undefined): string[] {
    if (!Array.isArray(keys)) {
      return [];
    }

    const unique = new Set<string>();

    for (const key of keys) {
      if (typeof key !== 'string') {
        continue;
      }

      const normalized = key.trim().toLowerCase();

      if (!normalized) {
        continue;
      }

      unique.add(normalized.slice(0, 64));
    }

    return Array.from(unique).sort();
  }

  private async resolvePlanIdsByKeys(planKeys: string[]): Promise<string[]> {
    if (planKeys.length === 0) {
      return [];
    }

    const plans = await this.prisma.plan.findMany({
      where: {
        key: {
          in: planKeys,
        },
        active: true,
      },
      select: {
        id: true,
        key: true,
      },
    });

    if (plans.length !== planKeys.length) {
      const resolved = new Set(plans.map((plan) => plan.key));
      const missing = planKeys.filter((key) => !resolved.has(key));

      throw new BadRequestException(
        `Unknown or inactive plan keys: ${missing.join(', ')}`,
      );
    }

    return plans.map((plan) => plan.id);
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private includesConstraintTarget(error: unknown, field: string): boolean {
    if (
      !error ||
      typeof error !== 'object' ||
      !('meta' in error) ||
      typeof (error as { meta?: unknown }).meta !== 'object' ||
      !(error as { meta?: { target?: unknown } }).meta?.target
    ) {
      return false;
    }

    const target = (error as { meta?: { target?: unknown } }).meta?.target;

    if (Array.isArray(target)) {
      return target.includes(field);
    }

    if (typeof target === 'string') {
      return target.includes(field);
    }

    return false;
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
