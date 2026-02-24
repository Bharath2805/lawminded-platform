-- CreateEnum
CREATE TYPE "ResourceDeliveryType" AS ENUM ('LINK', 'FILE');

-- CreateEnum
CREATE TYPE "ResourceEntitlementMode" AS ENUM ('ALL_AUTHENTICATED', 'PLAN_RESTRICTED');

-- AlterTable
ALTER TABLE "plans"
ADD COLUMN "chatbot_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "resources"
ADD COLUMN "delivery_type" "ResourceDeliveryType" NOT NULL DEFAULT 'LINK',
ADD COLUMN "entitlement_mode" "ResourceEntitlementMode" NOT NULL DEFAULT 'ALL_AUTHENTICATED';

-- CreateTable
CREATE TABLE "resource_assets" (
  "id" UUID NOT NULL,
  "resource_id" UUID NOT NULL,
  "storage_key" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "checksum_sha256" TEXT,
  "uploaded_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "resource_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_resource_entitlements" (
  "plan_id" UUID NOT NULL,
  "resource_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "plan_resource_entitlements_pkey" PRIMARY KEY ("plan_id", "resource_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resource_assets_resource_id_key" ON "resource_assets"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_assets_storage_key_key" ON "resource_assets"("storage_key");

-- CreateIndex
CREATE INDEX "resource_assets_uploaded_by_user_id_created_at_idx" ON "resource_assets"("uploaded_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "resource_assets_created_at_idx" ON "resource_assets"("created_at");

-- CreateIndex
DROP INDEX IF EXISTS "resources_active_visibility_sort_order_idx";

-- CreateIndex
CREATE INDEX "resources_active_visibility_entitlement_mode_sort_order_idx" ON "resources"("active", "visibility", "entitlement_mode", "sort_order");

-- CreateIndex
CREATE INDEX "plan_resource_entitlements_resource_id_created_at_idx" ON "plan_resource_entitlements"("resource_id", "created_at");

-- AddForeignKey
ALTER TABLE "resource_assets" ADD CONSTRAINT "resource_assets_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_assets" ADD CONSTRAINT "resource_assets_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_resource_entitlements" ADD CONSTRAINT "plan_resource_entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_resource_entitlements" ADD CONSTRAINT "plan_resource_entitlements_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
