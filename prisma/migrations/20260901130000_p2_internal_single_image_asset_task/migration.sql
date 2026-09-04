-- CreateEnum
CREATE TYPE "AssetTaskType" AS ENUM ('INTERNAL_SINGLE_IMAGE');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('IMAGE');

-- CreateEnum
CREATE TYPE "AssetTaskOutputPurpose" AS ENUM ('INTERNAL_TEST');

-- CreateEnum
CREATE TYPE "AssetTaskStatus" AS ENUM ('QUEUED');

-- CreateTable
CREATE TABLE "AssetTask" (
    "assetTaskId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskType" "AssetTaskType" NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "outputPurpose" "AssetTaskOutputPurpose" NOT NULL,
    "truthRevisionId" TEXT NOT NULL,
    "productSourceSnapshotId" TEXT NOT NULL,
    "status" "AssetTaskStatus" NOT NULL,
    "createdByActorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetTask_pkey" PRIMARY KEY ("assetTaskId"),
    CONSTRAINT "AssetTask_identifiers_check" CHECK (
        btrim("assetTaskId") <> ''
        AND "assetTaskId" = btrim("assetTaskId")
        AND btrim("truthRevisionId") <> ''
        AND "truthRevisionId" = btrim("truthRevisionId")
        AND btrim("productSourceSnapshotId") <> ''
        AND "productSourceSnapshotId" = btrim("productSourceSnapshotId")
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetTask_scope_id_key"
ON "AssetTask"("workspaceId", "projectId", "assetTaskId");

-- CreateIndex
CREATE INDEX "AssetTask_scope_status_createdAt_idx"
ON "AssetTask"("workspaceId", "projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AssetTask_scope_truthRevision_idx"
ON "AssetTask"("workspaceId", "projectId", "truthRevisionId");

-- CreateIndex
CREATE INDEX "AssetTask_scope_productSource_idx"
ON "AssetTask"("workspaceId", "projectId", "productSourceSnapshotId");

-- CreateIndex
CREATE INDEX "AssetTask_createdByActorId_idx"
ON "AssetTask"("createdByActorId");

-- AddForeignKey
ALTER TABLE "AssetTask"
ADD CONSTRAINT "AssetTask_scope_project_fkey"
FOREIGN KEY ("workspaceId", "projectId")
REFERENCES "ProductProject"("workspaceId", "projectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTask"
ADD CONSTRAINT "AssetTask_scope_truthRevision_fkey"
FOREIGN KEY ("workspaceId", "projectId", "truthRevisionId")
REFERENCES "ProductTruthRevision"(
    "workspaceId",
    "projectId",
    "productTruthRevisionId"
)
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTask"
ADD CONSTRAINT "AssetTask_scope_productSource_fkey"
FOREIGN KEY ("workspaceId", "projectId", "productSourceSnapshotId")
REFERENCES "SourceSnapshot"(
    "workspaceId",
    "projectId",
    "sourceSnapshotId"
)
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTask"
ADD CONSTRAINT "AssetTask_scope_creator_fkey"
FOREIGN KEY ("workspaceId", "createdByActorId")
REFERENCES "Membership"("workspaceId", "userActorId")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "p2_check_asset_task_dependencies"()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "ProductProject" AS project
        INNER JOIN "ProductTruthRevision" AS revision
          ON revision."workspaceId" = project."workspaceId"
         AND revision."projectId" = project."projectId"
         AND revision."productTruthRevisionId" = NEW."truthRevisionId"
        INNER JOIN "TruthRevisionSourceLink" AS source_link
          ON source_link."workspaceId" = revision."workspaceId"
         AND source_link."projectId" = revision."projectId"
         AND source_link."productTruthRevisionId" = revision."productTruthRevisionId"
         AND source_link."sourceSnapshotId" = NEW."productSourceSnapshotId"
        INNER JOIN "SourceSnapshot" AS source_snapshot
          ON source_snapshot."workspaceId" = source_link."workspaceId"
         AND source_snapshot."projectId" = source_link."projectId"
         AND source_snapshot."sourceSnapshotId" = source_link."sourceSnapshotId"
        WHERE project."workspaceId" = NEW."workspaceId"
          AND project."projectId" = NEW."projectId"
          AND project."status" IN ('DRAFT', 'ACTIVE')
          AND project."activeTruthRevisionId" = NEW."truthRevisionId"
          AND revision."status" = 'ACTIVE'
          AND source_link."linkStatus" = 'ACTIVE'
          AND source_snapshot."sourceKind" = 'PRODUCT_SOURCE'
          AND source_snapshot."validationStatus" = 'VALID'
          AND source_snapshot."lifecycleStatus" = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'AssetTask requires the active truth revision and an active valid product source';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AssetTask_dependency_integrity_trigger"
BEFORE INSERT ON "AssetTask"
FOR EACH ROW EXECUTE FUNCTION "p2_check_asset_task_dependencies"();

CREATE FUNCTION "p2_guard_asset_task_change"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Queued AssetTask truth is immutable in this P2 slice';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AssetTask_guard_change_trigger"
BEFORE UPDATE OR DELETE ON "AssetTask"
FOR EACH ROW EXECUTE FUNCTION "p2_guard_asset_task_change"();
