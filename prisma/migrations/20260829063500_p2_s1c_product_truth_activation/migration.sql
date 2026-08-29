-- CreateEnum
CREATE TYPE "ProductTruthContinuity" AS ENUM (
    'SAME_PRODUCT',
    'DIFFERENT_PRODUCT',
    'REVIEW_REQUIRED'
);

-- CreateEnum
CREATE TYPE "ProductTruthRevisionStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'SUPERSEDED',
    'INVALIDATED'
);

-- CreateEnum
CREATE TYPE "TruthRevisionSourceRole" AS ENUM (
    'PRODUCT_PRIMARY',
    'PRODUCT_SUPPORTING'
);

-- CreateEnum
CREATE TYPE "TruthRevisionLinkStatus" AS ENUM ('ACTIVE', 'INVALIDATED');

-- AlterTable
ALTER TABLE "ProductProject"
ADD COLUMN "activeTruthRevisionId" TEXT;

-- CreateTable
CREATE TABLE "ProductTruthRevision" (
    "productTruthRevisionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "truthBody" JSONB NOT NULL,
    "productContinuity" "ProductTruthContinuity" NOT NULL,
    "status" "ProductTruthRevisionStatus" NOT NULL,
    "parentRevisionId" TEXT,
    "createdByActorId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTruthRevision_pkey"
        PRIMARY KEY ("productTruthRevisionId"),
    CONSTRAINT "ProductTruthRevision_revisionNumber_check"
        CHECK ("revisionNumber" > 0),
    CONSTRAINT "ProductTruthRevision_truthBody_check"
        CHECK (jsonb_typeof("truthBody") = 'object'),
    CONSTRAINT "ProductTruthRevision_status_timestamps_check" CHECK (
        (
            "status" = 'DRAFT'
            AND "activatedAt" IS NULL
            AND "supersededAt" IS NULL
            AND "invalidatedAt" IS NULL
        )
        OR (
            "status" = 'ACTIVE'
            AND "activatedAt" IS NOT NULL
            AND "supersededAt" IS NULL
            AND "invalidatedAt" IS NULL
        )
        OR (
            "status" = 'SUPERSEDED'
            AND "activatedAt" IS NOT NULL
            AND "supersededAt" IS NOT NULL
            AND "invalidatedAt" IS NULL
        )
        OR (
            "status" = 'INVALIDATED'
            AND "invalidatedAt" IS NOT NULL
        )
    )
);

-- CreateTable
CREATE TABLE "TruthRevisionSourceLink" (
    "linkId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "productTruthRevisionId" TEXT NOT NULL,
    "sourceSnapshotId" TEXT NOT NULL,
    "sourceRole" "TruthRevisionSourceRole" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "linkStatus" "TruthRevisionLinkStatus" NOT NULL,
    "createdByActorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TruthRevisionSourceLink_pkey" PRIMARY KEY ("linkId"),
    CONSTRAINT "TruthRevisionSourceLink_sortOrder_check"
        CHECK ("sortOrder" >= 0)
);

-- CreateTable
CREATE TABLE "P2DomainEvent" (
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventSchemaVersion" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "sourceCommit" TEXT NOT NULL,
    "productVersion" TEXT NOT NULL,
    "eventBody" JSONB NOT NULL,

    CONSTRAINT "P2DomainEvent_pkey" PRIMARY KEY ("eventId"),
    CONSTRAINT "P2DomainEvent_type_check"
        CHECK ("eventType" = 'truth_revision.activated.v1'),
    CONSTRAINT "P2DomainEvent_schema_check"
        CHECK ("eventSchemaVersion" = 1),
    CONSTRAINT "P2DomainEvent_actor_check"
        CHECK ("actorType" = 'USER_ACTOR'),
    CONSTRAINT "P2DomainEvent_request_check" CHECK (
        btrim("requestId") <> ''
        AND btrim("correlationId") <> ''
        AND btrim("productVersion") <> ''
    ),
    CONSTRAINT "P2DomainEvent_sourceCommit_check"
        CHECK ("sourceCommit" ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'),
    CONSTRAINT "P2DomainEvent_body_check" CHECK (
        jsonb_typeof("eventBody") = 'object'
        AND "eventBody" ? 'truthRevisionId'
        AND jsonb_typeof("eventBody" -> 'truthRevisionId') = 'string'
        AND "eventBody" ? 'parentRevisionId'
        AND (
            ("eventBody" -> 'parentRevisionId') = 'null'::jsonb
            OR jsonb_typeof("eventBody" -> 'parentRevisionId') = 'string'
        )
        AND "eventBody" ? 'previousActiveTruthRevisionId'
        AND (
            ("eventBody" -> 'previousActiveTruthRevisionId') = 'null'::jsonb
            OR jsonb_typeof("eventBody" -> 'previousActiveTruthRevisionId') = 'string'
        )
        AND "eventBody" ? 'projectId'
        AND "eventBody" ->> 'projectId' = "projectId"
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceSnapshot_scope_id_key"
ON "SourceSnapshot"("workspaceId", "projectId", "sourceSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTruthRevision_scope_id_key"
ON "ProductTruthRevision"(
    "workspaceId",
    "projectId",
    "productTruthRevisionId"
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductTruthRevision_scope_revision_key"
ON "ProductTruthRevision"("workspaceId", "projectId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTruthRevision_one_active_key"
ON "ProductTruthRevision"("workspaceId", "projectId")
WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "ProductTruthRevision_scope_status_revision_idx"
ON "ProductTruthRevision"(
    "workspaceId",
    "projectId",
    "status",
    "revisionNumber"
);

-- CreateIndex
CREATE INDEX "ProductTruthRevision_createdByActorId_idx"
ON "ProductTruthRevision"("createdByActorId");

-- CreateIndex
CREATE INDEX "ProductTruthRevision_parentRevisionId_idx"
ON "ProductTruthRevision"("parentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "TruthRevisionSourceLink_revision_source_key"
ON "TruthRevisionSourceLink"(
    "productTruthRevisionId",
    "sourceSnapshotId"
);

-- CreateIndex
CREATE UNIQUE INDEX "TruthRevisionSourceLink_revision_sort_key"
ON "TruthRevisionSourceLink"("productTruthRevisionId", "sortOrder");

-- CreateIndex
CREATE INDEX "TruthRevisionSourceLink_scope_source_idx"
ON "TruthRevisionSourceLink"(
    "workspaceId",
    "projectId",
    "sourceSnapshotId"
);

-- CreateIndex
CREATE INDEX "TruthRevisionSourceLink_createdByActorId_idx"
ON "TruthRevisionSourceLink"("createdByActorId");

-- CreateIndex
CREATE INDEX "P2DomainEvent_scope_occurredAt_idx"
ON "P2DomainEvent"("workspaceId", "projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "P2DomainEvent_workspaceId_requestId_idx"
ON "P2DomainEvent"("workspaceId", "requestId");

-- CreateIndex
CREATE INDEX "P2DomainEvent_actorId_idx"
ON "P2DomainEvent"("actorId");

-- AddForeignKey
ALTER TABLE "ProductTruthRevision"
ADD CONSTRAINT "ProductTruthRevision_scope_project_fkey"
FOREIGN KEY ("workspaceId", "projectId")
REFERENCES "ProductProject"("workspaceId", "projectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTruthRevision"
ADD CONSTRAINT "ProductTruthRevision_scope_parent_fkey"
FOREIGN KEY ("workspaceId", "projectId", "parentRevisionId")
REFERENCES "ProductTruthRevision"(
    "workspaceId",
    "projectId",
    "productTruthRevisionId"
)
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTruthRevision"
ADD CONSTRAINT "ProductTruthRevision_scope_creator_fkey"
FOREIGN KEY ("workspaceId", "createdByActorId")
REFERENCES "Membership"("workspaceId", "userActorId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruthRevisionSourceLink"
ADD CONSTRAINT "TruthRevisionSourceLink_scope_revision_fkey"
FOREIGN KEY ("workspaceId", "projectId", "productTruthRevisionId")
REFERENCES "ProductTruthRevision"(
    "workspaceId",
    "projectId",
    "productTruthRevisionId"
)
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruthRevisionSourceLink"
ADD CONSTRAINT "TruthRevisionSourceLink_scope_source_fkey"
FOREIGN KEY ("workspaceId", "projectId", "sourceSnapshotId")
REFERENCES "SourceSnapshot"(
    "workspaceId",
    "projectId",
    "sourceSnapshotId"
)
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruthRevisionSourceLink"
ADD CONSTRAINT "TruthRevisionSourceLink_scope_creator_fkey"
FOREIGN KEY ("workspaceId", "createdByActorId")
REFERENCES "Membership"("workspaceId", "userActorId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2DomainEvent"
ADD CONSTRAINT "P2DomainEvent_scope_project_fkey"
FOREIGN KEY ("workspaceId", "projectId")
REFERENCES "ProductProject"("workspaceId", "projectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2DomainEvent"
ADD CONSTRAINT "P2DomainEvent_scope_actor_fkey"
FOREIGN KEY ("workspaceId", "actorId")
REFERENCES "Membership"("workspaceId", "userActorId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductProject"
ADD CONSTRAINT "ProductProject_scope_activeTruthRevision_fkey"
FOREIGN KEY ("workspaceId", "projectId", "activeTruthRevisionId")
REFERENCES "ProductTruthRevision"(
    "workspaceId",
    "projectId",
    "productTruthRevisionId"
)
ON DELETE RESTRICT ON UPDATE CASCADE
DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION "p2_guard_product_truth_revision_change"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'ProductTruthRevision cannot be physically deleted';
    END IF;

    IF NEW."productTruthRevisionId" IS DISTINCT FROM OLD."productTruthRevisionId"
        OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
        OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
        OR NEW."revisionNumber" IS DISTINCT FROM OLD."revisionNumber"
        OR NEW."truthBody" IS DISTINCT FROM OLD."truthBody"
        OR NEW."productContinuity" IS DISTINCT FROM OLD."productContinuity"
        OR NEW."parentRevisionId" IS DISTINCT FROM OLD."parentRevisionId"
        OR NEW."createdByActorId" IS DISTINCT FROM OLD."createdByActorId"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'ProductTruthRevision content and provenance are immutable';
    END IF;

    IF NEW."status" IS DISTINCT FROM OLD."status" THEN
        IF NOT (
            (OLD."status" = 'DRAFT' AND NEW."status" IN ('ACTIVE', 'INVALIDATED'))
            OR (OLD."status" = 'ACTIVE' AND NEW."status" IN ('SUPERSEDED', 'INVALIDATED'))
            OR (OLD."status" = 'SUPERSEDED' AND NEW."status" = 'INVALIDATED')
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'ProductTruthRevision status transition is not allowed';
        END IF;
    ELSIF NEW."activatedAt" IS DISTINCT FROM OLD."activatedAt"
        OR NEW."supersededAt" IS DISTINCT FROM OLD."supersededAt"
        OR NEW."invalidatedAt" IS DISTINCT FROM OLD."invalidatedAt" THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'ProductTruthRevision timestamps require a status transition';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProductTruthRevision_guard_change_trigger"
BEFORE UPDATE OR DELETE ON "ProductTruthRevision"
FOR EACH ROW EXECUTE FUNCTION "p2_guard_product_truth_revision_change"();

CREATE FUNCTION "p2_guard_truth_revision_source_link_change"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'TruthRevisionSourceLink cannot be physically deleted';
    END IF;

    IF NEW."linkId" IS DISTINCT FROM OLD."linkId"
        OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
        OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
        OR NEW."productTruthRevisionId" IS DISTINCT FROM OLD."productTruthRevisionId"
        OR NEW."sourceSnapshotId" IS DISTINCT FROM OLD."sourceSnapshotId"
        OR NEW."sourceRole" IS DISTINCT FROM OLD."sourceRole"
        OR NEW."sortOrder" IS DISTINCT FROM OLD."sortOrder"
        OR NEW."createdByActorId" IS DISTINCT FROM OLD."createdByActorId"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'TruthRevisionSourceLink identity and provenance are immutable';
    END IF;

    IF NEW."linkStatus" IS DISTINCT FROM OLD."linkStatus"
        AND NOT (
            OLD."linkStatus" = 'ACTIVE'
            AND NEW."linkStatus" = 'INVALIDATED'
        ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'TruthRevisionSourceLink status transition is not allowed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TruthRevisionSourceLink_guard_change_trigger"
BEFORE UPDATE OR DELETE ON "TruthRevisionSourceLink"
FOR EACH ROW EXECUTE FUNCTION "p2_guard_truth_revision_source_link_change"();

CREATE FUNCTION "p2_guard_domain_event_change"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'P2DomainEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "P2DomainEvent_guard_change_trigger"
BEFORE UPDATE OR DELETE ON "P2DomainEvent"
FOR EACH ROW EXECUTE FUNCTION "p2_guard_domain_event_change"();

CREATE FUNCTION "p2_check_product_truth_active_pointer"()
RETURNS TRIGGER AS $$
DECLARE
    target_workspace_id TEXT;
    target_project_id TEXT;
    active_pointer_id TEXT;
    active_revision_id TEXT;
    active_revision_count INTEGER;
BEGIN
    target_workspace_id := NEW."workspaceId";
    target_project_id := NEW."projectId";

    SELECT project."activeTruthRevisionId"
      INTO active_pointer_id
      FROM "ProductProject" AS project
     WHERE project."workspaceId" = target_workspace_id
       AND project."projectId" = target_project_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*)::INTEGER, MIN(revision."productTruthRevisionId")
      INTO active_revision_count, active_revision_id
      FROM "ProductTruthRevision" AS revision
     WHERE revision."workspaceId" = target_workspace_id
       AND revision."projectId" = target_project_id
       AND revision."status" = 'ACTIVE';

    IF active_pointer_id IS NULL THEN
        IF active_revision_count <> 0 THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'ProductProject active truth pointer is missing';
        END IF;
    ELSIF active_revision_count <> 1
        OR active_revision_id IS DISTINCT FROM active_pointer_id THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'ProductProject active truth pointer is inconsistent';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ProductProject_active_truth_integrity_trigger"
AFTER INSERT OR UPDATE OF "activeTruthRevisionId" ON "ProductProject"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "p2_check_product_truth_active_pointer"();

CREATE CONSTRAINT TRIGGER "ProductTruthRevision_active_truth_integrity_trigger"
AFTER INSERT OR UPDATE OF "status" ON "ProductTruthRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "p2_check_product_truth_active_pointer"();
