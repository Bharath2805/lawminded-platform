-- CreateEnum
CREATE TYPE "ChatMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'ERROR');

-- CreateTable
CREATE TABLE "chat_conversations" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'New conversation',
  "thread_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "role" "ChatMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversations_thread_id_key" ON "chat_conversations"("thread_id");

-- CreateIndex
CREATE INDEX "chat_conversations_user_id_last_message_at_idx" ON "chat_conversations"("user_id", "last_message_at");

-- CreateIndex
CREATE INDEX "chat_conversations_user_id_created_at_idx" ON "chat_conversations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_conversations_deleted_at_idx" ON "chat_conversations"("deleted_at");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
