-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED');

-- CreateTable
CREATE TABLE "demo_requests" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "work_email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "job_title" TEXT,
    "team_size" TEXT,
    "use_case" TEXT,
    "message" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT DEFAULT 'website',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "topic" TEXT,
    "message" TEXT NOT NULL,
    "source" TEXT DEFAULT 'website',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "status" "NewsletterStatus" NOT NULL DEFAULT 'PENDING',
    "subscribed_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "source" TEXT DEFAULT 'website',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demo_requests_work_email_idx" ON "demo_requests"("work_email");

-- CreateIndex
CREATE INDEX "demo_requests_status_created_at_idx" ON "demo_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "contact_messages_email_idx" ON "contact_messages"("email");

-- CreateIndex
CREATE INDEX "contact_messages_created_at_idx" ON "contact_messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_status_created_at_idx" ON "newsletter_subscribers"("status", "created_at");

