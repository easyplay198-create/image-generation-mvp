# V5 P2 Draft-only entry governance

Status: frozen task-scoped governance; this change only adds the S1E authentication entry profile and does not implement authentication.

## Decision

The repository default remains `P2_LOCKED`. A future P2 task may proceed only when a dedicated human-owner Issue, approval, task branch, and initially Draft PR satisfy all controls below. The machine-recognized task-scoped states are ordinary `P2_DRAFT_ONLY` and the narrower `P2_AUTH_DRAFT_ONLY`.

`P2_DRAFT_ONLY` means:

- one exact, owner-approved P2 vertical slice may be implemented on one exact pre-approved branch;
- the PR must remain Draft until human semantic review;
- GitHub automated repair, Ready, auto-merge, and merge remain disabled;
- the approved Issue body may authorize at most five worktree-local corrections before the first published implementation commit and at most two human-orchestrated corrections after the initially Draft PR exists;
- every correction stays in the same Issue, worktree, branch and PR, within the exact allowlist, dependencies, migration count and frozen semantics, and reruns all fixed gates;
- CI success is engineering evidence only and does not establish semantic acceptance;
- human semantic review and a separate human merge decision remain mandatory.

The local and published correction budgets do not change `maxRepairRounds: 0`, do not create a GitHub writer, and do not permit automatic dispatch. A deterministic environment-preparation failure may resume in the same task as `BLOCKED_ENVIRONMENT` without consuming an implementation correction only when tracked dependency and lockfile semantics remain unchanged. Ordinary validation feedback is `RETRY_LOCAL` or `RETRY_CI`; scope expansion is `HOLD_SCOPE`; secrets, production/shared resources, destructive migration or unauthorized external writes are `HOLD_SECURITY`; exhausted budgets or impossible acceptance criteria are `FAIL_FINAL`.

Nothing may be published until lint, strict typecheck, full tests, applicable disposable integration and migration checks, build, and `git diff --check` pass. A recoverable failure must not create a replacement Issue, sibling branch, or error-specific governance PR.

### Issue #39 bounded transition

After the final simplification is ordinarily merged and `Quality gates` succeeds for the resulting exact `main` push, Issue #39 alone may be reopened and rebound to the twice-read stable new `main`. A live-PR observer result is not a post-merge activation prerequisite; an observer workflow-run job skipped solely because the upstream event is a `main` push is expected and is neither `PASS` nor `HOLD`. Issue #39 must preserve the same branch, exact fourteen paths, `next-auth@5.0.0-beta.32`, `nodemailer@8.0.11`, `@types/nodemailer@7.0.12`, one `_p2_auth_` migration, and frozen S1E semantics. The branch may advance only by non-force fast-forward. Its preserved local draft may continue under the bounded local and published correction budgets, including correction of the recorded Auth.js `handlers` GET/POST export binding and later ordinary validation feedback. Another Issue, replacement branch, dependency, migration, or governance exception is prohibited.

The separately frozen S1E authentication profile uses `P2_AUTH_IMPLEMENTATION + P2_AUTH_DRAFT_ONLY`. It is narrower than ordinary P2 and exists only to satisfy `V5_P2_S1E_AUTH_CONTRACT.md`. It does not relax ordinary `P2_IMPLEMENTATION` rules or authorize production authentication, real email, credentials, deployment, public sign-up, account recovery, or production database use.

## Authoritative product inputs

This governance decision is derived from the following frozen product inputs supplied for the V5 project:

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| `AI电商视觉系统_V5_MVP产品定义_工程差距与验证计划_V1.md` | 39540 | `c1cdd36bf8b015e9b9fa7e3389c4354f5b984931545d02c20ed6ad23b11595b7` |
| `AI_VISION_V5_P1_STANDALONE_CONTRACT_FREEZE_V1.md` | 74482 | `3010c13fad54ff01e6bb75ca949dab0cc9f34b0a50b89728fc91ecf456a9493b` |

The owner separately reported and accepted the external engineering evidence:

```text
GATE_0B_FINAL_STATUS=PASS_ACCEPTED_AND_FROZEN
FROZEN_MANIFEST_SHA256=12CB214DE0BE252AEB274967B24D7407AD006ECE4338FEEE62B8994DA829E783
```

That result is referenced owner-accepted historical evidence. This GitHub governance change does not rerun, reconstruct, or claim independent verification of the Windows evidence tree.

## Unresolved P2 prerequisites

The frozen P1 contract leaves the following implementation prerequisites unresolved. `UNKNOWN` never means implemented, accepted, or safe by default. A future P2 Issue must either resolve every prerequisite applicable to its exact vertical slice with direct evidence, or exclude the affected capability and return `HOLD`:

- authentication provider selection, Session lifecycle, and credential recovery before P2 authentication implementation;
- Source validation SLA, polling interval, uploaded-file security controls, and retention policy before asynchronous Source validation;
- idempotency-record retention and expired-key reuse rules before P2 idempotency storage;
- target-database physical DDL, partial unique indexes, composite foreign keys, and immutability enforcement before the task-scoped additive database exception below may be used;
- historical data volume, Owner distribution, Demo contamination, orphan records, and object hashes before any backfill or cutover; backfill and cutover remain outside `P2_DRAFT_ONLY`;
- object-storage and compliance retention after logical deletion of `Artifact` or `SourceSnapshot` before any production deletion behavior.

Every P1 `UNKNOWN` not listed individually above—including P50/P95 targets, Provider quotas, product-continuity rules, editor-loop behavior, paid providers, budgets, production QA, platform rules, BrandKit consumption, four-site adapters, and real-user MVP validation—remains authoritative and unresolved and cannot be pulled into `P2_DRAFT_ONLY`.

## Required machine contract

A P2 Issue must use exactly:

```json
{
  "allowedPaths": ["exact/repository/file"],
  "authorizedBaseSha": "40-or-64-character-lowercase-commit-sha",
  "authorizedHeadRef": "issue-number-unique-p2-branch",
  "maxRepairRounds": 0,
  "phase": "P2_DRAFT_ONLY",
  "requiredChecks": ["Quality gates"],
  "schema": "github-autonomous-control-v2",
  "taskClass": "P2_IMPLEMENTATION"
}
```

The unedited owner approval must bind the same base SHA, head ref, Issue-body SHA-256, zero repair limit, phase, and schema. The PR must be:

- created by the stable human owner identity;
- open and Draft;
- in the same repository;
- based on `main` at the exact authorized base SHA;
- on the exact authorized head ref;
- the only PR ever created from that head ref across every PR state and base branch.

A reused branch name, missing branch binding, edited linked approval, non-owner PR, nonzero automated repair budget, Ready transition, or mismatch returns `HOLD`. Worktree-local and published correction limits are not automated repair rounds: their visible limits are bound by the approved Issue-body digest, their actual counts remain human-audited, and the observer never dispatches them.

For `P2_AUTH_IMPLEMENTATION`, the same contract shape is used with phase `P2_AUTH_DRAFT_ONLY` and an exact `authorizedHeadRef`. The owner approval must bind that same phase and branch.

## P2 implementation allowlist

A future P2 Issue may authorize only the minimum files needed for these capabilities:

1. Test-only single-member, OWNER-only Workspace identity and isolation using a deterministic non-production principal; this does not implement or claim a production authentication Provider, Session, or credential recovery.
2. Upload file registration and `SourceSnapshot` persistence.
3. Atomic source-to-`DRAFT` `ProductTruthRevision` creation.
4. Explicit product-truth activation with no hidden or automatic activation.
5. Product information card read/write behavior within the approved Workspace.
6. `UserAssertion` capture and provenance.
7. Passive brand/reference file registration only as `SourceSnapshot`; no `BrandKitRevision` creation or consumption and no prompt or generation consumption.
8. One internal single-image/internal-test `AssetTask` path.
9. Initial `GenerationAttempt` creation only.
10. Internal `Artifact`/`ArtifactRevision` persistence with a generic test output.

The Issue must map every allowed repository path to at least one named capability and acceptance criterion. The final changed-path set must equal the exact allowlist. Incidental refactors, opportunistic cleanup, and unrelated generated files are prohibited.

## Task-scoped additive database foundation

Because the frozen P1 domain objects do not exist in the legacy Prisma schema, a future P2 Issue may explicitly authorize one database-foundation package only when all of the following are true:

1. Before implementation, the Issue freezes the applicable PostgreSQL tables, columns, indexes, partial uniqueness, composite foreign keys, and immutability enforcement for its exact vertical slice.
2. Its exact allowlist and final diff contain a modified regular-file `prisma/schema.prisma`, exactly one new `prisma/migrations/<14-digit timestamp>_p2_<slug>/migration.sql`, and at least one changed exact path under `tests/integration/` ending in `.test.ts`.
3. No other `prisma/` path changes; existing migrations and `migration_lock.toml` remain byte-for-byte untouched.
4. Human review confirms the new migration directory sorts after the authorized base's latest migration directory.
5. Fixed Quality gates apply the migration both fresh and repeatedly only to disposable isolated PostgreSQL.
6. Semantic review confirms the SQL is additive-only except for one valid ordinal-3 consumption of `P2_S1I_COMPAT_DDL_V1`. That single-use exception permits only the same-transaction, same-name, validated replacement of `P2DomainEvent_type_check` and `P2DomainEvent_body_check`, plus property-preserving `CREATE OR REPLACE FUNCTION public.p2_guard_asset_task_change()` with its OID and existing trigger binding unchanged, exactly as frozen by this document's complete S1I contract. Every other drop, replacement, truncation, rename, narrowing, overwrite, deletion, DML/backfill, historical conversion, cutover/reset, destructive down migration, and shared, persistent, or production database remains prohibited.

The observer verifies only the exact file count, paths, statuses, modes, integration-test presence, and CI result. It does not parse SQL or itself prove additive/compatibility semantics. For the autonomous program, the registered complete contract, two exact-Head independent reviews, isolated runtime proofs, and both program lifecycle gates are the required semantic successor evidence; outside that program `P2_DATABASE_MIGRATION_SEMANTICS` remains unverified until human semantic review records direct evidence. Production migration or deployment always requires a later dedicated owner authorization.

## Mandatory exclusions

P2 Draft-only work must not implement or claim:

- formal image sets or a full product-copy workflow;
- an `AssetTask` dependency other than an active `ProductTruthRevision` and a valid `PRODUCT_SOURCE`; `VisualPlan`, `GenerationPlan`, `BrandKitRevision`, QA, and `PlatformRuleSetVersion` must not be mandatory prerequisites;
- formal `VisualPlan` or `GenerationPlan` creation or consumption, including use as an `AssetTask` prerequisite;
- `BrandKitRevision` creation or consumption, or reference-driven prompt behavior;
- `PlatformRuleSetVersion` creation, loading, or consumption, or any platform-rule dependency for `AssetTask`;
- automatic QA, business automatic retry/redo, `MISSING`, or partial-delivery semantics;
- Ozon or Wildberries download packages;
- four-site link parsing;
- platform-account connections or platform API reads or writes;
- canvas editing, natural-language image editing, or formal-delivery claims;
- paid providers, real provider calls, real secrets, production data, or production accounts;
- any database change outside the task-scoped additive foundation above; any historical migration edit, second migration, destructive or narrowing DDL, DML/backfill, production migration, shared or persistent database application, destructive cutover, reset, or down migration;
- control-plane, workflow, permission, CODEOWNERS, or governance-file changes;
- changes to `package.json` or the recognized npm/pnpm/Yarn/Bun lock basenames (`package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, or `bun.lockb`) under `P2_DRAFT_ONLY`; a package manifest or lockfile from another ecosystem is outside this frozen contract and requires governance refreeze before evaluation.

The only lifecycle exception is a separately owner-approved `P2_AUTH_IMPLEMENTATION + P2_AUTH_DRAFT_ONLY` task satisfying `V5_P2_S1E_AUTH_CONTRACT.md`. It must modify both and only the root `package.json` and root `package-lock.json` as lifecycle files, pin the exact reviewed Auth.js dependency set, include the required single `_p2_auth_` migration plus integration test, and make no unrelated dependency change. This exception never applies to ordinary P2.

If an excluded capability becomes necessary, stop with `HOLD`; do not expand the Issue or infer authorization. A control-plane change cannot relax an upstream product or P1 contract boundary. When an exclusion comes from an authoritative product or P1 contract, any later change requires that upstream contract to be refrozen first, followed by a separate control-plane governance amendment, a new control-contract digest, and a new owner approval.

## Data, credential, and provider boundary

- Use mocks, deterministic local fixtures, and explicitly CI-only dummy values.
- A test-only principal must be injected server-side by local/CI fixtures, create a synthetic active actor plus isolated Workspace plus exactly one active OWNER membership, and fail closed outside test mode. A client-supplied actor or Workspace is never an authorization source, and `MVP_DEMO_USER_ID` must not be represented as production authentication.
- To exclude the unresolved asynchronous validation SLA from a P2 upload slice, validation must finish deterministically inside the request using the Issue-frozen size and MIME allowlist, magic bytes, decoder checks, byte count, and SHA-256. Do not trust filename extensions or client `Content-Type`; do not add a PENDING queue, polling, asynchronous scanner, URL/archive parsing, deletion, or production-retention claim.
- If a P2 slice persists idempotency records before production retention is decided, its Issue must freeze non-expiring test-scope records, keys that are never reused, no cleanup task, same-key/same-fingerprint replay of the original status/resource, and different-fingerprint `409 IDEMPOTENCY_CONFLICT`. Production retention and expired-key reuse remain unresolved.
- Never read, print, persist, upload, or derive real credentials.
- Never create `.env` files containing secrets.
- Never call paid or business providers.
- Never use production user, order, product, image, analytics, or billing data.
- Existing fixed Quality gates may apply the unchanged history plus one separately owner-approved P2 additive migration to a disposable isolated test database, which must be cleaned up; this never authorizes shared or production database use.
- Network expansion beyond existing fixed repository commands, dependency-set additions or changes, and external-service writes are prohibited under `P2_DRAFT_ONLY`. Existing Quality gates may install the unchanged frozen dependency set; that does not authorize a task to add dependencies or widen network access. The only narrower exception is the once-resumed Issue #39 preparation above, whose revised owner-approved body must freeze one lifecycle-disabled package-lock-only command and limit public npm access to metadata or artifacts required by its already frozen exact dependency graph. If any other prohibited capability becomes necessary, return `HOLD` and complete a separate control-plane governance amendment and refreeze before any later task.

## Machine observation and subsequent human acceptance

The observer may return `PASS` only for the following machine-verifiable evidence bound to the exact current head SHA:

1. Exact contract/approval/base/head-ref/owner/Draft bindings pass.
2. Changed paths equal the approved allowlist and contain no protected path.
3. Ordinary P2 changes no recognized Node package lifecycle path. The narrow auth task changes exactly the root `package.json` and root `package-lock.json` pair and satisfies the auth contract; every nested manifest, alternative lockfile and unrelated dependency change fails closed.
4. If `prisma/` changed, the exact additive-database file shape and integration-test presence above pass.
5. `Quality gates` completed successfully for the exact current head.

An observer `PASS` is metadata and CI evidence only. It must continue to report `P2_SEMANTIC_SCOPE_REVIEW`, `EXACT_TEST_COMMAND_EXIT_CODES`, and `BOUNDED_CORRECTION_COUNTS` as unverified, plus `P2_DATABASE_MIGRATION_SEMANTICS` whenever the database exception is used. It must not claim that product semantics, provider absence, additive SQL, correction counts, or the frozen P2 boundary have been human-accepted.

Before a human semantic reviewer may accept the exact P2 vertical slice—even while the PR remains Draft—the task handback must additionally provide direct evidence that:

1. Unit and integration tests demonstrate Workspace isolation, atomic draft creation, explicit activation, and provenance for the capabilities actually changed.
2. Negative tests show cross-Workspace access denial and reject hidden truth activation.
3. Provider calls, real secrets, production data, platform dependencies, and all excluded P2 capabilities remain absent from the task diff and runtime behavior. If the database exception is used, direct review proves its frozen DDL and additive-only SQL semantics.
4. Every applicable unresolved prerequisite is either resolved with evidence or excluded from the task.
5. The handback records each exact command and real exit code, operation path, output path, changed files, failure classification, local and published correction counts, and remaining unverified items.

Machine acceptance must report:

```text
RESULT=PASS
CONTROL_STATE=OBSERVER_ONLY
DECISION=P2_DRAFT_ONLY_CI_ACCEPTED_OBSERVER_ONLY
CONTROL_MODE=OBSERVER_ONLY
P2_STATUS=DRAFT_ONLY
REQUESTED_AUTOMATED_REPAIR_LIMIT=0
AUTO_FIX_ROUND_COUNT=0
LOCAL_CORRECTION_ROUND_COUNT=UNVERIFIED_FROM_READ_ONLY_GITHUB_METADATA
PUBLISHED_CORRECTION_ROUND_COUNT=UNVERIFIED_FROM_READ_ONLY_GITHUB_METADATA
FAILURE_CLASS=NONE
UNVERIFIED_ITEMS=BRANCH_PROTECTION,OWNER_REVIEW_NO_BYPASS,VISIBLE_ISSUE_FIELDS_MATCH_CONTRACT,P2_SEMANTIC_SCOPE_REVIEW,EXACT_TEST_COMMAND_EXIT_CODES,BOUNDED_CORRECTION_COUNTS
HUMAN_ACTION_REQUIRED=KEEP_DRAFT;HUMAN_SEMANTIC_REVIEW;DO_NOT_MERGE_BY_AUTOMATION
```

Any `HOLD` reports `P2_STATUS=LOCKED`. No machine result marks the PR Ready or authorizes merge.

## This governance task

This document and its companion control-plane changes establish bounded-convergence entry rules only. They do not modify application code, Prisma schema, migrations, package lifecycle files, provider configuration, or production data and do not start S1E. No machine result authorizes this governance PR's lifecycle transition. After an exact human semantic review, explicitly authorized ordinary merge, and successful `Quality gates` for the resulting exact `main` push, the rules are active; Issue #39 still requires its own current-base rebinding and owner approval before authentication implementation resumes.

## P2 S1I autonomous-program entry

`AI_VISION_V5_S1I_AUTONOMOUS_DELIVERY_V1` is the sole program allowed to use the program overlay in the V2 control plane. PR1 only installs the generic mechanism; it neither registers nor consumes an S1I DDL exception and does not authorize a database operation.

After PR1's exact merge and exact-main-push CI activate the delegation, child ordinal 2 may modify exactly `AGENTS.md`, `docs/governance/GITHUB_AUTONOMOUS_DEVELOPMENT_CONTROL_PLANE_V2.md`, and this file. It must freeze the complete S1I physical contract and declaratively `REGISTER` the named single-use resource `P2_S1I_COMPAT_DDL_V1`. Ordinal 2 may not modify Prisma, migrations, application/test code, lifecycle files, dependencies, locks, workflows, or data. Its successful exact merge changes the resource only from `PROPOSED_INACTIVE` to `AVAILABLE`.

Only child ordinal 3 may bind and consume that resource. After the single-use PR3 refreeze defined below, its changed-file set must equal these ten paths, with a newly generated 14-digit migration timestamp:

1. `app/api/p2/projects/[projectId]/asset-tasks/[assetTaskId]/artifacts/[artifactId]/revisions/[artifactRevisionId]/content/route.ts`
2. `app/api/p2/projects/[projectId]/asset-tasks/[assetTaskId]/execute-internal-test/route.ts`
3. `prisma/migrations/<new-14-digit-timestamp>_p2_internal_attempt_artifact_lineage/migration.sql`
4. `prisma/schema.prisma`
5. `src/http/p2-asset-task-api.ts`
6. `src/tasks/asset-task.ts`
7. `src/tasks/internal-asset-task-execution.ts`
8. `tests/integration/p2-s1i-internal-attempt-artifact-lineage.test.ts`
9. `tests/integration/p2-s1h-internal-single-image-asset-task.test.ts`
10. `tests/unit/p2-internal-attempt-artifact-api.test.ts`

The ordinal-3 binding must name the exact ordinal-2 registration merge SHA. It requires a fresh isolated loopback-only PostgreSQL 17 instance, deterministic Provider/object-storage substitutes, the complete migration/concurrency/rollback evidence frozen by ordinal 2, successful exact-Head CI, and two distinct exact-Head independent reviewers. It grants no production/shared database, real Provider, deployment, credential, fee, destructive, or lifecycle-file authority.

The resource lifecycle is `PROPOSED_INACTIVE -> AVAILABLE -> BOUND -> CONSUMED`, with `BOUND -> EXPIRED` on any pre-merge termination or expiry. Consumption exists only after the exact ordinal-3 one-parent squash merge whose parent equals the bound expected base. After that exact merge and successful exact-main-push CI, `P2_S1I_COMPAT_DDL_V1=CONSUMED` and the program delegation is permanently `TERMINATED`; neither can be replayed.

<!-- P2_S1I_COMPLETE_CONTRACT_BEGIN -->

## Complete P2 S1I internal-attempt, artifact-lineage contract

### Contract status and exact scope

This section is the complete repository-resident contract registered by child ordinal 2 of `AI_VISION_V5_S1I_AUTONOMOUS_DELIVERY_V1`. It is self-contained and does not rely on an external draft or an earlier V3/V4/V5 issue. Until ordinal 2 is merged by the active program delegation and its exact new-main `Quality gates` succeeds, its state is `PROPOSED_INACTIVE`. That activation changes only `P2_S1I_COMPAT_DDL_V1` to `AVAILABLE`; it does not run a migration, call a Provider, deploy, or touch data.

The only implementation consumer is child ordinal 3. Its exact changed paths are:

1. `app/api/p2/projects/[projectId]/asset-tasks/[assetTaskId]/artifacts/[artifactId]/revisions/[artifactRevisionId]/content/route.ts`
2. `app/api/p2/projects/[projectId]/asset-tasks/[assetTaskId]/execute-internal-test/route.ts`
3. `prisma/migrations/<new-14-digit-timestamp>_p2_internal_attempt_artifact_lineage/migration.sql`
4. `prisma/schema.prisma`
5. `src/http/p2-asset-task-api.ts`
6. `src/tasks/asset-task.ts`
7. `src/tasks/internal-asset-task-execution.ts`
8. `tests/integration/p2-s1i-internal-attempt-artifact-lineage.test.ts`
9. `tests/unit/p2-internal-attempt-artifact-api.test.ts`

No tenth path, second migration, historical migration edit, dependency, lockfile, workflow, governance file, real Provider, shared/persistent database, production database, production object storage, deployment, credential, fee, destructive action, force operation, protection bypass, or security-check weakening is permitted.

### Frozen predecessor

The ordinal-2 design was reconciled against exact main `29ba2f1badac6023c42f1ca8e1d7aad67eedc5b1`:

```text
PRISMA_SCHEMA_PATH=prisma/schema.prisma
PRISMA_SCHEMA_LENGTH=24647
PRISMA_SCHEMA_SHA256=d2a0eb3f96ea7260888a46a9eee156304d41a042694ff3778f12c24207b553b9
PREDECESSOR_MIGRATION=prisma/migrations/20260901130000_p2_internal_single_image_asset_task/migration.sql
PREDECESSOR_MIGRATION_LENGTH=5304
PREDECESSOR_MIGRATION_SHA256=0584f4efe01962c76fce87c68456cd308abd4585e926f9472cf579416a341f48
EXISTING_ASSET_TASK_STATUS_VALUES=QUEUED
EXISTING_EVENT_TYPE_VALUES=truth_revision.activated.v1
EXISTING_ASSET_TASK_GUARD=public.p2_guard_asset_task_change()
EXISTING_ASSET_TASK_TRIGGER=public.AssetTask_guard_change_trigger
```

Ordinal 3 must re-read the activated registration main, confirm this predecessor remains in its ancestry and confirm the actual immediate predecessor migration. Any incompatible intervening schema or migration change is `HOLD_SCOPE`; it is not repaired by widening this contract.

### Deterministic output and identifiers

```text
PNG_BASE64=iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=
mediaType=image/png
width=1
height=1
byteSize=68
contentDigest=431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460
CONTENT_DIGEST_BASE64=QxztaRaiohoVbjhwGv5Vu9f4iWn7v8Vtf+CZ1H8mVGA=
executorKind=INTERNAL_TEST_PNG_V1
provider=INTERNAL_TEST
model=INTERNAL_TEST_FIXED_PNG_1X1_V1
promptVersion=INTERNAL_TEST_NO_PROMPT_V1
generationAttemptId=p2:generation-attempt:<assetTaskId>:INITIAL:0
idempotencyKey=p2:asset-task:<assetTaskId>:INITIAL:0
artifactId=p2:artifact:<assetTaskId>
artifactRevisionId=<artifactId>:revision:1
generationAttemptStartedEventId=p2:event:generation-attempt:<generationAttemptId>:started:v1
artifactRevisionCreatedEventId=p2:event:artifact-revision:<artifactRevisionId>:created:v1
storageKey=p2/internal-test/<generationAttemptId>/artifact-revision-1.png
```

Before object construction, the implementation verifies the PNG signature, exact bytes, length, dimensions, and SHA-256. The deterministic object-store substitute receives `contentType=image/png` and lowercase metadata keys `sha256`, `generationattemptid`, and `artifactrevisionid` with the exact values above. No business Provider call or `provider_call.completed.v1` event exists in this slice.

### Canonical digest objects and golden vector

Canonical JSON recursively normalizes every string leaf to NFC, rejects a stored identifier when NFC would change it, sorts object keys by Unicode code point, preserves array order, uses JSON numbers without alternate textual forms, emits UTF-8 with no BOM/whitespace/final LF, and hashes those exact bytes with SHA-256 lowercase hex.

`inputBindingDigest` hashes exactly this six-key object and no other key, with the serialized key order shown:

```json
{"assetTaskId":"p2_asset_task_fixture","contentDigestAtBinding":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","projectId":"project_fixture","sourceSnapshotId":"source_fixture","truthRevisionId":"truth_fixture","workspaceId":"ws_fixture"}
```

```text
inputBindingDigest=175e2683d6418c2aee377528c2aed48f4e53d393099f78ee4ec96d07bb2df1ae
```

`inputFingerprint` hashes exactly this seven-key object and no other key, after inserting the calculated binding digest:

```json
{"autoRedoOrdinal":0,"executorKind":"INTERNAL_TEST_PNG_V1","inputBindingDigest":"175e2683d6418c2aee377528c2aed48f4e53d393099f78ee4ec96d07bb2df1ae","model":"INTERNAL_TEST_FIXED_PNG_1X1_V1","promptVersion":"INTERNAL_TEST_NO_PROMPT_V1","provider":"INTERNAL_TEST","trigger":"INITIAL"}
```

```text
inputFingerprint=960871b2efb209661119125ba76c8c39b53ff2a06752289f96c252da2ee512d0
```

Tests must independently serialize and hash both vectors; comparison against hard-coded digests alone is insufficient.

### Exact enum and existing-table changes

The migration adds `RUNNING`, `SUCCEEDED`, `FAILED`, and `HARD_BLOCKED` to existing enum `AssetTaskStatus`, after proving its pre-migration ordered labels are exactly `QUEUED`. Any check or function created in the same transaction compares `AssetTask.status::text`, so a newly added enum label is never used as an enum literal before commit.

The migration creates exactly these enums and labels in the shown order:

```text
GenerationAttemptTrigger = INITIAL, AUTO_REDO, USER_REDO
GenerationAttemptProvider = INTERNAL_TEST
GenerationAttemptExecutorKind = INTERNAL_TEST_PNG_V1
GenerationAttemptStatus = QUEUED, SUBMITTING, SUBMITTED, RUNNING, SUCCEEDED, FAILED, CANCELED, AMBIGUOUS
ArtifactLifecycleStatus = ACTIVE, DELETED
ArtifactRevisionOrigin = PROVIDER, SYSTEM_LAYOUT, USER_EDIT, PLATFORM_DERIVATION
ArtifactRevisionStatus = CANDIDATE, ACCEPTED, REJECTED, SUPERSEDED, REVOKED
P2SourceLineageRole = PRODUCT_SOURCE
P2SourceLineageStatus = ACTIVE, INVALIDATED
```

Existing `AssetTask` receives exactly four nullable columns: `currentArtifactRevisionId TEXT`, `startedAt TIMESTAMP(3)`, `finishedAt TIMESTAMP(3)`, and `failureCode TEXT`. Existing tables receive only these supporting unique indexes:

```text
AssetTask_scope_id_truthRevision_key (workspaceId, projectId, assetTaskId, truthRevisionId) UNIQUE
AssetTask_scope_id_source_key (workspaceId, projectId, assetTaskId, productSourceSnapshotId) UNIQUE
SourceSnapshot_scope_id_contentDigest_key (workspaceId, projectId, sourceSnapshotId, contentDigest) UNIQUE
```

### Exact new tables and columns

Every listed column is mandatory; no unlisted column may be added.

```text
GenerationAttempt
  generationAttemptId TEXT NOT NULL PRIMARY KEY
  workspaceId TEXT NOT NULL
  projectId TEXT NOT NULL
  assetTaskId TEXT NOT NULL
  trigger GenerationAttemptTrigger NOT NULL DEFAULT INITIAL
  autoRedoOrdinal INTEGER NOT NULL DEFAULT 0
  idempotencyKey TEXT NOT NULL
  inputFingerprint TEXT NOT NULL
  truthRevisionId TEXT NOT NULL
  brandKitRevisionId TEXT NULL
  visualPlanId TEXT NULL
  provider GenerationAttemptProvider NOT NULL DEFAULT INTERNAL_TEST
  model TEXT NOT NULL
  promptVersion TEXT NOT NULL
  executorKind GenerationAttemptExecutorKind NOT NULL
  status GenerationAttemptStatus NOT NULL
  transportRetryCount INTEGER NOT NULL DEFAULT 0
  providerRequestId TEXT NULL
  errorCode TEXT NULL
  usageBody JSONB NULL
  costBody JSONB NULL
  startedAt TIMESTAMP(3) NULL
  finishedAt TIMESTAMP(3) NULL
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

GenerationAttemptSourceLink
  linkId TEXT NOT NULL PRIMARY KEY
  workspaceId TEXT NOT NULL
  projectId TEXT NOT NULL
  assetTaskId TEXT NOT NULL
  generationAttemptId TEXT NOT NULL
  sourceSnapshotId TEXT NOT NULL
  inputRole P2SourceLineageRole NOT NULL
  inputOrder INTEGER NOT NULL
  contentDigestAtBinding TEXT NOT NULL
  linkStatus P2SourceLineageStatus NOT NULL DEFAULT ACTIVE
  createdByActorId TEXT NOT NULL
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

Artifact
  artifactId TEXT NOT NULL PRIMARY KEY
  workspaceId TEXT NOT NULL
  projectId TEXT NOT NULL
  assetTaskId TEXT NOT NULL
  assetClass AssetClass NOT NULL DEFAULT IMAGE
  lifecycleStatus ArtifactLifecycleStatus NOT NULL DEFAULT ACTIVE
  createdByActorId TEXT NOT NULL
  selectedArtifactRevisionId TEXT NULL
  deletedAt TIMESTAMP(3) NULL
  deletedByActorId TEXT NULL
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

ArtifactRevision
  artifactRevisionId TEXT NOT NULL PRIMARY KEY
  workspaceId TEXT NOT NULL
  projectId TEXT NOT NULL
  artifactId TEXT NOT NULL
  assetTaskId TEXT NOT NULL
  revisionNumber INTEGER NOT NULL DEFAULT 1
  kind AssetClass NOT NULL DEFAULT IMAGE
  origin ArtifactRevisionOrigin NOT NULL DEFAULT SYSTEM_LAYOUT
  truthRevisionId TEXT NOT NULL
  generationAttemptId TEXT NULL
  editableDocumentId TEXT NULL
  parentArtifactRevisionId TEXT NULL
  brandKitRevisionId TEXT NULL
  visualPlanId TEXT NULL
  inputBindingDigest TEXT NOT NULL
  contentDigest TEXT NOT NULL
  storageLocator TEXT NULL
  textBody TEXT NULL
  status ArtifactRevisionStatus NOT NULL DEFAULT CANDIDATE
  mediaType TEXT NOT NULL DEFAULT image/png
  byteSize BIGINT NOT NULL DEFAULT 68
  width INTEGER NOT NULL DEFAULT 1
  height INTEGER NOT NULL DEFAULT 1
  createdByActorId TEXT NULL
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

ArtifactRevisionSourceLink
  linkId TEXT NOT NULL PRIMARY KEY
  workspaceId TEXT NOT NULL
  projectId TEXT NOT NULL
  assetTaskId TEXT NOT NULL
  artifactRevisionId TEXT NOT NULL
  sourceSnapshotId TEXT NOT NULL
  sourceRole P2SourceLineageRole NOT NULL
  inputOrder INTEGER NOT NULL
  contentDigestAtBinding TEXT NOT NULL
  inheritedFromAttemptId TEXT NOT NULL
  linkStatus P2SourceLineageStatus NOT NULL DEFAULT ACTIVE
  createdByActorId TEXT NOT NULL
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
```

`brandKitRevisionId` and `visualPlanId` are real nullable columns and are fixed to NULL for this slice. `ArtifactRevision` has exactly one nonblank representation: nonblank `storageLocator` XOR nonblank `textBody`. This slice additionally requires nonnull `generationAttemptId` and `storageLocator`; null `textBody`, `editableDocumentId`, `parentArtifactRevisionId`, `brandKitRevisionId`, `visualPlanId`, and `createdByActorId`; revision 1, IMAGE, SYSTEM_LAYOUT, CANDIDATE, image/png, 68 bytes, width 1, and height 1.

### Exact unique keys and indexes

The migration creates the following exact unique keys:

```text
GenerationAttempt_scope_id_key (workspaceId, projectId, generationAttemptId)
GenerationAttempt_scope_task_id_key (workspaceId, projectId, assetTaskId, generationAttemptId)
GenerationAttempt_scope_task_truth_id_key (workspaceId, projectId, assetTaskId, truthRevisionId, generationAttemptId)
GenerationAttempt_task_trigger_ordinal_key (workspaceId, projectId, assetTaskId, trigger, autoRedoOrdinal)
GenerationAttempt_idempotency_key (workspaceId, idempotencyKey)
GenerationAttemptSourceLink_attempt_source_role_key (workspaceId, projectId, generationAttemptId, sourceSnapshotId, inputRole)
GenerationAttemptSourceLink_attempt_inputOrder_key (workspaceId, projectId, generationAttemptId, inputOrder)
GenerationAttemptSourceLink_inheritance_key (workspaceId, projectId, generationAttemptId, sourceSnapshotId, inputRole, inputOrder, contentDigestAtBinding)
Artifact_scope_id_key (workspaceId, projectId, artifactId)
Artifact_scope_id_task_key (workspaceId, projectId, artifactId, assetTaskId)
Artifact_task_key (workspaceId, projectId, assetTaskId)
Artifact_scope_task_selected_key (workspaceId, projectId, assetTaskId, selectedArtifactRevisionId)
ArtifactRevision_scope_id_key (workspaceId, projectId, artifactRevisionId)
ArtifactRevision_scope_artifact_id_key (workspaceId, projectId, artifactId, artifactRevisionId)
ArtifactRevision_scope_artifact_task_id_key (workspaceId, projectId, artifactId, assetTaskId, artifactRevisionId)
ArtifactRevision_scope_task_id_key (workspaceId, projectId, assetTaskId, artifactRevisionId)
ArtifactRevision_scope_task_id_attempt_key (workspaceId, projectId, assetTaskId, artifactRevisionId, generationAttemptId)
ArtifactRevision_artifact_revisionNumber_key (workspaceId, projectId, artifactId, revisionNumber)
ArtifactRevision_generationAttempt_key (workspaceId, projectId, generationAttemptId)
ArtifactRevisionSourceLink_revision_source_role_key (workspaceId, projectId, artifactRevisionId, sourceSnapshotId, sourceRole)
ArtifactRevisionSourceLink_revision_inputOrder_key (workspaceId, projectId, artifactRevisionId, inputOrder)
```

The exact nonunique indexes are:

```text
AssetTask_scope_currentArtifactRevision_idx (workspaceId, projectId, currentArtifactRevisionId)
GenerationAttempt_scope_task_status_createdAt_idx (workspaceId, projectId, assetTaskId, status, createdAt)
GenerationAttempt_scope_truthRevision_idx (workspaceId, projectId, truthRevisionId)
GenerationAttemptSourceLink_scope_source_idx (workspaceId, projectId, sourceSnapshotId)
GenerationAttemptSourceLink_createdByActorId_idx (createdByActorId)
Artifact_scope_lifecycle_createdAt_idx (workspaceId, projectId, lifecycleStatus, createdAt)
Artifact_createdByActorId_idx (createdByActorId)
Artifact_deletedByActorId_idx (deletedByActorId)
ArtifactRevision_scope_task_status_createdAt_idx (workspaceId, projectId, assetTaskId, status, createdAt)
ArtifactRevision_scope_truthRevision_idx (workspaceId, projectId, truthRevisionId)
ArtifactRevision_scope_contentDigest_idx (workspaceId, projectId, contentDigest)
ArtifactRevision_parent_idx (workspaceId, projectId, parentArtifactRevisionId)
ArtifactRevisionSourceLink_scope_source_idx (workspaceId, projectId, sourceSnapshotId)
ArtifactRevisionSourceLink_createdByActorId_idx (createdByActorId)
```

### Exact foreign keys

Every foreign key uses `ON UPDATE CASCADE ON DELETE RESTRICT`. Local and referenced column order is exact:

| Constraint | Local table and columns | Referenced table and columns |
| --- | --- | --- |
| `GenerationAttempt_scope_task_truth_fkey` | `GenerationAttempt(workspaceId, projectId, assetTaskId, truthRevisionId)` | `AssetTask(workspaceId, projectId, assetTaskId, truthRevisionId)` |
| `GenerationAttemptSourceLink_scope_attempt_fkey` | `GenerationAttemptSourceLink(workspaceId, projectId, assetTaskId, generationAttemptId)` | `GenerationAttempt(workspaceId, projectId, assetTaskId, generationAttemptId)` |
| `GenerationAttemptSourceLink_scope_task_source_fkey` | `GenerationAttemptSourceLink(workspaceId, projectId, assetTaskId, sourceSnapshotId)` | `AssetTask(workspaceId, projectId, assetTaskId, productSourceSnapshotId)` |
| `GenerationAttemptSourceLink_scope_source_digest_fkey` | `GenerationAttemptSourceLink(workspaceId, projectId, sourceSnapshotId, contentDigestAtBinding)` | `SourceSnapshot(workspaceId, projectId, sourceSnapshotId, contentDigest)` |
| `GenerationAttemptSourceLink_scope_creator_fkey` | `GenerationAttemptSourceLink(workspaceId, createdByActorId)` | `Membership(workspaceId, userActorId)` |
| `Artifact_scope_task_fkey` | `Artifact(workspaceId, projectId, assetTaskId)` | `AssetTask(workspaceId, projectId, assetTaskId)` |
| `Artifact_scope_creator_fkey` | `Artifact(workspaceId, createdByActorId)` | `Membership(workspaceId, userActorId)` |
| `Artifact_scope_deletedBy_fkey` | `Artifact(workspaceId, deletedByActorId)` | `Membership(workspaceId, userActorId)` |
| `ArtifactRevision_scope_artifact_task_fkey` | `ArtifactRevision(workspaceId, projectId, artifactId, assetTaskId)` | `Artifact(workspaceId, projectId, artifactId, assetTaskId)` |
| `ArtifactRevision_scope_attempt_fkey` | `ArtifactRevision(workspaceId, projectId, assetTaskId, truthRevisionId, generationAttemptId)` | `GenerationAttempt(workspaceId, projectId, assetTaskId, truthRevisionId, generationAttemptId)` |
| `ArtifactRevision_parent_same_artifact_fkey` | `ArtifactRevision(workspaceId, projectId, artifactId, parentArtifactRevisionId)` | `ArtifactRevision(workspaceId, projectId, artifactId, artifactRevisionId)` |
| `ArtifactRevision_scope_creator_fkey` | `ArtifactRevision(workspaceId, createdByActorId)` | `Membership(workspaceId, userActorId)` |
| `ArtifactRevisionSourceLink_scope_revision_attempt_fkey` | `ArtifactRevisionSourceLink(workspaceId, projectId, assetTaskId, artifactRevisionId, inheritedFromAttemptId)` | `ArtifactRevision(workspaceId, projectId, assetTaskId, artifactRevisionId, generationAttemptId)` |
| `ArtifactRevisionSourceLink_inherited_binding_fkey` | `ArtifactRevisionSourceLink(workspaceId, projectId, inheritedFromAttemptId, sourceSnapshotId, sourceRole, inputOrder, contentDigestAtBinding)` | `GenerationAttemptSourceLink(workspaceId, projectId, generationAttemptId, sourceSnapshotId, inputRole, inputOrder, contentDigestAtBinding)` |
| `ArtifactRevisionSourceLink_scope_source_digest_fkey` | `ArtifactRevisionSourceLink(workspaceId, projectId, sourceSnapshotId, contentDigestAtBinding)` | `SourceSnapshot(workspaceId, projectId, sourceSnapshotId, contentDigest)` |
| `ArtifactRevisionSourceLink_scope_creator_fkey` | `ArtifactRevisionSourceLink(workspaceId, createdByActorId)` | `Membership(workspaceId, userActorId)` |

Three cyclic pointer foreign keys are additionally `DEFERRABLE INITIALLY DEFERRED`:

| Constraint | Local columns | Referenced columns |
| --- | --- | --- |
| `Artifact_selected_revision_fkey` | `Artifact(workspaceId, projectId, artifactId, selectedArtifactRevisionId)` | `ArtifactRevision(workspaceId, projectId, artifactId, artifactRevisionId)` |
| `AssetTask_current_artifact_revision_direct_fkey` | `AssetTask(workspaceId, projectId, assetTaskId, currentArtifactRevisionId)` | `ArtifactRevision(workspaceId, projectId, assetTaskId, artifactRevisionId)` |
| `AssetTask_current_selected_equivalence_fkey` | `AssetTask(workspaceId, projectId, assetTaskId, currentArtifactRevisionId)` | `Artifact(workspaceId, projectId, assetTaskId, selectedArtifactRevisionId)` |

The equivalence foreign key never substitutes for the direct ArtifactRevision foreign key.

### Exact CHECK predicates

All identifiers and digests are nonblank, trim-stable strings; digests match `^[0-9a-f]{64}$`; `autoRedoOrdinal`, `inputOrder`, `transportRetryCount`, dimensions, sizes, and revision numbers are nonnegative or positive as their names require. The named checks are exactly:

```text
GenerationAttempt_identifiers_check
GenerationAttempt_p2_contract_check
GenerationAttempt_state_check
GenerationAttemptSourceLink_p2_contract_check
Artifact_p2_contract_check
ArtifactRevision_content_representation_check
ArtifactRevision_p2_contract_check
ArtifactRevisionSourceLink_p2_contract_check
AssetTask_currentArtifactRevisionId_check
AssetTask_state_check
AssetTask_failureCode_check
```

For this slice, `GenerationAttempt_p2_contract_check` fixes `trigger=INITIAL`, `autoRedoOrdinal=0`, `provider=INTERNAL_TEST`, `model=INTERNAL_TEST_FIXED_PNG_1X1_V1`, `promptVersion=INTERNAL_TEST_NO_PROMPT_V1`, `executorKind=INTERNAL_TEST_PNG_V1`, null `brandKitRevisionId`, `visualPlanId`, `providerRequestId`, `usageBody`, and `costBody`, and `transportRetryCount=0`.

`GenerationAttempt_state_check` is the exact disjunction:

```text
RUNNING   => startedAt NOT NULL, finishedAt NULL, errorCode NULL
SUCCEEDED => startedAt NOT NULL, finishedAt NOT NULL, finishedAt >= startedAt, errorCode NULL
FAILED    => startedAt NOT NULL, finishedAt NOT NULL, finishedAt >= startedAt,
             errorCode IN (INTERNAL_TEST_EXECUTOR_FAILED, INTERNAL_TEST_OUTPUT_INVALID,
                           OBJECT_WRITE_FAILED_COMPENSATED, FINALIZE_FAILED_COMPENSATED)
AMBIGUOUS => startedAt NOT NULL, finishedAt NOT NULL, finishedAt >= startedAt,
             errorCode IN (OBJECT_WRITE_FAILED_COMPENSATION_FAILED,
                           FINALIZE_FAILED_COMPENSATION_FAILED)
```

No other GenerationAttempt state is writable by this slice. The FAILED and AMBIGUOUS error sets are disjoint.

`AssetTask_state_check` and `AssetTask_failureCode_check` jointly enforce:

```text
QUEUED       => startedAt NULL, finishedAt NULL, failureCode NULL, currentArtifactRevisionId NULL
RUNNING      => startedAt NOT NULL, finishedAt NULL, failureCode NULL, currentArtifactRevisionId NULL
SUCCEEDED    => startedAt NOT NULL, finishedAt NOT NULL, finishedAt >= startedAt,
                failureCode NULL, currentArtifactRevisionId NOT NULL
FAILED       => startedAt NOT NULL, finishedAt NOT NULL, finishedAt >= startedAt,
                currentArtifactRevisionId NULL, failureCode in the FAILED error set above
HARD_BLOCKED => startedAt NOT NULL, finishedAt NOT NULL, finishedAt >= startedAt,
                currentArtifactRevisionId NULL, failureCode in the AMBIGUOUS error set above
```

The only AssetTask transitions are `QUEUED -> RUNNING`, `RUNNING -> SUCCEEDED`, `RUNNING -> FAILED`, and `RUNNING -> HARD_BLOCKED`. `AssetTask.status=AMBIGUOUS` is forbidden. The cross-object mapping is exactly `GenerationAttempt.status=AMBIGUOUS` plus `AssetTask.status=HARD_BLOCKED`; it is P1-enum-compatible and owner-frozen for S1I, not P1-mandated.

### Exact event CHECK replacements

The migration drops and recreates only `P2DomainEvent_type_check` and `P2DomainEvent_body_check`, under the same names and inside the same transaction. Both finish `convalidated=true`; `NOT VALID` is forbidden.

`P2DomainEvent_type_check` is exactly:

```sql
CHECK ("eventType" IN (
  'truth_revision.activated.v1',
  'generation_attempt.started.v1',
  'artifact_revision.created.v1'
))
```

`P2DomainEvent_body_check` is an exact `CASE "eventType"` expression. The `truth_revision.activated.v1` branch is byte-semantically equivalent to the predecessor predicate and preserves its SQL TRUE/NULL acceptance behavior, including allowance of extra keys. The two new branches each use a nested `CASE WHEN jsonb_typeof("eventBody") = 'object' THEN (...) IS TRUE ELSE FALSE END`, so object operators never execute on SQL NULL, JSON null, strings, numbers, booleans, or arrays.

The `generation_attempt.started.v1` object has exactly the six keys `assetTaskId`, `autoRedoOrdinal`, `generationAttemptId`, `model`, `provider`, and `trigger`; all IDs/model/provider/trigger are JSON strings, ordinal is a JSON number, trigger is INITIAL, ordinal is numeric zero, provider is INTERNAL_TEST, and model is INTERNAL_TEST_FIXED_PNG_1X1_V1. The `artifact_revision.created.v1` object has exactly the five string keys `artifactRevisionId`, `assetTaskId`, `contentDigest`, `kind`, and `origin`; kind is IMAGE, origin is SYSTEM_LAYOUT, and digest is the frozen PNG digest.

The complete replacement predicate is:

```sql
CHECK (
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
)
```

Tests separately prove the old type accepted-row set is a proper subset of the new type set, the old combined-check accepted-row set is a proper subset of the new combined-check set, and every old-domain body result is preserved. They cover SQL NULL, JSON null, every scalar kind, arrays, missing/extra keys, wrong types/values, unknown event types, both new positive witnesses, and all old truth-event null/string combinations.

### Functions, triggers, and immutability

Pre-DDL catalog assertions freeze the existing `public.p2_guard_asset_task_change()` identity arguments (none), trigger return type, PL/pgSQL language, SECURITY INVOKER, VOLATILE volatility, owner, ACL, `proconfig`, OID, and the enabled `AssetTask_guard_change_trigger` binding. The migration uses `CREATE OR REPLACE FUNCTION`; those properties, OID, and trigger binding must be identical afterward. The replacement guard compares statuses as text, permits only the four AssetTask transitions above with the exact column invariants, rejects every no-status-change UPDATE and provenance mutation, and rejects DELETE.

The migration creates these additional trigger functions with `RETURNS TRIGGER`, PL/pgSQL, SECURITY INVOKER, VOLATILE, and no function-level configuration:

```text
public.p2_guard_generation_attempt_change()
public.p2_guard_artifact_change()
public.p2_reject_artifact_revision_change()
public.p2_reject_generation_attempt_source_link_change()
public.p2_reject_artifact_revision_source_link_change()
```

`p2_guard_generation_attempt_change` has separate branches for `RUNNING -> SUCCEEDED`, `RUNNING -> FAILED`, and `RUNNING -> AMBIGUOUS`; a broad `IN (...)` transition is forbidden. It rejects identity, scope, input, lineage, executor, provider, request, usage/cost, and createdAt mutation, no-state UPDATE, cross-set/null/unfrozen errors, and DELETE. `p2_guard_artifact_change` allows only one ACTIVE selected-pointer assignment and one `ACTIVE -> DELETED` transition with both deletion fields, rejects provenance mutation and physical DELETE, and exposes no API for either allowed mutation except the finalize pointer assignment. ArtifactRevision and both link tables reject every UPDATE and DELETE.

Exact triggers are:

```text
AssetTask_guard_change_trigger BEFORE UPDATE OR DELETE ON AssetTask
GenerationAttempt_state_machine_trigger BEFORE UPDATE OR DELETE ON GenerationAttempt
Artifact_guard_change_trigger BEFORE UPDATE OR DELETE ON Artifact
ArtifactRevision_immutable_trigger BEFORE UPDATE OR DELETE ON ArtifactRevision
GenerationAttemptSourceLink_immutable_trigger BEFORE UPDATE OR DELETE ON GenerationAttemptSourceLink
ArtifactRevisionSourceLink_immutable_trigger BEFORE UPDATE OR DELETE ON ArtifactRevisionSourceLink
```

The existing AssetTask trigger is not dropped or recreated.

### Atomic migration and rollback proof

```text
FIRST_EXECUTABLE_TRANSACTION_STATEMENT=BEGIN
LAST_EXECUTABLE_TRANSACTION_STATEMENT=COMMIT
OUTSIDE_TRANSACTION_DDL_COUNT=0
OUTSIDE_TRANSACTION_DML_COUNT=0
```

Before the first DDL statement, the transaction asserts exact predecessor enums, table/column/key/constraint identities, both old CHECK definitions, function catalog properties, and trigger binding. Missing, duplicate, or drifted predecessor objects abort before mutation. The transaction then performs enum additions, supporting keys/columns, the two CHECK replacements, the property-preserving guard replacement, at least the first new S1I DDL object, exactly one sentinel:

```sql
-- ROLLBACK_PROBE_INJECTION_POINT_P2_S1I_COMPAT_DDL_V1
```

and then all remaining tables, keys, FKs, checks, functions, triggers, postconditions, and `COMMIT`. No DML is permitted. Tests insert an artificial exception in memory immediately after the sentinel without editing the migration file. After rollback, constraint definitions/validation, enum labels, function OID/owner/ACL/proconfig/identity/behavior, trigger name/table/events/timing/orientation/enabled state/function-OID binding, tables, columns, keys, and indexes equal the pre-run snapshot.

### Claim, execution, object-write, finalize, and commit outcomes

Claim uses an explicit `READ COMMITTED` transaction and verifies `transaction_isolation=read committed`. It performs exactly the scoped row lock:

```sql
SELECT ... FROM "AssetTask"
WHERE "workspaceId" = $1 AND "projectId" = $2 AND "assetTaskId" = $3
FOR UPDATE
```

After acquiring the lock it re-evaluates task state and deterministic Attempt ID. Only `QUEUED` with no Attempt creates one RUNNING Attempt, one frozen source link, one `generation_attempt.started.v1` event, and changes the task to RUNNING. The executor/storage substitute is constructed only after claim commit is confirmed and the caller is the winner. A loser sees RUNNING and returns 202; completion replay returns 201. Two real database sessions plus a third observer must prove `pg_blocking_pids(session_b_pid)` contains `session_a_pid`, with `pg_stat_activity`/`pg_locks` showing B waiting on A's row/transaction lock. An executor barrier is not row-lock proof. Final totals are one Attempt, one started event, one executor call, and one `putObject` call.

Claim SQLSTATE `40001` or `40P01` maps to `503 DATABASE_TRANSACTION_RETRY_REQUIRED`; lock-timeout `55P03` maps to `503 ASSET_TASK_CLAIM_LOCK_TIMEOUT`. Each rolls back, performs zero executor/storage/compensation calls, and is never automatically retried in the same request.

Object-write outcomes are exhaustive:

1. Confirmed success with exact bytes/metadata proceeds to finalize.
2. Confirmed failure that guarantees absence, or unknown result followed by authoritative exact-key proof of absence, writes terminal `GenerationAttempt=FAILED` and `AssetTask=FAILED` with `OBJECT_WRITE_FAILED_COMPENSATED`.
3. Unknown result followed by authoritative proof of the exact valid object proceeds once to finalize; it does not call `putObject` again.
4. Unknown/unreadable/mismatched object state never deletes the object and writes `GenerationAttempt=AMBIGUOUS`, `AssetTask=HARD_BLOCKED`, and `OBJECT_WRITE_FAILED_COMPENSATION_FAILED` only after that terminal database commit is confirmed. If the terminal commit outcome is unknown, return `DATABASE_COMMIT_OUTCOME_UNKNOWN` and fabricate no terminal state.

Finalize atomically creates Artifact, ArtifactRevision, inherited source link, `artifact_revision.created.v1`, both selected pointers, `GenerationAttempt=SUCCEEDED`, and `AssetTask=SUCCEEDED`. It copies the Attempt's frozen lineage and never queries a newer SourceSnapshot or truth revision. On definite finalize rollback or unknown finalize commit, an authoritative database reread precedes any deletion. Exact-object deletion is allowed only when Task and Attempt remain RUNNING and Artifact, Revision, revision link, and created event are all absent. Confirmed deletion success produces FAILED/FAILED with `FINALIZE_FAILED_COMPENSATED`; failed or unknown deletion produces AMBIGUOUS/HARD_BLOCKED with `FINALIZE_FAILED_COMPENSATION_FAILED`. Inconsistent or unavailable reread means no deletion and `503 DATABASE_COMMIT_OUTCOME_UNKNOWN`.

Any claim/finalize terminal-write commit exception is resolved by authoritative reread of stable Task, Attempt, link, event, Artifact, Revision, and pointer IDs. Coherent RUNNING returns 202 with the original durable request ID; coherent SUCCEEDED returns 201; FAILED/FAILED returns 409; HARD_BLOCKED/AMBIGUOUS returns 503; QUEUED/no coherent graph or inconsistent/unavailable evidence returns `DATABASE_COMMIT_OUTCOME_UNKNOWN`. A commit exception is never assumed to mean rollback.

### HTTP contract

`POST /api/p2/projects/{projectId}/asset-tasks/{assetTaskId}/execute-internal-test` requires the existing authenticated active OWNER session, an empty body, no `Content-Type`, and no client actor/workspace/provider/model/prompt/source/truth/storage/idempotency input. New success and successful replay are 201; RUNNING is 202; both use the durable first-claim request ID and `Location: /api/p2/projects/{projectId}/asset-tasks/{assetTaskId}`. FAILED/FAILED is `409 ASSET_TASK_EXECUTION_FAILED`; HARD_BLOCKED/AMBIGUOUS is `503 ASSET_TASK_EXECUTION_AMBIGUOUS`.

The existing task GET returns 200 with: QUEUED and no Attempt/Revision; RUNNING and Attempt/no Revision; SUCCEEDED and Attempt/Revision; FAILED and failed Attempt/no Revision; or HARD_BLOCKED and ambiguous Attempt/no Revision. Cross-workspace/project/task access does not disclose existence.

`GET /api/p2/projects/{projectId}/asset-tasks/{assetTaskId}/artifacts/{artifactId}/revisions/{artifactRevisionId}/content` validates full scope, selected-pointer equivalence, Attempt binding, active Artifact, CANDIDATE Revision, IMAGE/SYSTEM_LAYOUT representation, MIME, length, dimensions, locator, and SHA-256 before returning bytes. Full success includes `Content-Type: image/png`, `Content-Length: 68`, `Content-Digest: sha-256=:QxztaRaiohoVbjhwGv5Vu9f4iWn7v8Vtf+CZ1H8mVGA=:`, `ETag: "sha256-431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460"`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and current `X-Request-Id`.

Matching `If-None-Match` returns 304 with no body. One syntactically valid satisfiable byte range returns 206, exact `Content-Range`, exact partial `Content-Length`, and the same representation validators. Multiple ranges, malformed ranges, and unsatisfiable ranges return deterministic `416 RANGE_NOT_SATISFIABLE` with `Content-Range: bytes */68` and no image bytes. Any integrity mismatch returns a JSON error and zero image bytes.

### Machine-readable error metadata

Every error uses the stable envelope `{ "error": { "code", "category", "retryable", "userActionRequired", "hardBlock", "message", "requestId", "details" } }` and does not expose SQL, object keys/locators, stack traces, credentials, Provider payloads, or raw exceptions.

| Code | HTTP | Category | Retryable | User action | Hard block |
| --- | ---: | --- | --- | --- | --- |
| `AUTH_REQUIRED` | 401 | `AUTHENTICATION` | false | true | true |
| `FORBIDDEN_SCOPE` | 403 | `AUTHORIZATION` | false | false | true |
| `VALIDATION_FAILED` | 400 | `INPUT` | false | true | true |
| `TASK_CONFLICT` | 409 | `TASK_STATE` | false | true | true |
| `ASSET_TASK_NOT_FOUND` | 404 | `RESOURCE` | false | false | true |
| `ASSET_TASK_EXECUTION_FAILED` | 409 | `TASK_STATE` | false | true | true |
| `ASSET_TASK_EXECUTION_AMBIGUOUS` | 503 | `TASK_STATE` | false | true | true |
| `SERVICE_UNAVAILABLE` | 503 | `INTERNAL` | true | false | false |
| `DATABASE_TRANSACTION_RETRY_REQUIRED` | 503 | `CONCURRENCY` | true | false | false |
| `ASSET_TASK_CLAIM_LOCK_TIMEOUT` | 503 | `CONCURRENCY` | true | false | false |
| `DATABASE_COMMIT_OUTCOME_UNKNOWN` | 503 | `CONCURRENCY` | false | true | true |
| `ARTIFACT_NOT_FOUND` | 404 | `RESOURCE` | false | false | true |
| `ARTIFACT_CONTENT_UNAVAILABLE` | 502 | `STORAGE_TRANSIENT` | true | false | false |
| `ARTIFACT_CONTENT_INTEGRITY_MISMATCH` | 502 | `STORAGE_INTEGRITY` | false | true | true |
| `NOT_ACCEPTABLE` | 406 | `INPUT` | false | true | true |
| `RANGE_NOT_SATISFIABLE` | 416 | `INPUT` | false | true | true |
| `INTERNAL_ERROR` | 500 | `INTERNAL` | true | false | false |

### Binding validity, actor successor, and lifecycle

A candidate is one visible resource request inside the canonical latest program-child binding. It may exist before validation and is not authority. A valid ordinal-3 binding is a candidate for which the immutable PR1 root, contiguous ordinal history, unique grant/nonce/branch, latest canonical Issue-contract digest, API readback digest, exact expected base, ordinal-2 registration merge SHA, exact migration path, exact nine paths, counters/budgets, Draft PR link, current-Head CI, two current-Head independent reviews, and two-read snapshots all match. The complete history distinguishes `candidateCount` from `validCount`; it requires exactly one current valid binding, zero prior valid consumptions, complete pagination, and stable reads. Edited/deleted/stale bodies or comments, a second candidate that becomes valid, or ambiguity is `HOLD`.

There is no legacy Owner-approval template for a program child and no placeholder may be represented as approval. The orchestrator instantiates concrete grant, nonce, base, branch, contract digest, canonical Issue-contract digest, activation/expiry, limits, paths, checks, and resource values only after the exact non-binding Issue bytes and repository contract section are final. It then inserts the one canonical program binding, creates the Issue, and records the separate GitHub API body-readback digest only outside that Issue. Any non-program approval template remains inert documentation until every placeholder is replaced after hashing the exact final body and an unedited human Owner comment exists.

For this program only, the active PR1 delegation plus a valid child binding is the programmatic successor to the legacy additional Owner actor condition. It does not manufacture a human approval. `PROGRAM_CHILD_SAFE_TO_READY` authorizes the Lifecycle Controller's one ordinary Ready transition. After exact owner reconcile, `PROGRAM_CHILD_SAFE_TO_SQUASH_MERGE` authorizes one ordinary squash merge. This successor rule does not affect any non-program task. Exact ordinal-3 merge and successful exact-main-push CI changes AVAILABLE to BOUND to CONSUMED and permanently terminates the delegation. Pre-merge close/expiry changes BOUND to EXPIRED. BOUND never returns to AVAILABLE; CONSUMED/EXPIRED are irreversible; reopening cannot restore them.

### Required verification

Ordinal 3 uses two separate fresh loopback-only PostgreSQL 17 clusters: one fresh all-migrations fixture and one immediate-predecessor upgrade fixture. It records server version, database/user, temp/data roots, PID, port, start/stop times, exit, port release, and directory removal. The upgrade fixture seeds every legal old truth-event null/string combination; snapshots both CHECKs, validation, function OID/owner/ACL/proconfig/attributes, trigger definition/enabled state/OID binding, and predecessor schema; proves injected rollback equality; applies the migration once; proves old data remains legal, both new event witnesses succeed, invalid JSON is safely rejected, strict-superset relations hold, schema/migration/catalog agree, the migration has one successful `_prisma_migrations` record with exact basename/checksum, and a second deploy is a no-op.

The fixed order is:

```text
npm run db:generate
npm run db:migrate:check
npm run test -- tests/unit/p2-internal-attempt-artifact-api.test.ts
npm run test
npm run test:integration -- tests/integration/p2-s1i-internal-attempt-artifact-lineage.test.ts
npm run test:integration
npm run lint
npm run typecheck
npm run build
git diff --check
```

Every real exit code is reported. The exact migration, rollback, concurrency, object-state, API, digest, tenant isolation, replay, negative JSONB, catalog, and cleanup evidence is reviewed independently by two distinct current-Head reviewers. Any unverified invariant or cleanup failure is `HOLD`; no claim is inferred from a passing metadata observer alone.

<!-- P2_S1I_COMPLETE_CONTRACT_END -->

## Single-use PR3 scope and baseline refreeze

`AI_VISION_V5_S1I_PR3_SCOPE_REFREEZE_AND_LEGACY_ENUM_TEST_MIGRATION_V1` resolves the one pre-publication contradiction recorded by Issue #61. The complete registered S1I contract above remains byte-frozen and its semantic requirements do not change. For Issue #61 only, every reference above to the ordinal-3 "nine paths", and the sentence prohibiting a tenth path, is superseded solely by adding this exact tenth path:

`tests/integration/p2-s1h-internal-single-image-asset-task.test.ts`

That file may change only its exact `AssetTaskStatus` catalogue expectation from `QUEUED` to the ordered complete set `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `HARD_BLOCKED`. It must continue to require `QUEUED`, use exact equality, query the real PostgreSQL enum catalogue, and preserve every dependency, immutability, index, key, and trigger assertion. No test skipping, isolation, interception, contains-only weakening, or production accommodation is permitted.

The refreeze advances Issue #61 once from `c46ba6af717628e528b71f2e335c6b5aa37ab407` to the exact one-parent squash merge of Issue #62's control-plane repair after its reviewed Head tree and exact-main-push CI succeed. The existing PR3 branch advances by ordinary merge only. One unedited owner `S1I_PR3_SCOPE_REFREEZE_JSON` comment binds old and new bases, repair Issue/PR/merge, old and new Issue-body digests, grant, nonce, child branch, and the frozen legacy-test path/hash. Missing, duplicate, edited, stale, replayed, permission-ambiguous, path-drifted, identity-drifted, tree-drifted, CI-ambiguous, lifecycle-ambiguous, or extra-main history is `HOLD`. Consumption is limited to Issue #61 and becomes permanently invalid after exact PR3 merge and main-push CI.
