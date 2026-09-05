-- P2_S1I_COMPAT_DDL_V1: frozen predecessor, atomic additive lineage.
-- Catalog constants come from the exact predecessor migrations, not live application data.
BEGIN;
DO $migration$
DECLARE
  before_guard jsonb;
  before_trigger jsonb;
  actual_catalog jsonb;
BEGIN
  SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname IN ('AssetTask','P2DomainEvent','SourceSnapshot','Membership','ProductProject','ProductTruthRevision') AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.relname,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('AssetTask','P2DomainEvent','SourceSnapshot','Membership','ProductProject','ProductTruthRevision')),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(tablename,indexname,indexdef) ORDER BY tablename,indexname) FROM pg_indexes WHERE schemaname='public' AND tablename IN ('AssetTask','P2DomainEvent','SourceSnapshot','Membership','ProductProject','ProductTruthRevision')),
 'enums',(SELECT jsonb_agg(jsonb_build_array(t.typname,e.enumlabel) ORDER BY t.typname,e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public')
) INTO actual_catalog;
  IF (SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind,pg_get_userbyid(c.relowner)=current_user,c.relacl) ORDER BY c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('AssetTask','Membership','P2DomainEvent','ProductProject','ProductTruthRevision','SourceSnapshot'))
      IS DISTINCT FROM '[["AssetTask","r",true,null],["Membership","r",true,null],["P2DomainEvent","r",true,null],["ProductProject","r",true,null],["ProductTruthRevision","r",true,null],["SourceSnapshot","r",true,null]]'::jsonb THEN
    RAISE EXCEPTION 'P2_S1I_PREDECESSOR_RELATION_IDENTITY_MISMATCH';
  END IF;
  IF actual_catalog IS DISTINCT FROM $catalog${"enums":[["AssetClass","IMAGE"],["AssetKind","PRODUCT"],["AssetKind","REFERENCE"],["AssetKind","GENERATED_BACKGROUND"],["AssetKind","EXPORT"],["AssetTaskOutputPurpose","INTERNAL_TEST"],["AssetTaskStatus","QUEUED"],["AssetTaskType","INTERNAL_SINGLE_IMAGE"],["BenchmarkJobStatus","QUEUED"],["BenchmarkJobStatus","RUNNING"],["BenchmarkJobStatus","SUCCEEDED"],["BenchmarkJobStatus","FAILED"],["BenchmarkVariant","PLAIN_PROMPT"],["BenchmarkVariant","STYLE_SPEC"],["JobStatus","QUEUED"],["JobStatus","RUNNING"],["JobStatus","SUCCEEDED"],["JobStatus","FAILED"],["JobStatus","CANCELED"],["JobType","STYLE_ANALYSIS"],["JobType","IMAGE_GENERATION"],["MembershipRole","OWNER"],["MembershipStatus","ACTIVE"],["MembershipStatus","REVOKED"],["P2IdempotencyStatus","IN_PROGRESS"],["P2IdempotencyStatus","SUCCEEDED"],["ProductProjectStatus","DRAFT"],["ProductProjectStatus","ACTIVE"],["ProductProjectStatus","BLOCKED"],["ProductProjectStatus","ARCHIVED"],["ProductTruthContinuity","SAME_PRODUCT"],["ProductTruthContinuity","DIFFERENT_PRODUCT"],["ProductTruthContinuity","REVIEW_REQUIRED"],["ProductTruthRevisionStatus","DRAFT"],["ProductTruthRevisionStatus","ACTIVE"],["ProductTruthRevisionStatus","SUPERSEDED"],["ProductTruthRevisionStatus","INVALIDATED"],["ProjectStatus","DRAFT"],["ProjectStatus","ACTIVE"],["ProjectStatus","ARCHIVED"],["ProviderSubmissionState","NOT_STARTED"],["ProviderSubmissionState","SUBMITTING"],["ProviderSubmissionState","SUBMITTED"],["ProviderSubmissionState","AMBIGUOUS"],["ProviderSubmissionState","COMPLETED"],["SourceSnapshotKind","PRODUCT_SOURCE"],["SourceSnapshotKind","PRODUCT_REFERENCE"],["SourceSnapshotKind","BRAND_REFERENCE"],["SourceSnapshotKind","LOGO_REFERENCE"],["SourceSnapshotKind","OTHER_REFERENCE"],["SourceSnapshotLifecycleStatus","ACTIVE"],["SourceSnapshotLifecycleStatus","DELETED"],["SourceSnapshotValidationStatus","PENDING"],["SourceSnapshotValidationStatus","VALID"],["SourceSnapshotValidationStatus","ACTION_REQUIRED"],["SourceSnapshotValidationStatus","INVALID"],["TruthRevisionLinkStatus","ACTIVE"],["TruthRevisionLinkStatus","INVALIDATED"],["TruthRevisionSourceRole","PRODUCT_PRIMARY"],["TruthRevisionSourceRole","PRODUCT_SUPPORTING"],["UserActorStatus","ACTIVE"],["UserActorStatus","DISABLED"],["WorkspaceStatus","ACTIVE"],["WorkspaceStatus","SUSPENDED"],["WorkspaceStatus","ARCHIVED"]],"columns":[["AssetTask","assetTaskId",1,"text",true,null],["AssetTask","workspaceId",2,"text",true,null],["AssetTask","projectId",3,"text",true,null],["AssetTask","taskType",4,"\"AssetTaskType\"",true,null],["AssetTask","assetClass",5,"\"AssetClass\"",true,null],["AssetTask","outputPurpose",6,"\"AssetTaskOutputPurpose\"",true,null],["AssetTask","truthRevisionId",7,"text",true,null],["AssetTask","productSourceSnapshotId",8,"text",true,null],["AssetTask","status",9,"\"AssetTaskStatus\"",true,null],["AssetTask","createdByActorId",10,"text",true,null],["AssetTask","createdAt",11,"timestamp(3) without time zone",true,"CURRENT_TIMESTAMP"],["Membership","membershipId",1,"text",true,null],["Membership","workspaceId",2,"text",true,null],["Membership","userActorId",3,"text",true,null],["Membership","role",4,"\"MembershipRole\"",true,null],["Membership","status",5,"\"MembershipStatus\"",true,null],["Membership","revokedAt",6,"timestamp(3) without time zone",false,null],["Membership","revokedByActorId",7,"text",false,null],["Membership","createdAt",8,"timestamp(3) without time zone",true,"CURRENT_TIMESTAMP"],["P2DomainEvent","eventId",1,"text",true,null],["P2DomainEvent","eventType",2,"text",true,null],["P2DomainEvent","eventSchemaVersion",3,"integer",true,null],["P2DomainEvent","occurredAt",4,"timestamp(3) without time zone",true,"CURRENT_TIMESTAMP"],["P2DomainEvent","workspaceId",5,"text",true,null],["P2DomainEvent","projectId",6,"text",true,null],["P2DomainEvent","actorType",7,"text",true,null],["P2DomainEvent","actorId",8,"text",true,null],["P2DomainEvent","requestId",9,"text",true,null],["P2DomainEvent","correlationId",10,"text",true,null],["P2DomainEvent","sourceCommit",11,"text",true,null],["P2DomainEvent","productVersion",12,"text",true,null],["P2DomainEvent","eventBody",13,"jsonb",true,null],["ProductProject","projectId",1,"text",true,null],["ProductProject","workspaceId",2,"text",true,null],["ProductProject","skuIdentityKey",3,"text",true,null],["ProductProject","displayName",4,"text",true,null],["ProductProject","status",5,"\"ProductProjectStatus\"",true,null],["ProductProject","createdByActorId",6,"text",true,null],["ProductProject","archivedAt",7,"timestamp(3) without time zone",false,null],["ProductProject","createdAt",8,"timestamp(3) without time zone",true,"CURRENT_TIMESTAMP"],["ProductProject","activeTruthRevisionId",9,"text",false,null],["ProductTruthRevision","productTruthRevisionId",1,"text",true,null],["ProductTruthRevision","workspaceId",2,"text",true,null],["ProductTruthRevision","projectId",3,"text",true,null],["ProductTruthRevision","revisionNumber",4,"integer",true,null],["ProductTruthRevision","truthBody",5,"jsonb",true,null],["ProductTruthRevision","productContinuity",6,"\"ProductTruthContinuity\"",true,null],["ProductTruthRevision","status",7,"\"ProductTruthRevisionStatus\"",true,null],["ProductTruthRevision","parentRevisionId",8,"text",false,null],["ProductTruthRevision","createdByActorId",9,"text",true,null],["ProductTruthRevision","activatedAt",10,"timestamp(3) without time zone",false,null],["ProductTruthRevision","supersededAt",11,"timestamp(3) without time zone",false,null],["ProductTruthRevision","invalidatedAt",12,"timestamp(3) without time zone",false,null],["ProductTruthRevision","createdAt",13,"timestamp(3) without time zone",true,"CURRENT_TIMESTAMP"],["SourceSnapshot","sourceSnapshotId",1,"text",true,null],["SourceSnapshot","workspaceId",2,"text",true,null],["SourceSnapshot","projectId",3,"text",true,null],["SourceSnapshot","sourceKind",4,"\"SourceSnapshotKind\"",true,null],["SourceSnapshot","mediaType",5,"text",true,null],["SourceSnapshot","byteSize",6,"bigint",true,null],["SourceSnapshot","contentDigest",7,"text",true,null],["SourceSnapshot","storageLocator",8,"text",true,null],["SourceSnapshot","validationStatus",9,"\"SourceSnapshotValidationStatus\"",true,null],["SourceSnapshot","lifecycleStatus",10,"\"SourceSnapshotLifecycleStatus\"",true,null],["SourceSnapshot","capturedAt",11,"timestamp(3) without time zone",true,"CURRENT_TIMESTAMP"],["SourceSnapshot","createdByActorId",12,"text",true,null]],"indexes":[["AssetTask","AssetTask_createdByActorId_idx","CREATE INDEX \"AssetTask_createdByActorId_idx\" ON public.\"AssetTask\" USING btree (\"createdByActorId\")"],["AssetTask","AssetTask_pkey","CREATE UNIQUE INDEX \"AssetTask_pkey\" ON public.\"AssetTask\" USING btree (\"assetTaskId\")"],["AssetTask","AssetTask_scope_id_key","CREATE UNIQUE INDEX \"AssetTask_scope_id_key\" ON public.\"AssetTask\" USING btree (\"workspaceId\", \"projectId\", \"assetTaskId\")"],["AssetTask","AssetTask_scope_productSource_idx","CREATE INDEX \"AssetTask_scope_productSource_idx\" ON public.\"AssetTask\" USING btree (\"workspaceId\", \"projectId\", \"productSourceSnapshotId\")"],["AssetTask","AssetTask_scope_status_createdAt_idx","CREATE INDEX \"AssetTask_scope_status_createdAt_idx\" ON public.\"AssetTask\" USING btree (\"workspaceId\", \"projectId\", status, \"createdAt\")"],["AssetTask","AssetTask_scope_truthRevision_idx","CREATE INDEX \"AssetTask_scope_truthRevision_idx\" ON public.\"AssetTask\" USING btree (\"workspaceId\", \"projectId\", \"truthRevisionId\")"],["Membership","Membership_one_active_per_workspace_key","CREATE UNIQUE INDEX \"Membership_one_active_per_workspace_key\" ON public.\"Membership\" USING btree (\"workspaceId\") WHERE (status = 'ACTIVE'::\"MembershipStatus\")"],["Membership","Membership_pkey","CREATE UNIQUE INDEX \"Membership_pkey\" ON public.\"Membership\" USING btree (\"membershipId\")"],["Membership","Membership_revokedByActorId_idx","CREATE INDEX \"Membership_revokedByActorId_idx\" ON public.\"Membership\" USING btree (\"revokedByActorId\")"],["Membership","Membership_userActorId_status_idx","CREATE INDEX \"Membership_userActorId_status_idx\" ON public.\"Membership\" USING btree (\"userActorId\", status)"],["Membership","Membership_workspaceId_userActorId_key","CREATE UNIQUE INDEX \"Membership_workspaceId_userActorId_key\" ON public.\"Membership\" USING btree (\"workspaceId\", \"userActorId\")"],["P2DomainEvent","P2DomainEvent_actorId_idx","CREATE INDEX \"P2DomainEvent_actorId_idx\" ON public.\"P2DomainEvent\" USING btree (\"actorId\")"],["P2DomainEvent","P2DomainEvent_pkey","CREATE UNIQUE INDEX \"P2DomainEvent_pkey\" ON public.\"P2DomainEvent\" USING btree (\"eventId\")"],["P2DomainEvent","P2DomainEvent_scope_occurredAt_idx","CREATE INDEX \"P2DomainEvent_scope_occurredAt_idx\" ON public.\"P2DomainEvent\" USING btree (\"workspaceId\", \"projectId\", \"occurredAt\")"],["P2DomainEvent","P2DomainEvent_workspaceId_requestId_idx","CREATE INDEX \"P2DomainEvent_workspaceId_requestId_idx\" ON public.\"P2DomainEvent\" USING btree (\"workspaceId\", \"requestId\")"],["ProductProject","ProductProject_createdByActorId_idx","CREATE INDEX \"ProductProject_createdByActorId_idx\" ON public.\"ProductProject\" USING btree (\"createdByActorId\")"],["ProductProject","ProductProject_pkey","CREATE UNIQUE INDEX \"ProductProject_pkey\" ON public.\"ProductProject\" USING btree (\"projectId\")"],["ProductProject","ProductProject_workspaceId_projectId_key","CREATE UNIQUE INDEX \"ProductProject_workspaceId_projectId_key\" ON public.\"ProductProject\" USING btree (\"workspaceId\", \"projectId\")"],["ProductProject","ProductProject_workspaceId_skuIdentityKey_key","CREATE UNIQUE INDEX \"ProductProject_workspaceId_skuIdentityKey_key\" ON public.\"ProductProject\" USING btree (\"workspaceId\", \"skuIdentityKey\")"],["ProductProject","ProductProject_workspaceId_status_createdAt_idx","CREATE INDEX \"ProductProject_workspaceId_status_createdAt_idx\" ON public.\"ProductProject\" USING btree (\"workspaceId\", status, \"createdAt\")"],["ProductTruthRevision","ProductTruthRevision_createdByActorId_idx","CREATE INDEX \"ProductTruthRevision_createdByActorId_idx\" ON public.\"ProductTruthRevision\" USING btree (\"createdByActorId\")"],["ProductTruthRevision","ProductTruthRevision_one_active_key","CREATE UNIQUE INDEX \"ProductTruthRevision_one_active_key\" ON public.\"ProductTruthRevision\" USING btree (\"workspaceId\", \"projectId\") WHERE (status = 'ACTIVE'::\"ProductTruthRevisionStatus\")"],["ProductTruthRevision","ProductTruthRevision_parentRevisionId_idx","CREATE INDEX \"ProductTruthRevision_parentRevisionId_idx\" ON public.\"ProductTruthRevision\" USING btree (\"parentRevisionId\")"],["ProductTruthRevision","ProductTruthRevision_pkey","CREATE UNIQUE INDEX \"ProductTruthRevision_pkey\" ON public.\"ProductTruthRevision\" USING btree (\"productTruthRevisionId\")"],["ProductTruthRevision","ProductTruthRevision_scope_id_key","CREATE UNIQUE INDEX \"ProductTruthRevision_scope_id_key\" ON public.\"ProductTruthRevision\" USING btree (\"workspaceId\", \"projectId\", \"productTruthRevisionId\")"],["ProductTruthRevision","ProductTruthRevision_scope_revision_key","CREATE UNIQUE INDEX \"ProductTruthRevision_scope_revision_key\" ON public.\"ProductTruthRevision\" USING btree (\"workspaceId\", \"projectId\", \"revisionNumber\")"],["ProductTruthRevision","ProductTruthRevision_scope_status_revision_idx","CREATE INDEX \"ProductTruthRevision_scope_status_revision_idx\" ON public.\"ProductTruthRevision\" USING btree (\"workspaceId\", \"projectId\", status, \"revisionNumber\")"],["SourceSnapshot","SourceSnapshot_createdByActorId_idx","CREATE INDEX \"SourceSnapshot_createdByActorId_idx\" ON public.\"SourceSnapshot\" USING btree (\"createdByActorId\")"],["SourceSnapshot","SourceSnapshot_pkey","CREATE UNIQUE INDEX \"SourceSnapshot_pkey\" ON public.\"SourceSnapshot\" USING btree (\"sourceSnapshotId\")"],["SourceSnapshot","SourceSnapshot_scope_id_key","CREATE UNIQUE INDEX \"SourceSnapshot_scope_id_key\" ON public.\"SourceSnapshot\" USING btree (\"workspaceId\", \"projectId\", \"sourceSnapshotId\")"],["SourceSnapshot","SourceSnapshot_workspaceId_projectId_capturedAt_idx","CREATE INDEX \"SourceSnapshot_workspaceId_projectId_capturedAt_idx\" ON public.\"SourceSnapshot\" USING btree (\"workspaceId\", \"projectId\", \"capturedAt\")"],["SourceSnapshot","SourceSnapshot_workspaceId_projectId_contentDigest_idx","CREATE INDEX \"SourceSnapshot_workspaceId_projectId_contentDigest_idx\" ON public.\"SourceSnapshot\" USING btree (\"workspaceId\", \"projectId\", \"contentDigest\")"]],"constraints":[["AssetTask","AssetTask_identifiers_check","c",true,"CHECK (((btrim(\"assetTaskId\") <> ''::text) AND (\"assetTaskId\" = btrim(\"assetTaskId\")) AND (btrim(\"truthRevisionId\") <> ''::text) AND (\"truthRevisionId\" = btrim(\"truthRevisionId\")) AND (btrim(\"productSourceSnapshotId\") <> ''::text) AND (\"productSourceSnapshotId\" = btrim(\"productSourceSnapshotId\"))))"],["AssetTask","AssetTask_pkey","p",true,"PRIMARY KEY (\"assetTaskId\")"],["AssetTask","AssetTask_scope_creator_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"createdByActorId\") REFERENCES \"Membership\"(\"workspaceId\", \"userActorId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["AssetTask","AssetTask_scope_productSource_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"projectId\", \"productSourceSnapshotId\") REFERENCES \"SourceSnapshot\"(\"workspaceId\", \"projectId\", \"sourceSnapshotId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["AssetTask","AssetTask_scope_project_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"projectId\") REFERENCES \"ProductProject\"(\"workspaceId\", \"projectId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["AssetTask","AssetTask_scope_truthRevision_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"projectId\", \"truthRevisionId\") REFERENCES \"ProductTruthRevision\"(\"workspaceId\", \"projectId\", \"productTruthRevisionId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["Membership","Membership_pkey","p",true,"PRIMARY KEY (\"membershipId\")"],["Membership","Membership_revokedByActorId_fkey","f",true,"FOREIGN KEY (\"revokedByActorId\") REFERENCES \"UserActor\"(\"userActorId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["Membership","Membership_status_revocation_check","c",true,"CHECK ((((status = 'ACTIVE'::\"MembershipStatus\") AND (\"revokedAt\" IS NULL) AND (\"revokedByActorId\" IS NULL)) OR ((status = 'REVOKED'::\"MembershipStatus\") AND (\"revokedAt\" IS NOT NULL))))"],["Membership","Membership_userActorId_fkey","f",true,"FOREIGN KEY (\"userActorId\") REFERENCES \"UserActor\"(\"userActorId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["Membership","Membership_workspaceId_fkey","f",true,"FOREIGN KEY (\"workspaceId\") REFERENCES \"Workspace\"(\"workspaceId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["P2DomainEvent","P2DomainEvent_actor_check","c",true,"CHECK ((\"actorType\" = 'USER_ACTOR'::text))"],["P2DomainEvent","P2DomainEvent_body_check","c",true,"CHECK (((jsonb_typeof(\"eventBody\") = 'object'::text) AND (\"eventBody\" ? 'truthRevisionId'::text) AND (jsonb_typeof((\"eventBody\" -> 'truthRevisionId'::text)) = 'string'::text) AND (\"eventBody\" ? 'parentRevisionId'::text) AND (((\"eventBody\" -> 'parentRevisionId'::text) = 'null'::jsonb) OR (jsonb_typeof((\"eventBody\" -> 'parentRevisionId'::text)) = 'string'::text)) AND (\"eventBody\" ? 'previousActiveTruthRevisionId'::text) AND (((\"eventBody\" -> 'previousActiveTruthRevisionId'::text) = 'null'::jsonb) OR (jsonb_typeof((\"eventBody\" -> 'previousActiveTruthRevisionId'::text)) = 'string'::text)) AND (\"eventBody\" ? 'projectId'::text) AND ((\"eventBody\" ->> 'projectId'::text) = \"projectId\")))"],["P2DomainEvent","P2DomainEvent_pkey","p",true,"PRIMARY KEY (\"eventId\")"],["P2DomainEvent","P2DomainEvent_request_check","c",true,"CHECK (((btrim(\"requestId\") <> ''::text) AND (\"requestId\" = btrim(\"requestId\")) AND (btrim(\"correlationId\") <> ''::text) AND (\"correlationId\" = btrim(\"correlationId\")) AND (btrim(\"productVersion\") <> ''::text) AND (\"productVersion\" = btrim(\"productVersion\"))))"],["P2DomainEvent","P2DomainEvent_schema_check","c",true,"CHECK ((\"eventSchemaVersion\" = 1))"],["P2DomainEvent","P2DomainEvent_scope_actor_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"actorId\") REFERENCES \"Membership\"(\"workspaceId\", \"userActorId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["P2DomainEvent","P2DomainEvent_scope_project_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"projectId\") REFERENCES \"ProductProject\"(\"workspaceId\", \"projectId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["P2DomainEvent","P2DomainEvent_sourceCommit_check","c",true,"CHECK ((\"sourceCommit\" ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'::text))"],["P2DomainEvent","P2DomainEvent_type_check","c",true,"CHECK ((\"eventType\" = 'truth_revision.activated.v1'::text))"],["ProductProject","ProductProject_active_truth_integrity_trigger","t",true,"TRIGGER DEFERRABLE INITIALLY DEFERRED"],["ProductProject","ProductProject_displayName_check","c",true,"CHECK (((btrim(\"displayName\") <> ''::text) AND (POSITION(('\\000'::text) IN (encode(convert_to(\"displayName\", 'UTF8'::name), 'escape'::text))) = 0)))"],["ProductProject","ProductProject_pkey","p",true,"PRIMARY KEY (\"projectId\")"],["ProductProject","ProductProject_scope_activeTruthRevision_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"projectId\", \"activeTruthRevisionId\") REFERENCES \"ProductTruthRevision\"(\"workspaceId\", \"projectId\", \"productTruthRevisionId\") ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"],["ProductProject","ProductProject_status_archived_check","c",true,"CHECK ((((status = 'ARCHIVED'::\"ProductProjectStatus\") AND (\"archivedAt\" IS NOT NULL)) OR ((status <> 'ARCHIVED'::\"ProductProjectStatus\") AND (\"archivedAt\" IS NULL))))"],["ProductProject","ProductProject_workspaceId_createdByActorId_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"createdByActorId\") REFERENCES \"Membership\"(\"workspaceId\", \"userActorId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["ProductProject","ProductProject_workspaceId_fkey","f",true,"FOREIGN KEY (\"workspaceId\") REFERENCES \"Workspace\"(\"workspaceId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["ProductTruthRevision","ProductTruthRevision_active_truth_integrity_trigger","t",true,"TRIGGER DEFERRABLE INITIALLY DEFERRED"],["ProductTruthRevision","ProductTruthRevision_pkey","p",true,"PRIMARY KEY (\"productTruthRevisionId\")"],["ProductTruthRevision","ProductTruthRevision_revisionNumber_check","c",true,"CHECK ((\"revisionNumber\" > 0))"],["ProductTruthRevision","ProductTruthRevision_scope_creator_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"createdByActorId\") REFERENCES \"Membership\"(\"workspaceId\", \"userActorId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["ProductTruthRevision","ProductTruthRevision_scope_parent_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"projectId\", \"parentRevisionId\") REFERENCES \"ProductTruthRevision\"(\"workspaceId\", \"projectId\", \"productTruthRevisionId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["ProductTruthRevision","ProductTruthRevision_scope_project_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"projectId\") REFERENCES \"ProductProject\"(\"workspaceId\", \"projectId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["ProductTruthRevision","ProductTruthRevision_status_timestamps_check","c",true,"CHECK ((((status = 'DRAFT'::\"ProductTruthRevisionStatus\") AND (\"activatedAt\" IS NULL) AND (\"supersededAt\" IS NULL) AND (\"invalidatedAt\" IS NULL)) OR ((status = 'ACTIVE'::\"ProductTruthRevisionStatus\") AND (\"activatedAt\" IS NOT NULL) AND (\"supersededAt\" IS NULL) AND (\"invalidatedAt\" IS NULL)) OR ((status = 'SUPERSEDED'::\"ProductTruthRevisionStatus\") AND (\"activatedAt\" IS NOT NULL) AND (\"supersededAt\" IS NOT NULL) AND (\"invalidatedAt\" IS NULL)) OR ((status = 'INVALIDATED'::\"ProductTruthRevisionStatus\") AND (\"invalidatedAt\" IS NOT NULL) AND ((\"supersededAt\" IS NULL) OR (\"activatedAt\" IS NOT NULL)))))"],["ProductTruthRevision","ProductTruthRevision_truthBody_check","c",true,"CHECK ((jsonb_typeof(\"truthBody\") = 'object'::text))"],["SourceSnapshot","SourceSnapshot_byteSize_check","c",true,"CHECK (((\"byteSize\" >= 1) AND (\"byteSize\" <= 20971520)))"],["SourceSnapshot","SourceSnapshot_contentDigest_check","c",true,"CHECK ((\"contentDigest\" ~ '^[0-9a-f]{64}$'::text))"],["SourceSnapshot","SourceSnapshot_mediaType_check","c",true,"CHECK ((\"mediaType\" = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text])))"],["SourceSnapshot","SourceSnapshot_pkey","p",true,"PRIMARY KEY (\"sourceSnapshotId\")"],["SourceSnapshot","SourceSnapshot_storageLocator_check","c",true,"CHECK (((btrim(\"storageLocator\") <> ''::text) AND (POSITION(('\\000'::text) IN (encode(convert_to(\"storageLocator\", 'UTF8'::name), 'escape'::text))) = 0)))"],["SourceSnapshot","SourceSnapshot_workspaceId_createdByActorId_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"createdByActorId\") REFERENCES \"Membership\"(\"workspaceId\", \"userActorId\") ON UPDATE CASCADE ON DELETE RESTRICT"],["SourceSnapshot","SourceSnapshot_workspaceId_projectId_fkey","f",true,"FOREIGN KEY (\"workspaceId\", \"projectId\") REFERENCES \"ProductProject\"(\"workspaceId\", \"projectId\") ON UPDATE CASCADE ON DELETE RESTRICT"]]}$catalog$::jsonb THEN
    RAISE EXCEPTION 'P2_S1I_PREDECESSOR_CATALOG_MISMATCH';
  END IF;
  SELECT to_jsonb(p) - 'prosrc' INTO before_guard FROM pg_proc p
    WHERE p.oid='public.p2_guard_asset_task_change()'::regprocedure;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
    WHERE p.oid='public.p2_guard_asset_task_change()'::regprocedure
    AND p.pronargs=0 AND p.prorettype='trigger'::regtype AND l.lanname='plpgsql'
    AND NOT p.prosecdef AND p.provolatile='v' AND p.proconfig IS NULL AND p.proacl IS NULL
    AND pg_get_userbyid(p.proowner)=current_user
    AND replace(p.prosrc, E'\r\n', E'\n')=$old_guard$
BEGIN
    RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Queued AssetTask truth is immutable in this P2 slice';
END;
$old_guard$) THEN
    RAISE EXCEPTION 'P2_S1I_PREDECESSOR_GUARD_MISMATCH';
  END IF;
  SELECT to_jsonb(t) INTO before_trigger FROM pg_trigger t
    WHERE t.tgrelid='public."AssetTask"'::regclass AND t.tgname='AssetTask_guard_change_trigger'
      AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=27
      AND t.tgfoid='public.p2_guard_asset_task_change()'::regprocedure;
  IF before_trigger IS NULL THEN RAISE EXCEPTION 'P2_S1I_PREDECESSOR_TRIGGER_MISMATCH'; END IF;
ALTER TYPE "AssetTaskStatus" ADD VALUE 'RUNNING';
ALTER TYPE "AssetTaskStatus" ADD VALUE 'SUCCEEDED';
ALTER TYPE "AssetTaskStatus" ADD VALUE 'FAILED';
ALTER TYPE "AssetTaskStatus" ADD VALUE 'HARD_BLOCKED';
ALTER TABLE "AssetTask" ADD COLUMN "currentArtifactRevisionId" TEXT, ADD COLUMN "startedAt" TIMESTAMP(3), ADD COLUMN "finishedAt" TIMESTAMP(3), ADD COLUMN "failureCode" TEXT;
CREATE INDEX "AssetTask_scope_currentArtifactRevision_idx" ON "AssetTask" ("workspaceId", "projectId", "currentArtifactRevisionId");
CREATE UNIQUE INDEX "AssetTask_scope_id_truthRevision_key" ON "AssetTask" ("workspaceId", "projectId", "assetTaskId", "truthRevisionId");
CREATE UNIQUE INDEX "AssetTask_scope_id_source_key" ON "AssetTask" ("workspaceId", "projectId", "assetTaskId", "productSourceSnapshotId");
CREATE UNIQUE INDEX "SourceSnapshot_scope_id_contentDigest_key" ON "SourceSnapshot" ("workspaceId", "projectId", "sourceSnapshotId", "contentDigest");
ALTER TABLE "P2DomainEvent" DROP CONSTRAINT "P2DomainEvent_type_check", DROP CONSTRAINT "P2DomainEvent_body_check", ADD CONSTRAINT "P2DomainEvent_type_check" CHECK ("eventType" IN (
  'truth_revision.activated.v1',
  'generation_attempt.started.v1',
  'artifact_revision.created.v1'
)), ADD CONSTRAINT "P2DomainEvent_body_check" CHECK (
  CASE "eventType"
    WHEN 'truth_revision.activated.v1' THEN
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
    WHEN 'generation_attempt.started.v1' THEN
      CASE WHEN jsonb_typeof("eventBody") = 'object' THEN (
        "eventBody" ?& ARRAY[
          'assetTaskId', 'autoRedoOrdinal', 'generationAttemptId',
          'model', 'provider', 'trigger'
        ]::text[]
        AND "eventBody" - ARRAY[
          'assetTaskId', 'autoRedoOrdinal', 'generationAttemptId',
          'model', 'provider', 'trigger'
        ]::text[] = '{}'::jsonb
        AND jsonb_typeof("eventBody" -> 'assetTaskId') = 'string'
        AND jsonb_typeof("eventBody" -> 'autoRedoOrdinal') = 'number'
        AND jsonb_typeof("eventBody" -> 'generationAttemptId') = 'string'
        AND jsonb_typeof("eventBody" -> 'model') = 'string'
        AND jsonb_typeof("eventBody" -> 'provider') = 'string'
        AND jsonb_typeof("eventBody" -> 'trigger') = 'string'
        AND "eventBody" -> 'autoRedoOrdinal' = '0'::jsonb
        AND "eventBody" ->> 'model' = 'INTERNAL_TEST_FIXED_PNG_1X1_V1'
        AND "eventBody" ->> 'provider' = 'INTERNAL_TEST'
        AND "eventBody" ->> 'trigger' = 'INITIAL'
      ) IS TRUE ELSE FALSE END
    WHEN 'artifact_revision.created.v1' THEN
      CASE WHEN jsonb_typeof("eventBody") = 'object' THEN (
        "eventBody" ?& ARRAY[
          'artifactRevisionId', 'assetTaskId', 'contentDigest', 'kind', 'origin'
        ]::text[]
        AND "eventBody" - ARRAY[
          'artifactRevisionId', 'assetTaskId', 'contentDigest', 'kind', 'origin'
        ]::text[] = '{}'::jsonb
        AND jsonb_typeof("eventBody" -> 'artifactRevisionId') = 'string'
        AND jsonb_typeof("eventBody" -> 'assetTaskId') = 'string'
        AND jsonb_typeof("eventBody" -> 'contentDigest') = 'string'
        AND jsonb_typeof("eventBody" -> 'kind') = 'string'
        AND jsonb_typeof("eventBody" -> 'origin') = 'string'
        AND "eventBody" ->> 'contentDigest' =
          '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460'
        AND "eventBody" ->> 'kind' = 'IMAGE'
        AND "eventBody" ->> 'origin' = 'SYSTEM_LAYOUT'
      ) IS TRUE ELSE FALSE END
    ELSE FALSE
  END
);
CREATE OR REPLACE FUNCTION public.p2_guard_asset_task_change() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER VOLATILE AS $guard$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='AssetTask delete forbidden'; END IF;
 IF (to_jsonb(NEW) - ARRAY['status','currentArtifactRevisionId','startedAt','finishedAt','failureCode']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','currentArtifactRevisionId','startedAt','finishedAt','failureCode']) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='AssetTask provenance immutable'; END IF;
 IF OLD.status::text='QUEUED' AND NEW.status::text='RUNNING' THEN RETURN NEW;
 ELSIF OLD.status::text='RUNNING' AND NEW.status::text='SUCCEEDED' AND NEW."startedAt" IS NOT DISTINCT FROM OLD."startedAt" THEN RETURN NEW;
 ELSIF OLD.status::text='RUNNING' AND NEW.status::text='FAILED' AND NEW."startedAt" IS NOT DISTINCT FROM OLD."startedAt" THEN RETURN NEW;
 ELSIF OLD.status::text='RUNNING' AND NEW.status::text='HARD_BLOCKED' AND NEW."startedAt" IS NOT DISTINCT FROM OLD."startedAt" THEN RETURN NEW;
 END IF;
 RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='AssetTask transition forbidden';
END;
$guard$;
CREATE TYPE "GenerationAttemptTrigger" AS ENUM ('INITIAL', 'AUTO_REDO', 'USER_REDO');
-- ROLLBACK_PROBE_INJECTION_POINT_P2_S1I_COMPAT_DDL_V1
CREATE TYPE "GenerationAttemptProvider" AS ENUM ('INTERNAL_TEST');
CREATE TYPE "GenerationAttemptExecutorKind" AS ENUM ('INTERNAL_TEST_PNG_V1');
CREATE TYPE "GenerationAttemptStatus" AS ENUM ('QUEUED', 'SUBMITTING', 'SUBMITTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'AMBIGUOUS');
CREATE TYPE "ArtifactLifecycleStatus" AS ENUM ('ACTIVE', 'DELETED');
CREATE TYPE "ArtifactRevisionOrigin" AS ENUM ('PROVIDER', 'SYSTEM_LAYOUT', 'USER_EDIT', 'PLATFORM_DERIVATION');
CREATE TYPE "ArtifactRevisionStatus" AS ENUM ('CANDIDATE', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'REVOKED');
CREATE TYPE "P2SourceLineageRole" AS ENUM ('PRODUCT_SOURCE');
CREATE TYPE "P2SourceLineageStatus" AS ENUM ('ACTIVE', 'INVALIDATED');
CREATE TABLE "GenerationAttempt" (
  "generationAttemptId" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "assetTaskId" TEXT NOT NULL,
  "trigger" "GenerationAttemptTrigger" NOT NULL DEFAULT 'INITIAL',
  "autoRedoOrdinal" INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT NOT NULL,
  "inputFingerprint" TEXT NOT NULL,
  "truthRevisionId" TEXT NOT NULL,
  "brandKitRevisionId" TEXT,
  "visualPlanId" TEXT,
  "provider" "GenerationAttemptProvider" NOT NULL DEFAULT 'INTERNAL_TEST',
  "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "executorKind" "GenerationAttemptExecutorKind" NOT NULL,
  "status" "GenerationAttemptStatus" NOT NULL,
  "transportRetryCount" INTEGER NOT NULL DEFAULT 0,
  "providerRequestId" TEXT,
  "errorCode" TEXT,
  "usageBody" JSONB,
  "costBody" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "GenerationAttemptSourceLink" (
  "linkId" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "assetTaskId" TEXT NOT NULL,
  "generationAttemptId" TEXT NOT NULL,
  "sourceSnapshotId" TEXT NOT NULL,
  "inputRole" "P2SourceLineageRole" NOT NULL,
  "inputOrder" INTEGER NOT NULL,
  "contentDigestAtBinding" TEXT NOT NULL,
  "linkStatus" "P2SourceLineageStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByActorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Artifact" (
  "artifactId" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "assetTaskId" TEXT NOT NULL,
  "assetClass" "AssetClass" NOT NULL DEFAULT 'IMAGE',
  "lifecycleStatus" "ArtifactLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByActorId" TEXT NOT NULL,
  "selectedArtifactRevisionId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "deletedByActorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ArtifactRevision" (
  "artifactRevisionId" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "assetTaskId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL DEFAULT 1,
  "kind" "AssetClass" NOT NULL DEFAULT 'IMAGE',
  "origin" "ArtifactRevisionOrigin" NOT NULL DEFAULT 'SYSTEM_LAYOUT',
  "truthRevisionId" TEXT NOT NULL,
  "generationAttemptId" TEXT,
  "editableDocumentId" TEXT,
  "parentArtifactRevisionId" TEXT,
  "brandKitRevisionId" TEXT,
  "visualPlanId" TEXT,
  "inputBindingDigest" TEXT NOT NULL,
  "contentDigest" TEXT NOT NULL,
  "storageLocator" TEXT,
  "textBody" TEXT,
  "status" "ArtifactRevisionStatus" NOT NULL DEFAULT 'CANDIDATE',
  "mediaType" TEXT NOT NULL DEFAULT 'image/png',
  "byteSize" BIGINT NOT NULL DEFAULT 68,
  "width" INTEGER NOT NULL DEFAULT 1,
  "height" INTEGER NOT NULL DEFAULT 1,
  "createdByActorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ArtifactRevisionSourceLink" (
  "linkId" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "assetTaskId" TEXT NOT NULL,
  "artifactRevisionId" TEXT NOT NULL,
  "sourceSnapshotId" TEXT NOT NULL,
  "sourceRole" "P2SourceLineageRole" NOT NULL,
  "inputOrder" INTEGER NOT NULL,
  "contentDigestAtBinding" TEXT NOT NULL,
  "inheritedFromAttemptId" TEXT NOT NULL,
  "linkStatus" "P2SourceLineageStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByActorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GenerationAttempt_scope_id_key" ON "GenerationAttempt" ("workspaceId", "projectId", "generationAttemptId");
CREATE UNIQUE INDEX "GenerationAttempt_scope_task_id_key" ON "GenerationAttempt" ("workspaceId", "projectId", "assetTaskId", "generationAttemptId");
CREATE UNIQUE INDEX "GenerationAttempt_scope_task_truth_id_key" ON "GenerationAttempt" ("workspaceId", "projectId", "assetTaskId", "truthRevisionId", "generationAttemptId");
CREATE UNIQUE INDEX "GenerationAttempt_task_trigger_ordinal_key" ON "GenerationAttempt" ("workspaceId", "projectId", "assetTaskId", "trigger", "autoRedoOrdinal");
CREATE UNIQUE INDEX "GenerationAttempt_idempotency_key" ON "GenerationAttempt" ("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "GenerationAttemptSourceLink_attempt_source_role_key" ON "GenerationAttemptSourceLink" ("workspaceId", "projectId", "generationAttemptId", "sourceSnapshotId", "inputRole");
CREATE UNIQUE INDEX "GenerationAttemptSourceLink_attempt_inputOrder_key" ON "GenerationAttemptSourceLink" ("workspaceId", "projectId", "generationAttemptId", "inputOrder");
CREATE UNIQUE INDEX "GenerationAttemptSourceLink_inheritance_key" ON "GenerationAttemptSourceLink" ("workspaceId", "projectId", "generationAttemptId", "sourceSnapshotId", "inputRole", "inputOrder", "contentDigestAtBinding");
CREATE UNIQUE INDEX "Artifact_scope_id_key" ON "Artifact" ("workspaceId", "projectId", "artifactId");
CREATE UNIQUE INDEX "Artifact_scope_id_task_key" ON "Artifact" ("workspaceId", "projectId", "artifactId", "assetTaskId");
CREATE UNIQUE INDEX "Artifact_task_key" ON "Artifact" ("workspaceId", "projectId", "assetTaskId");
CREATE UNIQUE INDEX "Artifact_scope_task_selected_key" ON "Artifact" ("workspaceId", "projectId", "assetTaskId", "selectedArtifactRevisionId");
CREATE UNIQUE INDEX "ArtifactRevision_scope_id_key" ON "ArtifactRevision" ("workspaceId", "projectId", "artifactRevisionId");
CREATE UNIQUE INDEX "ArtifactRevision_scope_artifact_id_key" ON "ArtifactRevision" ("workspaceId", "projectId", "artifactId", "artifactRevisionId");
CREATE UNIQUE INDEX "ArtifactRevision_scope_artifact_task_id_key" ON "ArtifactRevision" ("workspaceId", "projectId", "artifactId", "assetTaskId", "artifactRevisionId");
CREATE UNIQUE INDEX "ArtifactRevision_scope_task_id_key" ON "ArtifactRevision" ("workspaceId", "projectId", "assetTaskId", "artifactRevisionId");
CREATE UNIQUE INDEX "ArtifactRevision_scope_task_id_attempt_key" ON "ArtifactRevision" ("workspaceId", "projectId", "assetTaskId", "artifactRevisionId", "generationAttemptId");
CREATE UNIQUE INDEX "ArtifactRevision_artifact_revisionNumber_key" ON "ArtifactRevision" ("workspaceId", "projectId", "artifactId", "revisionNumber");
CREATE UNIQUE INDEX "ArtifactRevision_generationAttempt_key" ON "ArtifactRevision" ("workspaceId", "projectId", "generationAttemptId");
CREATE UNIQUE INDEX "ArtifactRevisionSourceLink_revision_source_role_key" ON "ArtifactRevisionSourceLink" ("workspaceId", "projectId", "artifactRevisionId", "sourceSnapshotId", "sourceRole");
CREATE UNIQUE INDEX "ArtifactRevisionSourceLink_revision_inputOrder_key" ON "ArtifactRevisionSourceLink" ("workspaceId", "projectId", "artifactRevisionId", "inputOrder");
CREATE INDEX "GenerationAttempt_scope_task_status_createdAt_idx" ON "GenerationAttempt" ("workspaceId", "projectId", "assetTaskId", "status", "createdAt");
CREATE INDEX "GenerationAttempt_scope_truthRevision_idx" ON "GenerationAttempt" ("workspaceId", "projectId", "truthRevisionId");
CREATE INDEX "GenerationAttemptSourceLink_scope_source_idx" ON "GenerationAttemptSourceLink" ("workspaceId", "projectId", "sourceSnapshotId");
CREATE INDEX "GenerationAttemptSourceLink_createdByActorId_idx" ON "GenerationAttemptSourceLink" ("createdByActorId");
CREATE INDEX "Artifact_scope_lifecycle_createdAt_idx" ON "Artifact" ("workspaceId", "projectId", "lifecycleStatus", "createdAt");
CREATE INDEX "Artifact_createdByActorId_idx" ON "Artifact" ("createdByActorId");
CREATE INDEX "Artifact_deletedByActorId_idx" ON "Artifact" ("deletedByActorId");
CREATE INDEX "ArtifactRevision_scope_task_status_createdAt_idx" ON "ArtifactRevision" ("workspaceId", "projectId", "assetTaskId", "status", "createdAt");
CREATE INDEX "ArtifactRevision_scope_truthRevision_idx" ON "ArtifactRevision" ("workspaceId", "projectId", "truthRevisionId");
CREATE INDEX "ArtifactRevision_scope_contentDigest_idx" ON "ArtifactRevision" ("workspaceId", "projectId", "contentDigest");
CREATE INDEX "ArtifactRevision_parent_idx" ON "ArtifactRevision" ("workspaceId", "projectId", "parentArtifactRevisionId");
CREATE INDEX "ArtifactRevisionSourceLink_scope_source_idx" ON "ArtifactRevisionSourceLink" ("workspaceId", "projectId", "sourceSnapshotId");
CREATE INDEX "ArtifactRevisionSourceLink_createdByActorId_idx" ON "ArtifactRevisionSourceLink" ("createdByActorId");
ALTER TABLE "GenerationAttempt" ADD CONSTRAINT "GenerationAttempt_scope_task_truth_fkey" FOREIGN KEY ("workspaceId", "projectId", "assetTaskId", "truthRevisionId") REFERENCES "AssetTask" ("workspaceId", "projectId", "assetTaskId", "truthRevisionId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "GenerationAttemptSourceLink" ADD CONSTRAINT "GenerationAttemptSourceLink_scope_attempt_fkey" FOREIGN KEY ("workspaceId", "projectId", "assetTaskId", "generationAttemptId") REFERENCES "GenerationAttempt" ("workspaceId", "projectId", "assetTaskId", "generationAttemptId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "GenerationAttemptSourceLink" ADD CONSTRAINT "GenerationAttemptSourceLink_scope_task_source_fkey" FOREIGN KEY ("workspaceId", "projectId", "assetTaskId", "sourceSnapshotId") REFERENCES "AssetTask" ("workspaceId", "projectId", "assetTaskId", "productSourceSnapshotId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "GenerationAttemptSourceLink" ADD CONSTRAINT "GenerationAttemptSourceLink_scope_source_digest_fkey" FOREIGN KEY ("workspaceId", "projectId", "sourceSnapshotId", "contentDigestAtBinding") REFERENCES "SourceSnapshot" ("workspaceId", "projectId", "sourceSnapshotId", "contentDigest") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "GenerationAttemptSourceLink" ADD CONSTRAINT "GenerationAttemptSourceLink_scope_creator_fkey" FOREIGN KEY ("workspaceId", "createdByActorId") REFERENCES "Membership" ("workspaceId", "userActorId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_scope_task_fkey" FOREIGN KEY ("workspaceId", "projectId", "assetTaskId") REFERENCES "AssetTask" ("workspaceId", "projectId", "assetTaskId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_scope_creator_fkey" FOREIGN KEY ("workspaceId", "createdByActorId") REFERENCES "Membership" ("workspaceId", "userActorId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_scope_deletedBy_fkey" FOREIGN KEY ("workspaceId", "deletedByActorId") REFERENCES "Membership" ("workspaceId", "userActorId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "ArtifactRevision" ADD CONSTRAINT "ArtifactRevision_scope_artifact_task_fkey" FOREIGN KEY ("workspaceId", "projectId", "artifactId", "assetTaskId") REFERENCES "Artifact" ("workspaceId", "projectId", "artifactId", "assetTaskId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "ArtifactRevision" ADD CONSTRAINT "ArtifactRevision_scope_attempt_fkey" FOREIGN KEY ("workspaceId", "projectId", "assetTaskId", "truthRevisionId", "generationAttemptId") REFERENCES "GenerationAttempt" ("workspaceId", "projectId", "assetTaskId", "truthRevisionId", "generationAttemptId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "ArtifactRevision" ADD CONSTRAINT "ArtifactRevision_parent_same_artifact_fkey" FOREIGN KEY ("workspaceId", "projectId", "artifactId", "parentArtifactRevisionId") REFERENCES "ArtifactRevision" ("workspaceId", "projectId", "artifactId", "artifactRevisionId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "ArtifactRevision" ADD CONSTRAINT "ArtifactRevision_scope_creator_fkey" FOREIGN KEY ("workspaceId", "createdByActorId") REFERENCES "Membership" ("workspaceId", "userActorId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "ArtifactRevisionSourceLink" ADD CONSTRAINT "ArtifactRevisionSourceLink_scope_revision_attempt_fkey" FOREIGN KEY ("workspaceId", "projectId", "assetTaskId", "artifactRevisionId", "inheritedFromAttemptId") REFERENCES "ArtifactRevision" ("workspaceId", "projectId", "assetTaskId", "artifactRevisionId", "generationAttemptId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "ArtifactRevisionSourceLink" ADD CONSTRAINT "ArtifactRevisionSourceLink_inherited_binding_fkey" FOREIGN KEY ("workspaceId", "projectId", "inheritedFromAttemptId", "sourceSnapshotId", "sourceRole", "inputOrder", "contentDigestAtBinding") REFERENCES "GenerationAttemptSourceLink" ("workspaceId", "projectId", "generationAttemptId", "sourceSnapshotId", "inputRole", "inputOrder", "contentDigestAtBinding") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "ArtifactRevisionSourceLink" ADD CONSTRAINT "ArtifactRevisionSourceLink_scope_source_digest_fkey" FOREIGN KEY ("workspaceId", "projectId", "sourceSnapshotId", "contentDigestAtBinding") REFERENCES "SourceSnapshot" ("workspaceId", "projectId", "sourceSnapshotId", "contentDigest") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "ArtifactRevisionSourceLink" ADD CONSTRAINT "ArtifactRevisionSourceLink_scope_creator_fkey" FOREIGN KEY ("workspaceId", "createdByActorId") REFERENCES "Membership" ("workspaceId", "userActorId") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_selected_revision_fkey" FOREIGN KEY ("workspaceId", "projectId", "artifactId", "selectedArtifactRevisionId") REFERENCES "ArtifactRevision" ("workspaceId", "projectId", "artifactId", "artifactRevisionId") ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "AssetTask" ADD CONSTRAINT "AssetTask_current_artifact_revision_direct_fkey" FOREIGN KEY ("workspaceId", "projectId", "assetTaskId", "currentArtifactRevisionId") REFERENCES "ArtifactRevision" ("workspaceId", "projectId", "assetTaskId", "artifactRevisionId") ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "AssetTask" ADD CONSTRAINT "AssetTask_current_selected_equivalence_fkey" FOREIGN KEY ("workspaceId", "projectId", "assetTaskId", "currentArtifactRevisionId") REFERENCES "Artifact" ("workspaceId", "projectId", "assetTaskId", "selectedArtifactRevisionId") ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "GenerationAttempt" ADD CONSTRAINT "GenerationAttempt_identifiers_check" CHECK (("generationAttemptId" IS NOT NULL AND btrim("generationAttemptId")<>'' AND "generationAttemptId"=btrim("generationAttemptId") AND "workspaceId" IS NOT NULL AND btrim("workspaceId")<>'' AND "workspaceId"=btrim("workspaceId") AND "projectId" IS NOT NULL AND btrim("projectId")<>'' AND "projectId"=btrim("projectId") AND "assetTaskId" IS NOT NULL AND btrim("assetTaskId")<>'' AND "assetTaskId"=btrim("assetTaskId") AND "idempotencyKey" IS NOT NULL AND btrim("idempotencyKey")<>'' AND "idempotencyKey"=btrim("idempotencyKey") AND "inputFingerprint" IS NOT NULL AND btrim("inputFingerprint")<>'' AND "inputFingerprint"=btrim("inputFingerprint") AND "truthRevisionId" IS NOT NULL AND btrim("truthRevisionId")<>'' AND "truthRevisionId"=btrim("truthRevisionId") AND "model" IS NOT NULL AND btrim("model")<>'' AND "model"=btrim("model") AND "promptVersion" IS NOT NULL AND btrim("promptVersion")<>'' AND "promptVersion"=btrim("promptVersion") AND "inputFingerprint" ~ '^[0-9a-f]{64}$') IS TRUE);
ALTER TABLE "GenerationAttempt" ADD CONSTRAINT "GenerationAttempt_p2_contract_check" CHECK ((trigger='INITIAL' AND "autoRedoOrdinal"=0 AND provider='INTERNAL_TEST' AND model='INTERNAL_TEST_FIXED_PNG_1X1_V1' AND "promptVersion"='INTERNAL_TEST_NO_PROMPT_V1' AND "executorKind"='INTERNAL_TEST_PNG_V1' AND "brandKitRevisionId" IS NULL AND "visualPlanId" IS NULL AND "providerRequestId" IS NULL AND "usageBody" IS NULL AND "costBody" IS NULL AND "transportRetryCount"=0) IS TRUE);
ALTER TABLE "GenerationAttempt" ADD CONSTRAINT "GenerationAttempt_state_check" CHECK (((status='RUNNING' AND "startedAt" IS NOT NULL AND "finishedAt" IS NULL AND "errorCode" IS NULL) OR (status='SUCCEEDED' AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "finishedAt">="startedAt" AND "errorCode" IS NULL) OR (status='FAILED' AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "finishedAt">="startedAt" AND "errorCode" IN ('INTERNAL_TEST_EXECUTOR_FAILED','INTERNAL_TEST_OUTPUT_INVALID','OBJECT_WRITE_FAILED_COMPENSATED','FINALIZE_FAILED_COMPENSATED')) OR (status='AMBIGUOUS' AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "finishedAt">="startedAt" AND "errorCode" IN ('OBJECT_WRITE_FAILED_COMPENSATION_FAILED','FINALIZE_FAILED_COMPENSATION_FAILED'))) IS TRUE);
ALTER TABLE "GenerationAttemptSourceLink" ADD CONSTRAINT "GenerationAttemptSourceLink_p2_contract_check" CHECK (("linkId" IS NOT NULL AND btrim("linkId")<>'' AND "linkId"=btrim("linkId") AND "workspaceId" IS NOT NULL AND btrim("workspaceId")<>'' AND "workspaceId"=btrim("workspaceId") AND "projectId" IS NOT NULL AND btrim("projectId")<>'' AND "projectId"=btrim("projectId") AND "assetTaskId" IS NOT NULL AND btrim("assetTaskId")<>'' AND "assetTaskId"=btrim("assetTaskId") AND "generationAttemptId" IS NOT NULL AND btrim("generationAttemptId")<>'' AND "generationAttemptId"=btrim("generationAttemptId") AND "sourceSnapshotId" IS NOT NULL AND btrim("sourceSnapshotId")<>'' AND "sourceSnapshotId"=btrim("sourceSnapshotId") AND "contentDigestAtBinding" IS NOT NULL AND btrim("contentDigestAtBinding")<>'' AND "contentDigestAtBinding"=btrim("contentDigestAtBinding") AND "createdByActorId" IS NOT NULL AND btrim("createdByActorId")<>'' AND "createdByActorId"=btrim("createdByActorId") AND "inputRole"='PRODUCT_SOURCE' AND "inputOrder"=0 AND "linkStatus"='ACTIVE' AND "contentDigestAtBinding" ~ '^[0-9a-f]{64}$') IS TRUE);
ALTER TABLE "ArtifactRevisionSourceLink" ADD CONSTRAINT "ArtifactRevisionSourceLink_p2_contract_check" CHECK (("linkId" IS NOT NULL AND btrim("linkId")<>'' AND "linkId"=btrim("linkId") AND "workspaceId" IS NOT NULL AND btrim("workspaceId")<>'' AND "workspaceId"=btrim("workspaceId") AND "projectId" IS NOT NULL AND btrim("projectId")<>'' AND "projectId"=btrim("projectId") AND "assetTaskId" IS NOT NULL AND btrim("assetTaskId")<>'' AND "assetTaskId"=btrim("assetTaskId") AND "artifactRevisionId" IS NOT NULL AND btrim("artifactRevisionId")<>'' AND "artifactRevisionId"=btrim("artifactRevisionId") AND "sourceSnapshotId" IS NOT NULL AND btrim("sourceSnapshotId")<>'' AND "sourceSnapshotId"=btrim("sourceSnapshotId") AND "contentDigestAtBinding" IS NOT NULL AND btrim("contentDigestAtBinding")<>'' AND "contentDigestAtBinding"=btrim("contentDigestAtBinding") AND "inheritedFromAttemptId" IS NOT NULL AND btrim("inheritedFromAttemptId")<>'' AND "inheritedFromAttemptId"=btrim("inheritedFromAttemptId") AND "createdByActorId" IS NOT NULL AND btrim("createdByActorId")<>'' AND "createdByActorId"=btrim("createdByActorId") AND "sourceRole"='PRODUCT_SOURCE' AND "inputOrder"=0 AND "linkStatus"='ACTIVE' AND "contentDigestAtBinding" ~ '^[0-9a-f]{64}$') IS TRUE);
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_p2_contract_check" CHECK (("artifactId" IS NOT NULL AND btrim("artifactId")<>'' AND "artifactId"=btrim("artifactId") AND "workspaceId" IS NOT NULL AND btrim("workspaceId")<>'' AND "workspaceId"=btrim("workspaceId") AND "projectId" IS NOT NULL AND btrim("projectId")<>'' AND "projectId"=btrim("projectId") AND "assetTaskId" IS NOT NULL AND btrim("assetTaskId")<>'' AND "assetTaskId"=btrim("assetTaskId") AND "createdByActorId" IS NOT NULL AND btrim("createdByActorId")<>'' AND "createdByActorId"=btrim("createdByActorId") AND "assetClass"='IMAGE' AND ("selectedArtifactRevisionId" IS NULL OR ("selectedArtifactRevisionId" IS NOT NULL AND btrim("selectedArtifactRevisionId")<>'' AND "selectedArtifactRevisionId"=btrim("selectedArtifactRevisionId"))) AND (("lifecycleStatus"='ACTIVE' AND "deletedAt" IS NULL AND "deletedByActorId" IS NULL) OR ("lifecycleStatus"='DELETED' AND "deletedAt" IS NOT NULL AND "deletedByActorId" IS NOT NULL AND btrim("deletedByActorId")<>'' AND "deletedByActorId"=btrim("deletedByActorId")))) IS TRUE);
ALTER TABLE "ArtifactRevision" ADD CONSTRAINT "ArtifactRevision_content_representation_check" CHECK (((("storageLocator" IS NOT NULL AND btrim("storageLocator")<>'' AND "storageLocator"=btrim("storageLocator")) AND "textBody" IS NULL) OR (("textBody" IS NOT NULL AND btrim("textBody")<>'' AND "textBody"=btrim("textBody")) AND "storageLocator" IS NULL)) IS TRUE);
ALTER TABLE "ArtifactRevision" ADD CONSTRAINT "ArtifactRevision_p2_contract_check" CHECK (("artifactRevisionId" IS NOT NULL AND btrim("artifactRevisionId")<>'' AND "artifactRevisionId"=btrim("artifactRevisionId") AND "workspaceId" IS NOT NULL AND btrim("workspaceId")<>'' AND "workspaceId"=btrim("workspaceId") AND "projectId" IS NOT NULL AND btrim("projectId")<>'' AND "projectId"=btrim("projectId") AND "artifactId" IS NOT NULL AND btrim("artifactId")<>'' AND "artifactId"=btrim("artifactId") AND "assetTaskId" IS NOT NULL AND btrim("assetTaskId")<>'' AND "assetTaskId"=btrim("assetTaskId") AND "truthRevisionId" IS NOT NULL AND btrim("truthRevisionId")<>'' AND "truthRevisionId"=btrim("truthRevisionId") AND "inputBindingDigest" IS NOT NULL AND btrim("inputBindingDigest")<>'' AND "inputBindingDigest"=btrim("inputBindingDigest") AND "contentDigest" IS NOT NULL AND btrim("contentDigest")<>'' AND "contentDigest"=btrim("contentDigest") AND "mediaType" IS NOT NULL AND btrim("mediaType")<>'' AND "mediaType"=btrim("mediaType") AND "generationAttemptId" IS NOT NULL AND btrim("generationAttemptId")<>'' AND "generationAttemptId"=btrim("generationAttemptId") AND "storageLocator" IS NOT NULL AND btrim("storageLocator")<>'' AND "storageLocator"=btrim("storageLocator") AND "textBody" IS NULL AND "editableDocumentId" IS NULL AND "parentArtifactRevisionId" IS NULL AND "brandKitRevisionId" IS NULL AND "visualPlanId" IS NULL AND "createdByActorId" IS NULL AND "revisionNumber"=1 AND kind='IMAGE' AND origin='SYSTEM_LAYOUT' AND status='CANDIDATE' AND "mediaType"='image/png' AND "byteSize"=68 AND width=1 AND height=1 AND "inputBindingDigest" ~ '^[0-9a-f]{64}$' AND "contentDigest"='431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460') IS TRUE);
ALTER TABLE "AssetTask" ADD CONSTRAINT "AssetTask_currentArtifactRevisionId_check" CHECK (("currentArtifactRevisionId" IS NULL OR ("currentArtifactRevisionId" IS NOT NULL AND btrim("currentArtifactRevisionId")<>'' AND "currentArtifactRevisionId"=btrim("currentArtifactRevisionId"))) IS TRUE);
ALTER TABLE "AssetTask" ADD CONSTRAINT "AssetTask_state_check" CHECK (((status::text='QUEUED' AND "startedAt" IS NULL AND "finishedAt" IS NULL AND "failureCode" IS NULL AND "currentArtifactRevisionId" IS NULL) OR (status::text='RUNNING' AND "startedAt" IS NOT NULL AND "finishedAt" IS NULL AND "failureCode" IS NULL AND "currentArtifactRevisionId" IS NULL) OR (status::text='SUCCEEDED' AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "finishedAt">="startedAt" AND "failureCode" IS NULL AND "currentArtifactRevisionId" IS NOT NULL) OR (status::text IN ('FAILED','HARD_BLOCKED') AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "finishedAt">="startedAt" AND "currentArtifactRevisionId" IS NULL)) IS TRUE);
ALTER TABLE "AssetTask" ADD CONSTRAINT "AssetTask_failureCode_check" CHECK (((status::text IN ('QUEUED','RUNNING','SUCCEEDED') AND "failureCode" IS NULL) OR (status::text='FAILED' AND "failureCode" IN ('INTERNAL_TEST_EXECUTOR_FAILED','INTERNAL_TEST_OUTPUT_INVALID','OBJECT_WRITE_FAILED_COMPENSATED','FINALIZE_FAILED_COMPENSATED')) OR (status::text='HARD_BLOCKED' AND "failureCode" IN ('OBJECT_WRITE_FAILED_COMPENSATION_FAILED','FINALIZE_FAILED_COMPENSATION_FAILED'))) IS TRUE);
CREATE FUNCTION public.p2_guard_generation_attempt_change() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER VOLATILE AS $guard$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Attempt delete forbidden'; END IF;
 IF (to_jsonb(NEW) - ARRAY['status','finishedAt','errorCode']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','finishedAt','errorCode']) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Attempt provenance immutable'; END IF;
 IF OLD.status='RUNNING' AND NEW.status='SUCCEEDED' AND NEW."errorCode" IS NULL THEN RETURN NEW;
 ELSIF OLD.status='RUNNING' AND NEW.status='FAILED' AND NEW."errorCode" IN ('INTERNAL_TEST_EXECUTOR_FAILED','INTERNAL_TEST_OUTPUT_INVALID','OBJECT_WRITE_FAILED_COMPENSATED','FINALIZE_FAILED_COMPENSATED') THEN RETURN NEW;
 ELSIF OLD.status='RUNNING' AND NEW.status='AMBIGUOUS' AND NEW."errorCode" IN ('OBJECT_WRITE_FAILED_COMPENSATION_FAILED','FINALIZE_FAILED_COMPENSATION_FAILED') THEN RETURN NEW;
 END IF;
 RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Attempt transition forbidden';
END;
$guard$;
CREATE FUNCTION public.p2_guard_artifact_change() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER VOLATILE AS $guard$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Artifact delete forbidden'; END IF;
 IF (to_jsonb(NEW) - ARRAY['selectedArtifactRevisionId','lifecycleStatus','deletedAt','deletedByActorId']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['selectedArtifactRevisionId','lifecycleStatus','deletedAt','deletedByActorId']) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Artifact provenance immutable'; END IF;
 IF OLD."lifecycleStatus"='ACTIVE' AND NEW."lifecycleStatus"='ACTIVE' AND OLD."selectedArtifactRevisionId" IS NULL AND NEW."selectedArtifactRevisionId" IS NOT NULL AND NEW."deletedAt" IS NULL AND NEW."deletedByActorId" IS NULL THEN RETURN NEW;
 ELSIF OLD."lifecycleStatus"='ACTIVE' AND NEW."lifecycleStatus"='DELETED' AND NEW."selectedArtifactRevisionId" IS NOT DISTINCT FROM OLD."selectedArtifactRevisionId" AND NEW."deletedAt" IS NOT NULL AND NEW."deletedByActorId" IS NOT NULL THEN RETURN NEW;
 END IF;
 RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Artifact transition forbidden';
END;
$guard$;
CREATE FUNCTION public.p2_reject_artifact_revision_change() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER VOLATILE AS $guard$ BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Lineage is immutable'; END; $guard$;
CREATE TRIGGER "ArtifactRevision_immutable_trigger" BEFORE UPDATE OR DELETE ON "ArtifactRevision" FOR EACH ROW EXECUTE FUNCTION public.p2_reject_artifact_revision_change();
CREATE FUNCTION public.p2_reject_generation_attempt_source_link_change() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER VOLATILE AS $guard$ BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Lineage is immutable'; END; $guard$;
CREATE TRIGGER "GenerationAttemptSourceLink_immutable_trigger" BEFORE UPDATE OR DELETE ON "GenerationAttemptSourceLink" FOR EACH ROW EXECUTE FUNCTION public.p2_reject_generation_attempt_source_link_change();
CREATE FUNCTION public.p2_reject_artifact_revision_source_link_change() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER VOLATILE AS $guard$ BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Lineage is immutable'; END; $guard$;
CREATE TRIGGER "ArtifactRevisionSourceLink_immutable_trigger" BEFORE UPDATE OR DELETE ON "ArtifactRevisionSourceLink" FOR EACH ROW EXECUTE FUNCTION public.p2_reject_artifact_revision_source_link_change();
CREATE TRIGGER "GenerationAttempt_state_machine_trigger" BEFORE UPDATE OR DELETE ON "GenerationAttempt" FOR EACH ROW EXECUTE FUNCTION public.p2_guard_generation_attempt_change();
CREATE TRIGGER "Artifact_guard_change_trigger" BEFORE UPDATE OR DELETE ON "Artifact" FOR EACH ROW EXECUTE FUNCTION public.p2_guard_artifact_change();
IF before_guard IS DISTINCT FROM (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid='public.p2_guard_asset_task_change()'::regprocedure) OR before_trigger IS DISTINCT FROM (SELECT to_jsonb(t) FROM pg_trigger t WHERE t.tgrelid='public."AssetTask"'::regclass AND t.tgname='AssetTask_guard_change_trigger') THEN RAISE EXCEPTION 'P2_S1I_GUARD_IDENTITY_CHANGED'; END IF;
END;
$migration$;
COMMIT;
