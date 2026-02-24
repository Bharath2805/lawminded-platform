-- CreateEnum
CREATE TYPE "DsarRequestType" AS ENUM (
  'ACCESS',
  'EXPORT',
  'RECTIFICATION',
  'ERASURE',
  'RESTRICTION',
  'OBJECTION'
);

-- CreateEnum
CREATE TYPE "DsarRequestStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED'
);

-- CreateTable
CREATE TABLE "cookie_preferences" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "anonymous_id" TEXT,
  "necessary" BOOLEAN NOT NULL DEFAULT true,
  "analytics" BOOLEAN NOT NULL DEFAULT false,
  "marketing" BOOLEAN NOT NULL DEFAULT false,
  "policy_version" TEXT NOT NULL,
  "source" TEXT DEFAULT 'website',
  "ip_hash" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cookie_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_logs" (
  "id" UUID NOT NULL,
  "preference_id" UUID,
  "user_id" UUID,
  "anonymous_id" TEXT,
  "necessary" BOOLEAN NOT NULL DEFAULT true,
  "analytics" BOOLEAN NOT NULL DEFAULT false,
  "marketing" BOOLEAN NOT NULL DEFAULT false,
  "policy_version" TEXT NOT NULL,
  "source" TEXT DEFAULT 'website',
  "ip_hash" TEXT,
  "user_agent" TEXT,
  "consented_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dsar_requests" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "requester_email" TEXT NOT NULL,
  "type" "DsarRequestType" NOT NULL,
  "status" "DsarRequestStatus" NOT NULL DEFAULT 'OPEN',
  "details" TEXT,
  "source" TEXT DEFAULT 'self-service',
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "resolution_note" TEXT,
  "resolved_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dsar_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
  "id" UUID NOT NULL,
  "admin_user_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "target_type" TEXT,
  "target_id" TEXT,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cookie_preferences_user_id_key" ON "cookie_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cookie_preferences_anonymous_id_key" ON "cookie_preferences"("anonymous_id");

-- CreateIndex
CREATE INDEX "cookie_preferences_created_at_idx" ON "cookie_preferences"("created_at");

-- CreateIndex
CREATE INDEX "consent_logs_user_id_consented_at_idx" ON "consent_logs"("user_id", "consented_at");

-- CreateIndex
CREATE INDEX "consent_logs_anonymous_id_consented_at_idx" ON "consent_logs"("anonymous_id", "consented_at");

-- CreateIndex
CREATE INDEX "consent_logs_consented_at_idx" ON "consent_logs"("consented_at");

-- CreateIndex
CREATE INDEX "dsar_requests_status_requested_at_idx" ON "dsar_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "dsar_requests_requester_email_requested_at_idx" ON "dsar_requests"("requester_email", "requested_at");

-- CreateIndex
CREATE INDEX "dsar_requests_user_id_requested_at_idx" ON "dsar_requests"("user_id", "requested_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_user_id_created_at_idx" ON "admin_audit_logs"("admin_user_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_created_at_idx" ON "admin_audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "cookie_preferences" ADD CONSTRAINT "cookie_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_preference_id_fkey" FOREIGN KEY ("preference_id") REFERENCES "cookie_preferences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
