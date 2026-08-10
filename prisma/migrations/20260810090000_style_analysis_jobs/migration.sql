-- Align the persisted Job contract with the T-03 worker lifecycle.
ALTER TABLE "Job" RENAME COLUMN "provider" TO "providerName";
ALTER TABLE "Job" RENAME COLUMN "providerJobId" TO "providerRequestId";
ALTER TABLE "Job" RENAME COLUMN "completedAt" TO "finishedAt";

ALTER TABLE "Job"
  ADD COLUMN "inputJson" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "lockedAt" TIMESTAMP(3);

CREATE INDEX "Job_status_lockedAt_idx" ON "Job"("status", "lockedAt");
