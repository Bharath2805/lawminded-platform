ALTER TABLE "chat_conversations"
ADD COLUMN "anonymous_id" TEXT,
ADD COLUMN "is_trial" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "chat_conversations"
ALTER COLUMN "user_id" DROP NOT NULL;

CREATE INDEX "chat_conversations_anonymous_id_is_trial_last_message_at_idx"
ON "chat_conversations"("anonymous_id", "is_trial", "last_message_at");

CREATE INDEX "chat_conversations_is_trial_deleted_at_idx"
ON "chat_conversations"("is_trial", "deleted_at");

ALTER TABLE "chat_conversations"
ADD CONSTRAINT "chat_conversations_identity_check"
CHECK ("user_id" IS NOT NULL OR "anonymous_id" IS NOT NULL);
