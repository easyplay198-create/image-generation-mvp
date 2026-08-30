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

After this bounded-convergence control-plane revision merges and its no-write observer smoke succeeds, Issue #39 alone may be reopened and rebound to the twice-read stable new `main`. It must preserve the same branch, exact fourteen paths, `next-auth@5.0.0-beta.32`, `nodemailer@8.0.11`, `@types/nodemailer@7.0.12`, one `_p2_auth_` migration, and frozen S1E semantics. The branch may advance only by non-force fast-forward. Its preserved local draft may continue under the local correction budget, including correction of the recorded Auth.js `handlers` GET/POST export binding. Another Issue, replacement branch, dependency, migration, or governance exception is prohibited.

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
6. Human semantic review confirms the SQL is additive-only. It may add the frozen tables, nullable fields, types, indexes, and constraints, but must not drop, truncate, rename, narrow, overwrite, or delete; execute DML/backfill or historical conversion; perform cutover or reset; add a destructive down migration; or touch a shared, persistent, or production database.

The observer verifies only the exact file count, paths, statuses, modes, integration-test presence, and CI result. It does not parse SQL or prove additive semantics. Whenever this exception is used, `P2_DATABASE_MIGRATION_SEMANTICS` remains unverified until the human semantic review records direct evidence. Production migration or deployment always requires a later dedicated owner authorization.

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

This document and its companion control-plane changes establish bounded-convergence entry rules only. They do not modify application code, Prisma schema, migrations, package lifecycle files, provider configuration, or production data and do not start S1E. No machine result authorizes this governance PR's lifecycle transition. After a separately authorized merge and activation smoke, Issue #39 still requires its own current-base rebinding and owner approval before authentication implementation resumes.
