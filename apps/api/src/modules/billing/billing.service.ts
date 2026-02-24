import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingInterval,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UpdatePlanSettingsDto } from './dto/update-plan-settings.dto';

const DEFAULT_WEB_APP_URL = 'http://localhost:3000';
const DEFAULT_CURRENCY = 'eur';

type SeedPlan = {
  key: string;
  name: string;
  description: string;
  amountCents: number;
  interval: BillingInterval;
  highlighted: boolean;
  chatbotEnabled: boolean;
  features: string[];
};

const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.UNPAID,
  SubscriptionStatus.INCOMPLETE,
];

const FINALIZED_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.SUCCEEDED,
  PaymentStatus.FAILED,
  PaymentStatus.CANCELED,
  PaymentStatus.REFUNDED,
];

const DEFAULT_PLAN_SEEDS: SeedPlan[] = [
  {
    key: 'starter_monthly',
    name: 'Starter',
    description: 'Core compliance operations for early-stage teams.',
    amountCents: 900,
    interval: BillingInterval.MONTH,
    highlighted: false,
    chatbotEnabled: false,
    features: [
      'Up to 3 team members',
      'Resource and policy template access',
      'Core policy templates',
    ],
  },
  {
    key: 'starter_yearly',
    name: 'Starter (Yearly)',
    description: 'Annual billing with lower monthly effective cost.',
    amountCents: 9000,
    interval: BillingInterval.YEAR,
    highlighted: false,
    chatbotEnabled: false,
    features: [
      'Up to 3 team members',
      'Annual billing discount',
      'Core policy templates',
    ],
  },
  {
    key: 'growth_monthly',
    name: 'Growth',
    description: 'Structured governance for growing product teams.',
    amountCents: 2900,
    interval: BillingInterval.MONTH,
    highlighted: true,
    chatbotEnabled: true,
    features: [
      'Up to 10 team members',
      'Premium chat assistant access',
      'Advanced workflow coverage',
      'Priority email support',
    ],
  },
  {
    key: 'growth_yearly',
    name: 'Growth (Yearly)',
    description: 'Annual Growth plan for predictable budgeting.',
    amountCents: 29000,
    interval: BillingInterval.YEAR,
    highlighted: true,
    chatbotEnabled: true,
    features: [
      'Up to 10 team members',
      'Premium chat assistant access',
      'Annual billing discount',
      'Priority email support',
    ],
  },
];

@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string | null;
  private readonly webAppUrl: string;
  private readonly premiumPlanKeys: Set<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const stripeSecretKey =
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY');

    this.stripe = new Stripe(stripeSecretKey);
    this.webhookSecret =
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET')?.trim() ?? null;
    this.webAppUrl =
      this.configService.get<string>('WEB_APP_URL')?.trim() ||
      DEFAULT_WEB_APP_URL;
    this.premiumPlanKeys = this.parsePremiumPlanKeys(
      this.configService.get<string>('PREMIUM_PLAN_KEYS'),
    );
  }

  public async onModuleInit(): Promise<void> {
    await this.ensureDefaultPlans();
  }

  public async listPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { active: true },
      orderBy: [{ amountCents: 'asc' }],
    });

    return {
      plans: plans.map((plan) => {
        const seed = DEFAULT_PLAN_SEEDS.find((entry) => entry.key === plan.key);

        return {
          key: plan.key,
          name: plan.name,
          description: plan.description,
          amountCents: plan.amountCents,
          currency: plan.currency,
          interval: plan.interval,
          highlighted: seed?.highlighted ?? false,
          chatbotEnabled: plan.chatbotEnabled,
          features: seed?.features ?? [],
        };
      }),
    };
  }

  public async listAdminPlans() {
    const plans = await this.prisma.plan.findMany({
      orderBy: [{ amountCents: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      plans: plans.map((plan) => ({
        key: plan.key,
        name: plan.name,
        amountCents: plan.amountCents,
        currency: plan.currency,
        interval: plan.interval,
        active: plan.active,
        chatbotEnabled: plan.chatbotEnabled,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
      })),
    };
  }

  public async updatePlanSettings(
    adminUserId: string,
    planKey: string,
    input: UpdatePlanSettingsDto,
  ) {
    const normalizedPlanKey = planKey.trim().toLowerCase();

    if (!normalizedPlanKey) {
      throw new BadRequestException('Plan key is required');
    }

    if (
      typeof input.active !== 'boolean' &&
      typeof input.chatbotEnabled !== 'boolean'
    ) {
      throw new BadRequestException(
        'Provide at least one field to update (active or chatbotEnabled)',
      );
    }

    const plan = await this.prisma.plan.findUnique({
      where: { key: normalizedPlanKey },
      select: {
        id: true,
        key: true,
      },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (input.active === false) {
      const activeSubscribers = await this.prisma.subscription.count({
        where: {
          planId: plan.id,
          status: {
            in: ACTIVE_SUBSCRIPTION_STATUSES,
          },
        },
      });

      if (activeSubscribers > 0) {
        throw new BadRequestException(
          'Cannot deactivate this plan while active subscribers are using it.',
        );
      }
    }

    const updated = await this.prisma.plan.update({
      where: { key: normalizedPlanKey },
      data: {
        ...(typeof input.active === 'boolean' ? { active: input.active } : {}),
        ...(typeof input.chatbotEnabled === 'boolean'
          ? { chatbotEnabled: input.chatbotEnabled }
          : {}),
      },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminUserId,
        action: 'billing.plan.update',
        targetType: 'plan',
        targetId: updated.id,
        details: {
          key: updated.key,
          active: updated.active,
          chatbotEnabled: updated.chatbotEnabled,
        },
      },
    });

    return {
      plan: {
        key: updated.key,
        active: updated.active,
        chatbotEnabled: updated.chatbotEnabled,
      },
    };
  }

  public async getChatEntitlement(userId: string) {
    const [subscription, chatbotPlans] = await Promise.all([
      this.findLatestActiveSubscription(userId),
      this.prisma.plan.findMany({
        where: {
          active: true,
          chatbotEnabled: true,
        },
        select: {
          key: true,
        },
      }),
    ]);
    const hasAccess = Boolean(subscription?.plan?.chatbotEnabled);

    return {
      allowed: hasAccess,
      reason: hasAccess
        ? null
        : 'Premium subscription required for chatbot access.',
      activePlan: subscription?.plan
        ? {
            key: subscription.plan.key,
            name: subscription.plan.name,
          }
        : null,
      requiredPlanKeys: chatbotPlans.map((plan) => plan.key),
    };
  }

  public async hasChatbotAccess(userId: string): Promise<boolean> {
    const entitlement = await this.getChatEntitlement(userId);
    return entitlement.allowed;
  }

  public async findLatestActiveSubscription(userId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        status: {
          in: ACTIVE_SUBSCRIPTION_STATUSES,
        },
      },
      include: { plan: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  public async getBillingForUser(userId: string) {
    const [activeSubscription, latestSubscription, payments] =
      await Promise.all([
        this.prisma.subscription.findFirst({
          where: {
            userId,
            status: {
              in: ACTIVE_SUBSCRIPTION_STATUSES,
            },
          },
          include: { plan: true },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.subscription.findFirst({
          where: { userId },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.payment.findMany({
          where: {
            userId,
            status: {
              in: FINALIZED_PAYMENT_STATUSES,
            },
          },
          orderBy: { createdAt: 'desc' },
          include: { plan: true },
          take: 20,
        }),
      ]);

    const subscription = activeSubscription ?? latestSubscription;

    return {
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            currentPeriodStart:
              subscription.currentPeriodStart?.toISOString() ?? null,
            currentPeriodEnd:
              subscription.currentPeriodEnd?.toISOString() ?? null,
            trialEnd: subscription.trialEnd?.toISOString() ?? null,
            canceledAt: subscription.canceledAt?.toISOString() ?? null,
            plan: subscription.plan
              ? {
                  key: subscription.plan.key,
                  name: subscription.plan.name,
                  amountCents: subscription.plan.amountCents,
                  currency: subscription.plan.currency,
                  interval: subscription.plan.interval,
                }
              : null,
          }
        : null,
      payments: payments.map((payment) => ({
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
    };
  }

  public async createCheckoutSession(userId: string, planKey: string) {
    const [user, plan] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          stripeCustomerId: true,
        },
      }),
      this.prisma.plan.findFirst({
        where: {
          key: planKey,
          active: true,
        },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const stripeCustomerId = await this.ensureStripeCustomer(
      user.id,
      user.email,
      user.stripeCustomerId,
    );

    const metadata: Record<string, string> = {
      userId,
      planKey: plan.key,
    };

    const successUrl = `${this.webAppUrl}/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${this.webAppUrl}/pricing?checkout=cancel`;

    const session =
      plan.interval === BillingInterval.ONE_TIME
        ? await this.stripe.checkout.sessions.create({
            mode: 'payment',
            customer: stripeCustomerId,
            client_reference_id: userId,
            metadata,
            allow_promotion_codes: true,
            success_url: successUrl,
            cancel_url: cancelUrl,
            line_items: [
              this.toCheckoutLineItem(plan, {
                recurring: false,
              }),
            ],
            payment_intent_data: {
              metadata,
            },
          })
        : await this.stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: stripeCustomerId,
            client_reference_id: userId,
            metadata,
            allow_promotion_codes: true,
            success_url: successUrl,
            cancel_url: cancelUrl,
            line_items: [
              this.toCheckoutLineItem(plan, {
                recurring: true,
              }),
            ],
            subscription_data: {
              metadata,
            },
          });

    if (!session.url) {
      throw new InternalServerErrorException(
        'Failed to create checkout session URL',
      );
    }

    await this.prisma.payment.create({
      data: {
        userId,
        planId: plan.id,
        stripeCheckoutSessionId: session.id,
        amountCents: plan.amountCents,
        currency: plan.currency,
        status: this.mapCheckoutPaymentStatus(session.payment_status),
        paidAt: session.payment_status === 'paid' ? new Date() : null,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : null,
      },
    });

    return {
      url: session.url,
      sessionId: session.id,
    };
  }

  public async createPortalSession(userId: string, returnPath?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        stripeCustomerId: true,
      },
    });

    if (!user?.stripeCustomerId) {
      throw new BadRequestException(
        'No Stripe customer is linked to this user',
      );
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: this.resolveReturnUrl(returnPath),
    });

    return {
      url: session.url,
    };
  }

  public async handleWebhook(
    signature: string,
    rawBody: Buffer,
  ): Promise<void> {
    if (!this.webhookSecret) {
      throw new InternalServerErrorException(
        'STRIPE_WEBHOOK_SECRET is not configured',
      );
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid webhook signature',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.billingWebhookEvent.create({
          data: {
            stripeEventId: event.id,
            type: event.type,
            payload: event as unknown as Prisma.InputJsonValue,
          },
        });

        await this.processWebhookEvent(tx, event);
      });
    } catch (error) {
      if (this.isWebhookDuplicate(error)) {
        this.logger.debug(`Duplicate Stripe event ignored: ${event.id}`);
        return;
      }

      throw error;
    }
  }

  private async ensureDefaultPlans(): Promise<void> {
    await Promise.all(
      DEFAULT_PLAN_SEEDS.map((seed) =>
        this.prisma.plan.upsert({
          where: { key: seed.key },
          update: {
            name: seed.name,
            description: seed.description,
            amountCents: seed.amountCents,
            currency: DEFAULT_CURRENCY,
            interval: seed.interval,
            active: true,
            chatbotEnabled:
              seed.chatbotEnabled || this.premiumPlanKeys.has(seed.key),
          },
          create: {
            key: seed.key,
            name: seed.name,
            description: seed.description,
            amountCents: seed.amountCents,
            currency: DEFAULT_CURRENCY,
            interval: seed.interval,
            active: true,
            chatbotEnabled:
              seed.chatbotEnabled || this.premiumPlanKeys.has(seed.key),
          },
        }),
      ),
    );
  }

  private parsePremiumPlanKeys(value: string | undefined): Set<string> {
    const parsed = (value ?? 'growth_monthly,growth_yearly')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);

    return new Set(parsed);
  }

  private async ensureStripeCustomer(
    userId: string,
    email: string,
    stripeCustomerId: string | null,
  ): Promise<string> {
    if (stripeCustomerId) {
      return stripeCustomerId;
    }

    const customer = await this.stripe.customers.create({
      email,
      metadata: {
        userId,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  private toCheckoutLineItem(
    plan: {
      amountCents: number;
      currency: string;
      description: string | null;
      name: string;
      stripePriceId: string | null;
      interval: BillingInterval;
    },
    options: { recurring: boolean },
  ): Stripe.Checkout.SessionCreateParams.LineItem {
    if (plan.stripePriceId) {
      return {
        price: plan.stripePriceId,
        quantity: 1,
      };
    }

    if (!options.recurring) {
      return {
        quantity: 1,
        price_data: {
          currency: plan.currency,
          unit_amount: plan.amountCents,
          product_data: {
            name: plan.name,
            description: plan.description ?? undefined,
          },
        },
      };
    }

    return {
      quantity: 1,
      price_data: {
        currency: plan.currency,
        unit_amount: plan.amountCents,
        recurring: {
          interval: plan.interval === BillingInterval.YEAR ? 'year' : 'month',
        },
        product_data: {
          name: plan.name,
          description: plan.description ?? undefined,
        },
      },
    };
  }

  private resolveReturnUrl(returnPath?: string): string {
    if (!returnPath || returnPath.trim().length === 0) {
      return `${this.webAppUrl}/app/billing`;
    }

    const trimmed = returnPath.trim();

    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
      return `${this.webAppUrl}/app/billing`;
    }

    return `${this.webAppUrl}${trimmed}`;
  }

  private mapCheckoutPaymentStatus(
    paymentStatus: Stripe.Checkout.Session.PaymentStatus,
  ): PaymentStatus {
    if (paymentStatus === 'paid') {
      return PaymentStatus.SUCCEEDED;
    }

    return PaymentStatus.PENDING;
  }

  private isWebhookDuplicate(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private async processWebhookEvent(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(tx, event.data.object);
        break;
      case 'checkout.session.expired':
        await this.handleCheckoutSessionExpired(tx, event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionUpdated(tx, event.data.object);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(tx, event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoiceFailed(tx, event.data.object);
        break;
      default:
        break;
    }
  }

  private async handleCheckoutSessionCompleted(
    tx: Prisma.TransactionClient,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const userId = this.resolveUserIdFromSession(session);

    if (!userId) {
      return;
    }

    const customerId =
      typeof session.customer === 'string' ? session.customer : null;

    if (customerId) {
      await this.linkStripeCustomer(tx, userId, customerId);
    }

    const planKey = session.metadata?.planKey ?? null;
    const plan = planKey
      ? await tx.plan.findUnique({ where: { key: planKey } })
      : null;

    const paymentStatus = this.mapCheckoutPaymentStatus(session.payment_status);

    await tx.payment.upsert({
      where: {
        stripeCheckoutSessionId: session.id,
      },
      update: {
        userId,
        planId: plan?.id ?? null,
        amountCents: session.amount_total ?? plan?.amountCents ?? 0,
        currency: session.currency ?? plan?.currency ?? DEFAULT_CURRENCY,
        status: paymentStatus,
        paidAt: paymentStatus === PaymentStatus.SUCCEEDED ? new Date() : null,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : null,
        stripeInvoiceId:
          typeof session.invoice === 'string' ? session.invoice : null,
      },
      create: {
        userId,
        planId: plan?.id ?? null,
        amountCents: session.amount_total ?? plan?.amountCents ?? 0,
        currency: session.currency ?? plan?.currency ?? DEFAULT_CURRENCY,
        status: paymentStatus,
        paidAt: paymentStatus === PaymentStatus.SUCCEEDED ? new Date() : null,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : null,
        stripeInvoiceId:
          typeof session.invoice === 'string' ? session.invoice : null,
      },
    });

    if (session.mode !== 'subscription') {
      return;
    }

    const stripeSubscriptionId =
      typeof session.subscription === 'string' ? session.subscription : null;

    if (!stripeSubscriptionId || !customerId) {
      return;
    }

    await tx.subscription.upsert({
      where: {
        stripeSubscriptionId,
      },
      update: {
        userId,
        planId: plan?.id ?? null,
        stripeCustomerId: customerId,
        status:
          paymentStatus === PaymentStatus.SUCCEEDED
            ? SubscriptionStatus.ACTIVE
            : SubscriptionStatus.INCOMPLETE,
      },
      create: {
        userId,
        planId: plan?.id ?? null,
        stripeCustomerId: customerId,
        stripeSubscriptionId,
        status:
          paymentStatus === PaymentStatus.SUCCEEDED
            ? SubscriptionStatus.ACTIVE
            : SubscriptionStatus.INCOMPLETE,
      },
    });
  }

  private async handleCheckoutSessionExpired(
    tx: Prisma.TransactionClient,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    await tx.payment.updateMany({
      where: {
        stripeCheckoutSessionId: session.id,
        status: PaymentStatus.PENDING,
      },
      data: {
        status: PaymentStatus.CANCELED,
      },
    });
  }

  private async handleSubscriptionUpdated(
    tx: Prisma.TransactionClient,
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : null;

    if (!customerId) {
      return;
    }

    const metadataUserId = subscription.metadata?.userId ?? null;
    const userId =
      metadataUserId ?? (await this.resolveUserIdFromCustomer(tx, customerId));

    if (!userId) {
      return;
    }

    await this.linkStripeCustomer(tx, userId, customerId);

    const priceId = subscription.items.data[0]?.price.id ?? null;
    const plan = await this.resolvePlanBySubscription(
      tx,
      subscription,
      priceId,
    );
    const currentPeriodStart =
      subscription.items.data[0]?.current_period_start ?? null;
    const currentPeriodEnd =
      subscription.items.data[0]?.current_period_end ?? null;

    await tx.subscription.upsert({
      where: {
        stripeSubscriptionId: subscription.id,
      },
      update: {
        userId,
        planId: plan?.id ?? null,
        stripeCustomerId: customerId,
        status: this.mapStripeSubscriptionStatus(subscription.status),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodStart: this.toDateFromUnix(currentPeriodStart),
        currentPeriodEnd: this.toDateFromUnix(currentPeriodEnd),
        trialEnd: this.toDateFromUnix(subscription.trial_end),
        canceledAt: this.toDateFromUnix(subscription.canceled_at),
      },
      create: {
        userId,
        planId: plan?.id ?? null,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        status: this.mapStripeSubscriptionStatus(subscription.status),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodStart: this.toDateFromUnix(currentPeriodStart),
        currentPeriodEnd: this.toDateFromUnix(currentPeriodEnd),
        trialEnd: this.toDateFromUnix(subscription.trial_end),
        canceledAt: this.toDateFromUnix(subscription.canceled_at),
      },
    });
  }

  private async handleInvoicePaid(
    tx: Prisma.TransactionClient,
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const customerId =
      typeof invoice.customer === 'string' ? invoice.customer : null;

    if (!customerId) {
      return;
    }

    const userId = await this.resolveUserIdFromCustomer(tx, customerId);

    if (!userId) {
      return;
    }

    const stripeSubscriptionId = this.getInvoiceSubscriptionId(invoice);

    const subscription = stripeSubscriptionId
      ? await tx.subscription.findUnique({
          where: { stripeSubscriptionId },
          select: { id: true, planId: true },
        })
      : null;

    const priceId = this.getInvoicePriceId(invoice);
    const plan = await this.resolvePlanByPriceId(
      tx,
      priceId,
      subscription?.planId ?? null,
    );

    await tx.payment.upsert({
      where: {
        stripeInvoiceId: invoice.id,
      },
      update: {
        userId,
        subscriptionId: subscription?.id ?? null,
        planId: plan?.id ?? subscription?.planId ?? null,
        amountCents: invoice.amount_paid || invoice.amount_due || 0,
        currency: invoice.currency ?? DEFAULT_CURRENCY,
        status: PaymentStatus.SUCCEEDED,
        paidAt:
          this.toDateFromUnix(invoice.status_transitions.paid_at) ?? new Date(),
        failedAt: null,
        stripePaymentIntentId: null,
      },
      create: {
        userId,
        subscriptionId: subscription?.id ?? null,
        planId: plan?.id ?? subscription?.planId ?? null,
        amountCents: invoice.amount_paid || invoice.amount_due || 0,
        currency: invoice.currency ?? DEFAULT_CURRENCY,
        status: PaymentStatus.SUCCEEDED,
        paidAt:
          this.toDateFromUnix(invoice.status_transitions.paid_at) ?? new Date(),
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: null,
      },
    });

    if (stripeSubscriptionId) {
      await tx.subscription.updateMany({
        where: { stripeSubscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
        },
      });
    }
  }

  private async handleInvoiceFailed(
    tx: Prisma.TransactionClient,
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const customerId =
      typeof invoice.customer === 'string' ? invoice.customer : null;

    if (!customerId) {
      return;
    }

    const userId = await this.resolveUserIdFromCustomer(tx, customerId);

    if (!userId) {
      return;
    }

    const stripeSubscriptionId = this.getInvoiceSubscriptionId(invoice);

    const subscription = stripeSubscriptionId
      ? await tx.subscription.findUnique({
          where: { stripeSubscriptionId },
          select: { id: true, planId: true },
        })
      : null;

    await tx.payment.upsert({
      where: {
        stripeInvoiceId: invoice.id,
      },
      update: {
        userId,
        subscriptionId: subscription?.id ?? null,
        planId: subscription?.planId ?? null,
        amountCents: invoice.amount_due || invoice.amount_remaining || 0,
        currency: invoice.currency ?? DEFAULT_CURRENCY,
        status: PaymentStatus.FAILED,
        failedAt: new Date(),
      },
      create: {
        userId,
        subscriptionId: subscription?.id ?? null,
        planId: subscription?.planId ?? null,
        amountCents: invoice.amount_due || invoice.amount_remaining || 0,
        currency: invoice.currency ?? DEFAULT_CURRENCY,
        status: PaymentStatus.FAILED,
        failedAt: new Date(),
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: null,
      },
    });

    if (stripeSubscriptionId) {
      await tx.subscription.updateMany({
        where: { stripeSubscriptionId },
        data: {
          status: SubscriptionStatus.PAST_DUE,
        },
      });
    }
  }

  private resolveUserIdFromSession(
    session: Stripe.Checkout.Session,
  ): string | null {
    const metadataUserId = session.metadata?.userId;

    if (metadataUserId && metadataUserId.length > 0) {
      return metadataUserId;
    }

    if (
      typeof session.client_reference_id === 'string' &&
      session.client_reference_id.length > 0
    ) {
      return session.client_reference_id;
    }

    return null;
  }

  private async resolveUserIdFromCustomer(
    tx: Prisma.TransactionClient,
    stripeCustomerId: string,
  ): Promise<string | null> {
    const user = await tx.user.findFirst({
      where: { stripeCustomerId },
      select: { id: true },
    });

    return user?.id ?? null;
  }

  private async linkStripeCustomer(
    tx: Prisma.TransactionClient,
    userId: string,
    stripeCustomerId: string,
  ): Promise<void> {
    await tx.user.updateMany({
      where: {
        id: userId,
        OR: [{ stripeCustomerId: null }, { stripeCustomerId }],
      },
      data: {
        stripeCustomerId,
      },
    });
  }

  private async resolvePlanBySubscription(
    tx: Prisma.TransactionClient,
    subscription: Stripe.Subscription,
    stripePriceId: string | null,
  ) {
    const planKey = subscription.metadata?.planKey ?? null;

    if (planKey) {
      const byKey = await tx.plan.findUnique({ where: { key: planKey } });
      if (byKey) {
        return byKey;
      }
    }

    if (stripePriceId) {
      const byPrice = await tx.plan.findFirst({
        where: { stripePriceId },
      });
      if (byPrice) {
        return byPrice;
      }
    }

    return null;
  }

  private async resolvePlanByPriceId(
    tx: Prisma.TransactionClient,
    stripePriceId: string | null,
    fallbackPlanId: string | null,
  ) {
    if (fallbackPlanId) {
      return tx.plan.findUnique({ where: { id: fallbackPlanId } });
    }

    if (!stripePriceId) {
      return null;
    }

    return tx.plan.findFirst({ where: { stripePriceId } });
  }

  private getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    const fromParent = invoice.parent?.subscription_details?.subscription;

    if (typeof fromParent === 'string') {
      return fromParent;
    }

    if (fromParent && typeof fromParent === 'object' && 'id' in fromParent) {
      return fromParent.id;
    }

    const fromLineItem = invoice.lines.data[0]?.subscription;

    if (typeof fromLineItem === 'string') {
      return fromLineItem;
    }

    if (
      fromLineItem &&
      typeof fromLineItem === 'object' &&
      'id' in fromLineItem
    ) {
      return fromLineItem.id;
    }

    return null;
  }

  private getInvoicePriceId(invoice: Stripe.Invoice): string | null {
    const rawPrice = invoice.lines.data[0]?.pricing?.price_details?.price;

    if (typeof rawPrice === 'string') {
      return rawPrice;
    }

    if (rawPrice && typeof rawPrice === 'object' && 'id' in rawPrice) {
      return rawPrice.id;
    }

    return null;
  }

  private mapStripeSubscriptionStatus(
    status: Stripe.Subscription.Status,
  ): SubscriptionStatus {
    switch (status) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      case 'unpaid':
        return SubscriptionStatus.UNPAID;
      case 'incomplete':
        return SubscriptionStatus.INCOMPLETE;
      case 'incomplete_expired':
        return SubscriptionStatus.INCOMPLETE_EXPIRED;
      case 'paused':
        return SubscriptionStatus.PAUSED;
      default:
        return SubscriptionStatus.INCOMPLETE;
    }
  }

  private toDateFromUnix(
    unixTimestamp: number | null | undefined,
  ): Date | null {
    if (!unixTimestamp || unixTimestamp <= 0) {
      return null;
    }

    return new Date(unixTimestamp * 1000);
  }
}
