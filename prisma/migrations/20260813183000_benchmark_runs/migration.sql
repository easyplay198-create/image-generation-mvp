-- CreateEnum
CREATE TYPE "BenchmarkVariant" AS ENUM ('PLAIN_PROMPT', 'STYLE_SPEC');

-- CreateEnum
CREATE TYPE "BenchmarkJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "BenchmarkRun" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "outputWidth" INTEGER NOT NULL,
    "outputHeight" INTEGER NOT NULL,
    "productAssetId" TEXT NOT NULL,
    "referenceAssetIds" TEXT[],
    "styleSpecRevisionId" TEXT NOT NULL,
    "generationContextJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkJob" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "benchmarkRunId" TEXT NOT NULL,
    "variant" "BenchmarkVariant" NOT NULL,
    "status" "BenchmarkJobStatus" NOT NULL DEFAULT 'QUEUED',
    "inputJson" JSONB NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkResult" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "benchmarkJobId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerRequestId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "usageJson" JSONB NOT NULL,
    "costMetadataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkRun_projectId_idempotencyKey_key" ON "BenchmarkRun"("projectId", "idempotencyKey");
CREATE INDEX "BenchmarkRun_ownerId_projectId_createdAt_idx" ON "BenchmarkRun"("ownerId", "projectId", "createdAt");
CREATE INDEX "BenchmarkRun_productAssetId_idx" ON "BenchmarkRun"("productAssetId");
CREATE INDEX "BenchmarkRun_styleSpecRevisionId_idx" ON "BenchmarkRun"("styleSpecRevisionId");
CREATE UNIQUE INDEX "BenchmarkJob_benchmarkRunId_variant_key" ON "BenchmarkJob"("benchmarkRunId", "variant");
CREATE INDEX "BenchmarkJob_ownerId_projectId_idx" ON "BenchmarkJob"("ownerId", "projectId");
CREATE INDEX "BenchmarkJob_status_createdAt_idx" ON "BenchmarkJob"("status", "createdAt");
CREATE UNIQUE INDEX "BenchmarkResult_benchmarkJobId_key" ON "BenchmarkResult"("benchmarkJobId");
CREATE UNIQUE INDEX "BenchmarkResult_assetId_key" ON "BenchmarkResult"("assetId");
CREATE INDEX "BenchmarkResult_ownerId_projectId_idx" ON "BenchmarkResult"("ownerId", "projectId");

-- AddForeignKey
ALTER TABLE "BenchmarkRun" ADD CONSTRAINT "BenchmarkRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenchmarkRun" ADD CONSTRAINT "BenchmarkRun_productAssetId_fkey" FOREIGN KEY ("productAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkRun" ADD CONSTRAINT "BenchmarkRun_styleSpecRevisionId_fkey" FOREIGN KEY ("styleSpecRevisionId") REFERENCES "StyleSpecRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkJob" ADD CONSTRAINT "BenchmarkJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenchmarkJob" ADD CONSTRAINT "BenchmarkJob_benchmarkRunId_fkey" FOREIGN KEY ("benchmarkRunId") REFERENCES "BenchmarkRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_benchmarkJobId_fkey" FOREIGN KEY ("benchmarkJobId") REFERENCES "BenchmarkJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
