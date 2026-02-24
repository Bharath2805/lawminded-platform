-- CreateEnum
CREATE TYPE "ResourceVisibility" AS ENUM ('PUBLIC', 'AUTHENTICATED');

-- CreateEnum
CREATE TYPE "ResourceAccessAction" AS ENUM ('VIEW', 'DOWNLOAD');

-- CreateTable
CREATE TABLE "resources" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "category" TEXT,
  "href" TEXT NOT NULL,
  "visibility" "ResourceVisibility" NOT NULL DEFAULT 'AUTHENTICATED',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_access_logs" (
  "id" UUID NOT NULL,
  "resource_id" UUID NOT NULL,
  "user_id" UUID,
  "anonymous_id" TEXT,
  "action" "ResourceAccessAction" NOT NULL DEFAULT 'VIEW',
  "source" TEXT DEFAULT 'web',
  "ip_hash" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "resource_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resources_key_key" ON "resources"("key");

-- CreateIndex
CREATE INDEX "resources_active_visibility_sort_order_idx" ON "resources"("active", "visibility", "sort_order");

-- CreateIndex
CREATE INDEX "resource_access_logs_resource_id_created_at_idx" ON "resource_access_logs"("resource_id", "created_at");

-- CreateIndex
CREATE INDEX "resource_access_logs_user_id_created_at_idx" ON "resource_access_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "resource_access_logs_action_created_at_idx" ON "resource_access_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "resource_access_logs" ADD CONSTRAINT "resource_access_logs_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_access_logs" ADD CONSTRAINT "resource_access_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
