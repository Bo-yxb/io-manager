-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "escalated_at" DATETIME;

-- AlterTable
ALTER TABLE "workers" ADD COLUMN "callback_url" TEXT;

-- CreateIndex
CREATE INDEX "tasks_timeout_at_idx" ON "tasks"("timeout_at");
