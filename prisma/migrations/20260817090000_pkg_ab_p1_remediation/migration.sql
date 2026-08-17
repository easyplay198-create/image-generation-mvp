-- CreateEnum
CREATE TYPE "ProviderSubmissionState" AS ENUM (
    'NOT_STARTED',
    'SUBMITTING',
    'SUBMITTED',
    'AMBIGUOUS',
    'COMPLETED'
);

-- AlterTable
ALTER TABLE "BenchmarkRun" ADD COLUMN "experimentFingerprint" TEXT;

-- Existing rows already have a project-scoped unique idempotency key. Reuse it
-- as a collision-free historical fingerprint instead of assuming the table is empty.
UPDATE "BenchmarkRun"
SET "experimentFingerprint" = "idempotencyKey"
WHERE "experimentFingerprint" IS NULL;

ALTER TABLE "BenchmarkRun"
ALTER COLUMN "experimentFingerprint" SET NOT NULL;

-- AlterTable
ALTER TABLE "BenchmarkJob"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "lockedAt" TIMESTAMP(3),
ADD COLUMN "leaseToken" TEXT,
ADD COLUMN "providerInvocationKey" TEXT,
ADD COLUMN "providerSubmissionState" "ProviderSubmissionState" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "providerSubmittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Job"
ADD COLUMN "leaseToken" TEXT,
ADD COLUMN "providerInvocationKey" TEXT,
ADD COLUMN "providerSubmissionState" "ProviderSubmissionState" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "providerSubmittedAt" TIMESTAMP(3);

-- The previous schema cannot prove whether a RUNNING image-generation or
-- benchmark job had already reached the paid Provider boundary. Fence every
-- such historical row as ambiguous instead of allowing the new NOT_STARTED
-- default to make it eligible for automatic resubmission.
UPDATE "Job"
SET
  "status" = 'FAILED'::"JobStatus",
  "lockedAt" = NULL,
  "leaseToken" = NULL,
  "providerSubmissionState" = 'AMBIGUOUS'::"ProviderSubmissionState",
  "errorCode" = 'PROVIDER_SUBMISSION_AMBIGUOUS',
  "errorMessage" = '历史图片生成任务的 Provider 提交状态无法确认，禁止自动重试。',
  "finishedAt" = COALESCE(
    "finishedAt",
    CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
  ),
  "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "type" = 'IMAGE_GENERATION'::"JobType"
  AND "status" = 'RUNNING'::"JobStatus";

UPDATE "BenchmarkJob"
SET
  "status" = 'FAILED'::"BenchmarkJobStatus",
  "lockedAt" = NULL,
  "leaseToken" = NULL,
  "providerSubmissionState" = 'AMBIGUOUS'::"ProviderSubmissionState",
  "errorCode" = 'PROVIDER_SUBMISSION_AMBIGUOUS',
  "errorMessage" = '历史 Benchmark 任务的 Provider 提交状态无法确认，禁止自动重试。',
  "finishedAt" = COALESCE(
    "finishedAt",
    CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
  ),
  "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "status" = 'RUNNING'::"BenchmarkJobStatus";

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkRun_projectId_experimentFingerprint_key"
ON "BenchmarkRun"("projectId", "experimentFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkJob_providerInvocationKey_key"
ON "BenchmarkJob"("providerInvocationKey");

-- CreateIndex
CREATE INDEX "BenchmarkJob_status_lockedAt_idx"
ON "BenchmarkJob"("status", "lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_providerInvocationKey_key"
ON "Job"("providerInvocationKey");
