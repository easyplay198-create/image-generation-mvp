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
7. Passive brand/reference file registration only; no prompt or generation consumption.
8. One internal single-image/internal-test `AssetTask` path.
9. Initial `GenerationAttempt` creation only.
10. Internal `Artifact`/`ArtifactRevision` persistence with a generic test output.

The Issue must map every allowed repository path to at least one named capability and acceptance criterion. The final changed-path set must equal the exact allowlist. Incidental refactors, opportunistic cleanup, and unrelated generated files are prohibited.

## Mandatory exclusions

P2 Draft-only work must not implement or claim:

- formal image sets or a full product-copy workflow;
- `VisualPlan` or `GenerationPlan` as a prerequisite;
- `BrandKit` consumption or reference-driven prompt behavior;
- automatic QA, business automatic retry/redo, `MISSING`, or partial-delivery semantics;
- Ozon or Wildberries download packages;
- four-site link parsing;
- canvas editing, natural-language image editing, or formal-delivery claims;
- paid providers, real provider calls, real secrets, production data, or production accounts;
- production migration, destructive cutover, or database reset without separate explicit authorization;
- control-plane, workflow, permission, CODEOWNERS, or governance-file changes;
- package or lockfile changes unless a separate owner authorization explicitly resolves the lifecycle hold.

If an excluded capability becomes necessary, stop with `HOLD`; do not expand the Issue or infer authorization.

## Data, credential, and provider boundary

- Use mocks, deterministic local fixtures, and explicitly CI-only dummy values.
- Never read, print, persist, upload, or derive real credentials.
- Never create `.env` files containing secrets.
- Never call paid or business providers.
- Never use production user, order, product, image, analytics, or billing data.
- Isolated test databases may be used only through existing fixed repository commands and must be cleaned up.
- Network expansion, dependency installation, and external writes require separate owner review and `HOLD` unless already fixed and explicitly allowed by the approved task.

## Minimum acceptance evidence

Before a P2 Draft PR can receive an observer `PASS`, all of the following must have direct evidence for its exact head SHA:

1. Exact contract/approval/base/head-ref/owner/Draft bindings pass.
2. Changed paths equal the approved allowlist and contain no protected path.
3. No lifecycle/package file changed.
4. `Quality gates` completed successfully for the exact current head.
5. Unit and integration tests demonstrate Workspace isolation, atomic draft creation, explicit activation, and provenance for the capabilities actually changed.
6. Negative tests show cross-Workspace access denial and reject hidden truth activation.
7. Provider calls, real secrets, production data, migrations, and excluded P2 capabilities remain absent.
8. The handback records each exact command and real exit code, operation path, output path, changed files, and unverified items.

Machine acceptance must report:

```text
RESULT=PASS
CONTROL_STATE=OBSERVER_ONLY
CONTROL_MODE=OBSERVER_ONLY
P2_STATUS=DRAFT_ONLY
AUTO_FIX_ROUND_COUNT=0
HUMAN_ACTION_REQUIRED=KEEP_DRAFT;HUMAN_SEMANTIC_REVIEW;DO_NOT_MERGE_BY_AUTOMATION
```

Any `HOLD` reports `P2_STATUS=LOCKED`. No machine result marks the PR Ready or authorizes merge.

## This governance task

This document and its companion control-plane changes establish entry rules only. They do not modify application code, Prisma schema, migrations, package lifecycle files, provider configuration, or production data; do not start P2; and do not authorize this governance PR to become Ready or merge automatically.
