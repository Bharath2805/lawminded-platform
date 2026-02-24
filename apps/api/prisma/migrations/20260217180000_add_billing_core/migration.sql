-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM (
  'INCOMPLETE',
  'INCOMPLETE_EXPIRED',
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'UNPAID',
  'PAUSED'
);

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM (
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
  'REFUNDED',
  'REQUIRES_ACTION'
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" TEXT;

-- CreateTable
CREATE TABLE "plans" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "interval" "BillingInterval" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "stripe_product_id" TEXT,
  "stripe_price_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "plan_id" UUID,
  "stripe_customer_id" TEXT NOT NULL,
  "stripe_subscription_id" TEXT,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "trial_end" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "plan_id" UUID,
  "subscription_id" UUID,
  "stripe_payment_intent_id" TEXT,
  "stripe_invoice_id" TEXT,
  "stripe_checkout_session_id" TEXT,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paid_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_webhook_events" (
  "id" UUID NOT NULL,
  "stripe_event_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "plans_stripe_product_id_key" ON "plans"("stripe_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_stripe_price_id_key" ON "plans"("stripe_price_id");

-- CreateIndex
CREATE INDEX "plans_active_interval_idx" ON "plans"("active", "interval");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key" ON "payments"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_invoice_id_key" ON "payments"("stripe_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_checkout_session_id_key" ON "payments"("stripe_checkout_session_id");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_webhook_events_stripe_event_id_key" ON "billing_webhook_events"("stripe_event_id");

-- CreateIndex
CREATE INDEX "billing_webhook_events_type_processed_at_idx" ON "billing_webhook_events"("type", "processed_at");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
