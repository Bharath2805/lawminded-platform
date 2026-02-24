import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingInterval,
  PaymentStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ADMIN_ROLE_NAME = 'admin';
const ASSISTANT_ACCESS_ROLE_NAME = 'assistant_access';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINALIZED_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.SUCCEEDED,
  PaymentStatus.FAILED,
  PaymentStatus.CANCELED,
  PaymentStatus.REFUNDED,
];

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  public async getOverview() {
    const now = new Date();

    const [
      usersTotal,
      usersActive,
      adminCount,
      activeSessions,
      demoRequestsTotal,
      contactMessagesTotal,
      newsletterSubscribersTotal,
      activeSubscriptions,
      recurringRevenueSubscriptions,
      consentLogsTotal,
      dsarRequestsTotal,
      dsarRequestsOpen,
      resourcesTotal,
      resourceAccessLogsTotal,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.userRole.count({
        where: {
          role: {
            name: 'admin',
          },
        },
      }),
      this.prisma.session.count({
        where: {
          revokedAt: null,
          expiresAt: { gt: now },
        },
      }),
      this.prisma.demoRequest.count(),
      this.prisma.contactMessage.count(),
      this.prisma.newsletterSubscriber.count({
        where: { status: 'SUBSCRIBED' },
      }),
      this.prisma.subscription.count({
        where: {
          status: {
            in: ['TRIALING', 'ACTIVE', 'PAST_DUE'],
          },
        },
      }),
      this.prisma.subscription.findMany({
        where: {
          status: {
            in: ['TRIALING', 'ACTIVE', 'PAST_DUE'],
          },
          plan: {
            isNot: null,
          },
        },
        include: { plan: true },
      }),
      this.prisma.consentLog.count(),
      this.prisma.dsarRequest.count(),
      this.prisma.dsarRequest.count({
        where: {
          status: {
            in: ['OPEN', 'IN_PROGRESS'],
          },
        },
      }),
      this.prisma.resource.count({
        where: { active: true },
      }),
      this.prisma.resourceAccessLog.count(),
    ]);

    return {
      users: {
        total: usersTotal,
        active: usersActive,
        admin: adminCount,
      },
      sessions: {
        active: activeSessions,
      },
      leads: {
        demoRequests: demoRequestsTotal,
        contactMessages: contactMessagesTotal,
        newsletterSubscribers: newsletterSubscribersTotal,
      },
      billing: {
        activeSubscriptions,
        monthlyRecurringRevenueCents:
          this.toMonthlyRecurringRevenue(recurringRevenueSubscriptions) ?? 0,
      },
      privacy: {
        consentLogs: consentLogsTotal,
        dsarRequests: dsarRequestsTotal,
        dsarOpen: dsarRequestsOpen,
      },
      resources: {
        active: resourcesTotal,
        accessLogs: resourceAccessLogsTotal,
      },
    };
  }

  public async listUsers(limit: number, search?: string) {
    const now = new Date();
    const normalizedSearch = search?.trim() ?? '';
    const hasSearch = normalizedSearch.length > 0;
    const isUuidSearch = UUID_PATTERN.test(normalizedSearch);

    const where: Prisma.UserWhereInput = hasSearch
      ? {
          OR: [
            {
              email: {
                contains: normalizedSearch,
                mode: 'insensitive',
              },
            },
            ...(isUuidSearch
              ? [
                  {
                    id: normalizedSearch,
                  },
                ]
              : []),
          ],
        }
      : {};

    const [users, totalMatching] = await Promise.all([
      this.prisma.user.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          sessions: {
            where: {
              revokedAt: null,
              expiresAt: { gt: now },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              expiresAt: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const userIds = users.map((user) => user.id);

    const activeSessionCounts =
      userIds.length > 0
        ? await this.prisma.session.groupBy({
            by: ['userId'],
            where: {
              userId: {
                in: userIds,
              },
              revokedAt: null,
              expiresAt: {
                gt: now,
              },
            },
            _count: {
              _all: true,
            },
          })
        : [];

    const activeSessionCountByUserId = new Map<string, number>(
      activeSessionCounts.map((entry) => [entry.userId, entry._count._all]),
    );

    return {
      users: users.map((user) =>
        this.serializeUserRow(
          user,
          activeSessionCountByUserId.get(user.id) ?? 0,
        ),
      ),
      meta: {
        search: hasSearch ? normalizedSearch : null,
        limit,
        totalMatching,
      },
    };
  }

  public async listBilling(limit: number) {
    const [subscriptions, payments] = await Promise.all([
      this.prisma.subscription.findMany({
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
          plan: true,
        },
      }),
      this.prisma.payment.findMany({
        where: {
          status: {
            in: FINALIZED_PAYMENT_STATUSES,
          },
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
          plan: true,
        },
      }),
    ]);

    return {
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        user: subscription.user,
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
      payments: payments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        amountCents: payment.amountCents,
        currency: payment.currency,
        createdAt: payment.createdAt.toISOString(),
        paidAt: payment.paidAt?.toISOString() ?? null,
        user: payment.user,
        plan: payment.plan
          ? {
              key: payment.plan.key,
              name: payment.plan.name,
              interval: payment.plan.interval,
            }
          : null,
      })),
    };
  }

  public async updateUserStatus(
    adminUserId: string,
    userId: string,
    status: UserStatus,
  ) {
    if (status !== UserStatus.ACTIVE && status !== UserStatus.SUSPENDED) {
      throw new BadRequestException('Only ACTIVE and SUSPENDED are supported');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        sessions: {
          where: {
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            createdAt: true,
            expiresAt: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const isAdmin = existing.roles.some(
      (entry) => entry.role.name === ADMIN_ROLE_NAME,
    );

    if (userId === adminUserId && status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('You cannot suspend your own account');
    }

    if (status === UserStatus.SUSPENDED && isAdmin) {
      const activeAdminCount = await this.countActiveAdminUsers();

      if (activeAdminCount <= 1) {
        throw new ForbiddenException('Cannot suspend the last active admin');
      }
    }

    const now = new Date();

    const updateResult = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { status },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          sessions: {
            where: {
              revokedAt: null,
              expiresAt: { gt: now },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              createdAt: true,
              expiresAt: true,
            },
          },
        },
      });

      let revokedSessions = 0;

      if (status === UserStatus.SUSPENDED) {
        const revoked = await tx.session.updateMany({
          where: {
            userId,
            revokedAt: null,
            expiresAt: {
              gt: now,
            },
          },
          data: {
            revokedAt: now,
          },
        });

        revokedSessions = revoked.count;
      }

      await this.createAdminAuditLogTx(
        tx,
        adminUserId,
        'admin.users.status_update',
        'user',
        userId,
        {
          status,
          revokedSessions,
        },
      );

      return {
        user: updated,
        revokedSessions,
      };
    });

    const activeSessionCount = await this.countActiveSessionsForUser(userId);

    return {
      user: this.serializeUserRow(updateResult.user, activeSessionCount),
      revokedSessions: updateResult.revokedSessions,
    };
  }

  public async setUserAdminRole(
    adminUserId: string,
    userId: string,
    enabled: boolean,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        sessions: {
          where: {
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            createdAt: true,
            expiresAt: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const hasAdminRole = existing.roles.some(
      (entry) => entry.role.name === ADMIN_ROLE_NAME,
    );

    if (!enabled && hasAdminRole) {
      if (userId === adminUserId) {
        throw new ForbiddenException(
          'You cannot remove your own admin role from the current session',
        );
      }

      const activeAdminCount = await this.countActiveAdminUsers();

      if (activeAdminCount <= 1) {
        throw new ForbiddenException('Cannot remove the last active admin');
      }
    }

    if (enabled === hasAdminRole) {
      const activeSessionCount = await this.countActiveSessionsForUser(userId);

      return {
        user: this.serializeUserRow(existing, activeSessionCount),
      };
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const adminRole = await this.ensureAdminRole(tx);

      if (enabled) {
        await tx.userRole.upsert({
          where: {
            userId_roleId: {
              userId,
              roleId: adminRole.id,
            },
          },
          update: {
            assignedAt: new Date(),
          },
          create: {
            userId,
            roleId: adminRole.id,
          },
        });
      } else {
        await tx.userRole.deleteMany({
          where: {
            userId,
            roleId: adminRole.id,
          },
        });
      }

      await this.createAdminAuditLogTx(
        tx,
        adminUserId,
        'admin.users.role_update',
        'user',
        userId,
        {
          role: ADMIN_ROLE_NAME,
          enabled,
        },
      );

      return tx.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          sessions: {
            where: {
              revokedAt: null,
              expiresAt: {
                gt: new Date(),
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
            select: {
              createdAt: true,
              expiresAt: true,
            },
          },
        },
      });
    });

    const activeSessionCount = await this.countActiveSessionsForUser(userId);

    return {
      user: this.serializeUserRow(updatedUser, activeSessionCount),
    };
  }

  public async setUserAssistantAccess(
    adminUserId: string,
    userId: string,
    enabled: boolean,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        sessions: {
          where: {
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            createdAt: true,
            expiresAt: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const hasAssistantAccess = existing.roles.some(
      (entry) => entry.role.name === ASSISTANT_ACCESS_ROLE_NAME,
    );

    if (enabled === hasAssistantAccess) {
      const activeSessionCount = await this.countActiveSessionsForUser(userId);

      return {
        user: this.serializeUserRow(existing, activeSessionCount),
      };
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const assistantRole = await this.ensureRole(
        tx,
        ASSISTANT_ACCESS_ROLE_NAME,
        'AI assistant access',
      );

      if (enabled) {
        await tx.userRole.upsert({
          where: {
            userId_roleId: {
              userId,
              roleId: assistantRole.id,
            },
          },
          update: {
            assignedAt: new Date(),
          },
          create: {
            userId,
            roleId: assistantRole.id,
          },
        });
      } else {
        await tx.userRole.deleteMany({
          where: {
            userId,
            roleId: assistantRole.id,
          },
        });
      }

      await this.createAdminAuditLogTx(
        tx,
        adminUserId,
        'admin.users.assistant_access_update',
        'user',
        userId,
        {
          role: ASSISTANT_ACCESS_ROLE_NAME,
          enabled,
        },
      );

      return tx.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          sessions: {
            where: {
              revokedAt: null,
              expiresAt: {
                gt: new Date(),
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
            select: {
              createdAt: true,
              expiresAt: true,
            },
          },
        },
      });
    });

    const activeSessionCount = await this.countActiveSessionsForUser(userId);

    return {
      user: this.serializeUserRow(updatedUser, activeSessionCount),
    };
  }

  public async revokeUserSessions(adminUserId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          revokedAt: now,
        },
      });

      await this.createAdminAuditLogTx(
        tx,
        adminUserId,
        'admin.users.revoke_sessions',
        'user',
        userId,
        {
          revokedSessions: revoked.count,
        },
      );

      return revoked.count;
    });

    return {
      userId,
      revokedSessions: result,
    };
  }

  private toMonthlyRecurringRevenue(
    subscriptions: Array<{
      plan: {
        amountCents: number;
        interval: BillingInterval;
      } | null;
    }>,
  ): number {
    return subscriptions.reduce((sum, subscription) => {
      if (!subscription.plan) {
        return sum;
      }

      if (subscription.plan.interval === 'MONTH') {
        return sum + subscription.plan.amountCents;
      }

      if (subscription.plan.interval === 'YEAR') {
        return sum + Math.round(subscription.plan.amountCents / 12);
      }

      return sum;
    }, 0);
  }

  private async countActiveSessionsForUser(userId: string): Promise<number> {
    return this.prisma.session.count({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }

  private async countActiveAdminUsers(): Promise<number> {
    return this.prisma.user.count({
      where: {
        status: {
          in: [UserStatus.ACTIVE, UserStatus.INVITED],
        },
        roles: {
          some: {
            role: {
              name: ADMIN_ROLE_NAME,
            },
          },
        },
      },
    });
  }

  private async ensureAdminRole(
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string; name: string }> {
    return this.ensureRole(tx, ADMIN_ROLE_NAME, 'Platform administrators');
  }

  private async ensureRole(
    tx: Prisma.TransactionClient,
    name: string,
    description: string,
  ): Promise<{ id: string; name: string }> {
    return tx.role.upsert({
      where: { name },
      update: {},
      create: {
        name,
        description,
      },
      select: {
        id: true,
        name: true,
      },
    });
  }

  private async createAdminAuditLogTx(
    tx: Prisma.TransactionClient,
    adminUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: Prisma.JsonObject,
  ): Promise<void> {
    await tx.adminAuditLog.create({
      data: {
        adminUserId,
        action,
        targetType,
        targetId,
        details,
      },
    });
  }

  private serializeUserRow(
    user: {
      id: string;
      email: string;
      status: UserStatus;
      createdAt: Date;
      roles: Array<{
        role: {
          name: string;
        };
      }>;
      sessions: Array<{
        createdAt: Date;
        expiresAt: Date;
      }>;
    },
    activeSessionCount: number,
  ) {
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      roles: user.roles.map((entry) => entry.role.name).sort(),
      createdAt: user.createdAt.toISOString(),
      activeSessionCount,
      lastActiveSession: user.sessions[0]
        ? {
            createdAt: user.sessions[0].createdAt.toISOString(),
            expiresAt: user.sessions[0].expiresAt.toISOString(),
          }
        : null,
    };
  }
}
