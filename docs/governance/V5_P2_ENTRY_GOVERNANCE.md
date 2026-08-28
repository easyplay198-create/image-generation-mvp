# V5 P2 Draft-only entry governance

Status: frozen task-scoped governance; P2 implementation has not started in this change.

## Decision

The repository default remains `P2_LOCKED`. A future P2 task may proceed only when a dedicated human-owner Issue, approval, task branch, and initially Draft PR satisfy all controls below. The only machine-recognized P2 state is `P2_DRAFT_ONLY`.

`P2_DRAFT_ONLY` means:

- one exact, owner-approved P2 vertical slice may be implemented on one exact pre-approved branch;
- the PR must remain Draft;
- automated repair, Ready, auto-merge, and merge remain disabled;
- CI success is engineering evidence only and does not establish semantic acceptance;
- human semantic review and a separate human decision are required before any later lifecycle transition.

It does not globally unlock P2, authorize a second P2 task, permit production use, or widen any path allowlist.

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
- target-database physical DDL, partial unique indexes, composite foreign keys, and immutability enforcement before any new migration or schema capability; resolving them does not place that capability inside `P2_DRAFT_ONLY`;
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

A reused branch name, missing branch binding, edited approval, non-owner PR, nonzero repair budget, Ready transition, or mismatch returns `HOLD`.

## P2 implementation allowlist

A future P2 Issue may authorize only the minimum files needed for these capabilities:

1. Single-member, OWNER-only Workspace authentication and isolation.
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
- any migration or schema artifact addition or modification, new DDL or migration capability, backfill, production migration, destructive cutover, or database reset under `P2_DRAFT_ONLY`;
- control-plane, workflow, permission, CODEOWNERS, or governance-file changes;
- changes to `package.json` or the recognized npm/pnpm/Yarn/Bun lock basenames (`package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, or `bun.lockb`) under `P2_DRAFT_ONLY`; a package manifest or lockfile from another ecosystem is outside this frozen contract and requires governance refreeze before evaluation.

If an excluded capability becomes necessary, stop with `HOLD`; do not expand the Issue or infer authorization. A control-plane change cannot relax an upstream product or P1 contract boundary. When an exclusion comes from an authoritative product or P1 contract, any later change requires that upstream contract to be refrozen first, followed by a separate control-plane governance amendment, a new control-contract digest, and a new owner approval.

## Data, credential, and provider boundary

- Use mocks, deterministic local fixtures, and explicitly CI-only dummy values.
- Never read, print, persist, upload, or derive real credentials.
- Never create `.env` files containing secrets.
- Never call paid or business providers.
- Never use production user, order, product, image, analytics, or billing data.
- Existing fixed Quality gates may apply the unchanged existing migrations to a disposable isolated test database, which must be cleaned up; this does not authorize a migration or schema change in the task.
- Network expansion beyond existing fixed repository commands, dependency-set additions or changes, and external-service writes are prohibited under `P2_DRAFT_ONLY`. Existing Quality gates may install the unchanged frozen dependency set; that does not authorize a task to add dependencies or widen network access. If a prohibited capability becomes necessary, return `HOLD` and complete a separate control-plane governance amendment and refreeze before any later task.

## Machine observation and subsequent human acceptance

The observer may return `PASS` only for the following machine-verifiable evidence bound to the exact current head SHA:

1. Exact contract/approval/base/head-ref/owner/Draft bindings pass.
2. Changed paths equal the approved allowlist and contain no protected path.
3. No recognized Node package lifecycle path changed: `package.json`, `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, or `bun.lockb`, at the repository root or in a nested directory.
4. `Quality gates` completed successfully for the exact current head.

An observer `PASS` is metadata and CI evidence only. It must continue to report `P2_SEMANTIC_SCOPE_REVIEW` and `EXACT_TEST_COMMAND_EXIT_CODES` as unverified, and it must not claim that product semantics, provider absence, migration absence, or the frozen P2 boundary have been human-accepted.

Before a human semantic reviewer may accept the exact P2 vertical slice—even while the PR remains Draft—the task handback must additionally provide direct evidence that:

1. Unit and integration tests demonstrate Workspace isolation, atomic draft creation, explicit activation, and provenance for the capabilities actually changed.
2. Negative tests show cross-Workspace access denial and reject hidden truth activation.
3. Provider calls, real secrets, production data, migration/schema changes or migration capability, platform dependencies, and all excluded P2 capabilities remain absent from the task diff and runtime behavior.
4. Every applicable unresolved prerequisite is either resolved with evidence or excluded from the task.
5. The handback records each exact command and real exit code, operation path, output path, changed files, and remaining unverified items.

Machine acceptance must report:

```text
RESULT=PASS
CONTROL_STATE=OBSERVER_ONLY
DECISION=P2_DRAFT_ONLY_CI_ACCEPTED_OBSERVER_ONLY
CONTROL_MODE=OBSERVER_ONLY
P2_STATUS=DRAFT_ONLY
AUTO_FIX_ROUND_COUNT=0
UNVERIFIED_ITEMS=BRANCH_PROTECTION,OWNER_REVIEW_NO_BYPASS,VISIBLE_ISSUE_FIELDS_MATCH_CONTRACT,P2_SEMANTIC_SCOPE_REVIEW,EXACT_TEST_COMMAND_EXIT_CODES
HUMAN_ACTION_REQUIRED=KEEP_DRAFT;HUMAN_SEMANTIC_REVIEW;DO_NOT_MERGE_BY_AUTOMATION
```

Any `HOLD` reports `P2_STATUS=LOCKED`. No machine result marks the PR Ready or authorizes merge.

## This governance task

This document and its companion control-plane changes establish entry rules only. They do not modify application code, Prisma schema, migrations, package lifecycle files, provider configuration, or production data; do not start P2; and do not authorize this governance PR to become Ready or merge automatically.
