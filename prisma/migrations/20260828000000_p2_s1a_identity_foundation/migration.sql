-- CreateEnum
CREATE TYPE "UserActorStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "UserActor" (
    "userActorId" TEXT NOT NULL,
    "authIssuer" TEXT NOT NULL,
    "authSubject" TEXT NOT NULL,
    "status" "UserActorStatus" NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActor_pkey" PRIMARY KEY ("userActorId"),
    CONSTRAINT "UserActor_status_disabled_check" CHECK (
        ("status" = 'ACTIVE' AND "disabledAt" IS NULL)
        OR ("status" = 'DISABLED' AND "disabledAt" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "Workspace" (
    "workspaceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "WorkspaceStatus" NOT NULL,
    "createdByActorId" TEXT NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("workspaceId"),
    CONSTRAINT "Workspace_status_timestamps_check" CHECK (
        ("status" = 'ACTIVE' AND "suspendedAt" IS NULL AND "archivedAt" IS NULL)
        OR ("status" = 'SUSPENDED' AND "suspendedAt" IS NOT NULL AND "archivedAt" IS NULL)
        OR ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "Membership" (
    "membershipId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userActorId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByActorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("membershipId"),
    CONSTRAINT "Membership_status_revocation_check" CHECK (
        ("status" = 'ACTIVE' AND "revokedAt" IS NULL AND "revokedByActorId" IS NULL)
        OR ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "UserActor_authIssuer_authSubject_key"
ON "UserActor"("authIssuer", "authSubject");

-- CreateIndex
CREATE INDEX "Workspace_createdByActorId_idx"
ON "Workspace"("createdByActorId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_workspaceId_userActorId_key"
ON "Membership"("workspaceId", "userActorId");

-- A Workspace may retain revoked history, but it can have at most one active
-- member during P2.
CREATE UNIQUE INDEX "Membership_one_active_per_workspace_key"
ON "Membership"("workspaceId")
WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "Membership_userActorId_status_idx"
ON "Membership"("userActorId", "status");

-- CreateIndex
CREATE INDEX "Membership_revokedByActorId_idx"
ON "Membership"("revokedByActorId");

-- AddForeignKey
ALTER TABLE "Workspace"
ADD CONSTRAINT "Workspace_createdByActorId_fkey"
FOREIGN KEY ("createdByActorId") REFERENCES "UserActor"("userActorId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership"
ADD CONSTRAINT "Membership_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("workspaceId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership"
ADD CONSTRAINT "Membership_userActorId_fkey"
FOREIGN KEY ("userActorId") REFERENCES "UserActor"("userActorId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership"
ADD CONSTRAINT "Membership_revokedByActorId_fkey"
FOREIGN KEY ("revokedByActorId") REFERENCES "UserActor"("userActorId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutable identity fields remain stable after creation.
CREATE FUNCTION "p2_guard_user_actor_update"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."userActorId" IS DISTINCT FROM OLD."userActorId"
        OR NEW."authIssuer" IS DISTINCT FROM OLD."authIssuer"
        OR NEW."authSubject" IS DISTINCT FROM OLD."authSubject"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'UserActor identity fields are immutable';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserActor_immutable_fields_trigger"
BEFORE UPDATE ON "UserActor"
FOR EACH ROW EXECUTE FUNCTION "p2_guard_user_actor_update"();

CREATE FUNCTION "p2_guard_workspace_update"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
        OR NEW."createdByActorId" IS DISTINCT FROM OLD."createdByActorId"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Workspace identity fields are immutable';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Workspace_immutable_fields_trigger"
BEFORE UPDATE ON "Workspace"
FOR EACH ROW EXECUTE FUNCTION "p2_guard_workspace_update"();

CREATE FUNCTION "p2_guard_membership_change"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Membership authorization history cannot be deleted';
    END IF;

    IF OLD."status" = 'REVOKED' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'A revoked Membership is terminal and immutable';
    END IF;

    IF NEW."membershipId" IS DISTINCT FROM OLD."membershipId"
        OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
        OR NEW."userActorId" IS DISTINCT FROM OLD."userActorId"
        OR NEW."role" IS DISTINCT FROM OLD."role"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Membership identity fields are immutable';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Membership_guard_change_trigger"
BEFORE UPDATE OR DELETE ON "Membership"
FOR EACH ROW EXECUTE FUNCTION "p2_guard_membership_change"();
