ALTER TABLE "chat_conversations"
ADD COLUMN "pinned_at" TIMESTAMP(3),
ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE INDEX "chat_conversations_user_id_archived_at_last_message_at_idx"
ON "chat_conversations"("user_id", "archived_at", "last_message_at");

CREATE INDEX "chat_conversations_user_id_pinned_at_last_message_at_idx"
ON "chat_conversations"("user_id", "pinned_at", "last_message_at");
