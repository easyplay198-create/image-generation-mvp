-- CreateEnum
CREATE TYPE "P2IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'SUCCEEDED');

-- CreateTable
CREATE TABLE "P2IdempotencyRecord" (
    "idempotencyRecordId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "status" "P2IdempotencyStatus" NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "P2IdempotencyRecord_pkey" PRIMARY KEY ("idempotencyRecordId"),
    CONSTRAINT "P2IdempotencyRecord_canonical_check" CHECK (
        btrim("operation") <> ''
        AND "operation" = btrim("operation")
        AND btrim("idempotencyKey") <> ''
        AND "idempotencyKey" = btrim("idempotencyKey")
        AND "requestFingerprint" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "P2IdempotencyRecord_response_check" CHECK (
        (
            "status" = 'IN_PROGRESS'
            AND "responseStatus" IS NULL
            AND "responseBody" IS NULL
            AND "completedAt" IS NULL
        )
        OR (
            "status" = 'SUCCEEDED'
            AND "responseStatus" BETWEEN 200 AND 299
            AND jsonb_typeof("responseBody") = 'object'
            AND "completedAt" IS NOT NULL
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "P2IdempotencyRecord_scope_operation_key"
ON "P2IdempotencyRecord"("workspaceId", "operation", "idempotencyKey");

-- CreateIndex
CREATE INDEX "P2IdempotencyRecord_scope_project_createdAt_idx"
ON "P2IdempotencyRecord"("workspaceId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "P2IdempotencyRecord_actorId_idx"
ON "P2IdempotencyRecord"("actorId");

-- AddForeignKey
ALTER TABLE "P2IdempotencyRecord"
ADD CONSTRAINT "P2IdempotencyRecord_workspace_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("workspaceId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2IdempotencyRecord"
ADD CONSTRAINT "P2IdempotencyRecord_scope_project_fkey"
FOREIGN KEY ("workspaceId", "projectId")
REFERENCES "ProductProject"("workspaceId", "projectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2IdempotencyRecord"
ADD CONSTRAINT "P2IdempotencyRecord_scope_actor_fkey"
FOREIGN KEY ("workspaceId", "actorId")
REFERENCES "Membership"("workspaceId", "userActorId")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "p2_guard_idempotency_record_change"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'P2IdempotencyRecord cannot be physically deleted';
    END IF;

    IF NEW."idempotencyRecordId" IS DISTINCT FROM OLD."idempotencyRecordId"
        OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
        OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
        OR NEW."actorId" IS DISTINCT FROM OLD."actorId"
        OR NEW."operation" IS DISTINCT FROM OLD."operation"
        OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
        OR NEW."requestFingerprint" IS DISTINCT FROM OLD."requestFingerprint"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'P2IdempotencyRecord identity and provenance are immutable';
    END IF;

    IF OLD."status" = 'SUCCEEDED' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Succeeded P2IdempotencyRecord is terminal';
    END IF;

    IF NOT (OLD."status" = 'IN_PROGRESS' AND NEW."status" = 'SUCCEEDED') THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'P2IdempotencyRecord transition is not allowed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "P2IdempotencyRecord_guard_change_trigger"
BEFORE UPDATE OR DELETE ON "P2IdempotencyRecord"
FOR EACH ROW EXECUTE FUNCTION "p2_guard_idempotency_record_change"();
