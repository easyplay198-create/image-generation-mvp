-- CreateEnum
CREATE TYPE "ProductProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'BLOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SourceSnapshotKind" AS ENUM (
    'PRODUCT_SOURCE',
    'PRODUCT_REFERENCE',
    'BRAND_REFERENCE',
    'LOGO_REFERENCE',
    'OTHER_REFERENCE'
);

-- CreateEnum
CREATE TYPE "SourceSnapshotValidationStatus" AS ENUM (
    'PENDING',
    'VALID',
    'ACTION_REQUIRED',
    'INVALID'
);

-- CreateEnum
CREATE TYPE "SourceSnapshotLifecycleStatus" AS ENUM ('ACTIVE', 'DELETED');

-- CreateTable
CREATE TABLE "ProductProject" (
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "skuIdentityKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "ProductProjectStatus" NOT NULL,
    "createdByActorId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductProject_pkey" PRIMARY KEY ("projectId"),
    CONSTRAINT "ProductProject_displayName_check" CHECK (
        btrim("displayName") <> ''
        AND position(E'\\000' IN encode(convert_to("displayName", 'UTF8'), 'escape')) = 0
    ),
    CONSTRAINT "ProductProject_status_archived_check" CHECK (
        ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL)
        OR ("status" <> 'ARCHIVED' AND "archivedAt" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "SourceSnapshot" (
    "sourceSnapshotId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceKind" "SourceSnapshotKind" NOT NULL,
    "mediaType" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "storageLocator" TEXT NOT NULL,
    "validationStatus" "SourceSnapshotValidationStatus" NOT NULL,
    "lifecycleStatus" "SourceSnapshotLifecycleStatus" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByActorId" TEXT NOT NULL,

    CONSTRAINT "SourceSnapshot_pkey" PRIMARY KEY ("sourceSnapshotId"),
    CONSTRAINT "SourceSnapshot_byteSize_check" CHECK (
        "byteSize" BETWEEN 1 AND 20971520
    ),
    CONSTRAINT "SourceSnapshot_mediaType_check" CHECK (
        "mediaType" IN ('image/png', 'image/jpeg', 'image/webp')
    ),
    CONSTRAINT "SourceSnapshot_contentDigest_check" CHECK (
        "contentDigest" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "SourceSnapshot_storageLocator_check" CHECK (
        btrim("storageLocator") <> ''
        AND position(E'\\000' IN encode(convert_to("storageLocator", 'UTF8'), 'escape')) = 0
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductProject_workspaceId_projectId_key"
ON "ProductProject"("workspaceId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductProject_workspaceId_skuIdentityKey_key"
ON "ProductProject"("workspaceId", "skuIdentityKey");

-- CreateIndex
CREATE INDEX "ProductProject_workspaceId_status_createdAt_idx"
ON "ProductProject"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductProject_createdByActorId_idx"
ON "ProductProject"("createdByActorId");

-- CreateIndex
CREATE INDEX "SourceSnapshot_workspaceId_projectId_capturedAt_idx"
ON "SourceSnapshot"("workspaceId", "projectId", "capturedAt");

-- CreateIndex
CREATE INDEX "SourceSnapshot_workspaceId_projectId_contentDigest_idx"
ON "SourceSnapshot"("workspaceId", "projectId", "contentDigest");

-- CreateIndex
CREATE INDEX "SourceSnapshot_createdByActorId_idx"
ON "SourceSnapshot"("createdByActorId");

-- AddForeignKey
ALTER TABLE "ProductProject"
ADD CONSTRAINT "ProductProject_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("workspaceId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductProject"
ADD CONSTRAINT "ProductProject_workspaceId_createdByActorId_fkey"
FOREIGN KEY ("workspaceId", "createdByActorId")
REFERENCES "Membership"("workspaceId", "userActorId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSnapshot"
ADD CONSTRAINT "SourceSnapshot_workspaceId_projectId_fkey"
FOREIGN KEY ("workspaceId", "projectId")
REFERENCES "ProductProject"("workspaceId", "projectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSnapshot"
ADD CONSTRAINT "SourceSnapshot_workspaceId_createdByActorId_fkey"
FOREIGN KEY ("workspaceId", "createdByActorId")
REFERENCES "Membership"("workspaceId", "userActorId")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "p2_guard_product_project_change"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'ProductProject cannot be physically deleted';
    END IF;

    IF NEW."projectId" IS DISTINCT FROM OLD."projectId"
        OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
        OR NEW."skuIdentityKey" IS DISTINCT FROM OLD."skuIdentityKey"
        OR NEW."createdByActorId" IS DISTINCT FROM OLD."createdByActorId"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'ProductProject identity fields are immutable';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProductProject_guard_change_trigger"
BEFORE UPDATE OR DELETE ON "ProductProject"
FOR EACH ROW EXECUTE FUNCTION "p2_guard_product_project_change"();

CREATE FUNCTION "p2_guard_source_snapshot_change"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'SourceSnapshot cannot be physically deleted';
    END IF;

    IF NEW."sourceSnapshotId" IS DISTINCT FROM OLD."sourceSnapshotId"
        OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
        OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
        OR NEW."sourceKind" IS DISTINCT FROM OLD."sourceKind"
        OR NEW."mediaType" IS DISTINCT FROM OLD."mediaType"
        OR NEW."byteSize" IS DISTINCT FROM OLD."byteSize"
        OR NEW."contentDigest" IS DISTINCT FROM OLD."contentDigest"
        OR NEW."storageLocator" IS DISTINCT FROM OLD."storageLocator"
        OR NEW."capturedAt" IS DISTINCT FROM OLD."capturedAt"
        OR NEW."createdByActorId" IS DISTINCT FROM OLD."createdByActorId" THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'SourceSnapshot content and provenance fields are immutable';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SourceSnapshot_guard_change_trigger"
BEFORE UPDATE OR DELETE ON "SourceSnapshot"
FOR EACH ROW EXECUTE FUNCTION "p2_guard_source_snapshot_change"();
