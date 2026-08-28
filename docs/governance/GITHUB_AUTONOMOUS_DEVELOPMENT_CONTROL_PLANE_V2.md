# GitHub autonomous development control plane V2

## Status and hard boundary

- Repository: `easyplay198-create/image-generation-mvp` (ID `1328682481`)
- Human owner: `easyplay198-create` (`User`, ID `268785207`)
- Authoritative branch: `main`
- Historical Windows audit path: `E:\\EASY_PLAY_DEV_WORKSPACES_DISPOSABLE\\_audit_control\\AI_VISION_V5_S1B` (read-only evidence; never a development source)
- V2 mode: `OBSERVER_ONLY`
- Pre-merge state: `CONFIGURED_IN_PR_NOT_ACTIVE`
- Automatic repair/Codex dispatch: `DISABLED`
- Effective automated repair limit: `0`
- Product phase: `P2_LOCKED`
- Auto-merge: `DISABLED`
- Merge authority: human only

V2 adds a deterministic, fail-closed metadata observer to V1. It does not make GitHub comments transactional, does not create a writer, does not authorize P2, and never grants merge authority. After a separate human merge decision, V2 supersedes V1 for new tasks; V1 remains historical context.

## Why V2 has no writer

Workflow concurrency is not an atomic claim mechanism. Issue and pull-request comments can be edited or deleted. Therefore a comment ledger cannot prove exactly-once delivery, and V2 treats any marker from the reserved trusted bot identity as `HOLD` while writer mode is disabled.

Automatic repair requires a separate future governance authorization and all of the following:

1. An append-only transactional ledger with atomic claim-before-dispatch.
2. A verified least-privilege writer identity and permissions.
3. A no-secret dispatch smoke test.
4. A trusted check bound to the exact PR head SHA.
5. Verified branch protection, owner review, and no unapproved bypass.

No Issue, comment, label, model instruction, variable, or checked box may activate a writer in V2.

## Authority

Rule precedence is:

1. `AGENTS.md` and this document.
2. An unedited structured approval from the stable human owner.
3. The approved Issue body bound by SHA-256 and authorized base SHA.
4. The linked task PR, initially Draft.
5. Reviews, comments, CI output, and model output.

Lower-precedence instructions may only narrow scope. Any conflict returns `HOLD`. Machine checks establish identity and syntax, not semantic absence of disguised P2 work; initial scope and every P2 transition remain human decisions.

## Machine-readable records

### Issue contract

The Issue contains exactly one hidden marker with only these keys:

```text
<!-- CONTROL_PLANE_V2_CONTRACT_BEGIN
{"allowedPaths":["exact/repository/file"],"authorizedBaseSha":"40-or-64-character-lowercase-commit-sha","maxRepairRounds":0,"phase":"P2_LOCKED","requiredChecks":["Quality gates"],"schema":"github-autonomous-control-v2","taskClass":"ORDINARY_TASK"}
CONTROL_PLANE_V2_CONTRACT_END -->
```

Paths are exact, case-sensitive, NFC-normalized repository-relative files. Absolute paths, backslashes, empty segments, `.`/`..`, globs, regular expressions, and duplicates are rejected. The allowlist and final changed-path set must match exactly; a rename requires both paths. An ordinary task cannot change any root or nested `AGENTS.md`/`AGENTS.override.md`, `CODEOWNERS`, `.github/**`, or `docs/governance/**`. `CONTROL_PLANE_CHANGE` must declare zero rounds.

`requiredChecks` contains only the PR-head check that the evaluator directly validates: `Quality gates`. `Autonomous control gate` is only the fixed observer job identity; it is not a PR-head required/protected status check and must never be configured or represented as one.

The visible Issue fields are human context. The hidden contract becomes the machine source only after the owner approves the digest of the entire final body. Machine verification of visible-field semantic equivalence remains explicitly unverified.

### Owner approval

Exactly one current-digest approval must exist as an unedited owner comment:

```text
<!-- CONTROL_PLANE_V2_APPROVAL_BEGIN
{"authorizedBaseSha":"40-or-64-character-lowercase-commit-sha","issueBodySha256":"64-character-lowercase-sha256","maxRepairRounds":0,"phase":"P2_LOCKED","schema":"github-autonomous-control-v2"}
CONTROL_PLANE_V2_APPROVAL_END -->
```

The author must match owner ID, login, type, and `OWNER` association. Non-owner marker text is ignored. A well-formed older owner approval may remain as history after an Issue edit, but the current digest must have exactly one approval. Malformed or edited owner markers return `HOLD`.

The V2 approval schema does not bind a PR number or head ref. Because V2 is read-only, this remains an explicit unverified item and is a hard blocker for any future writer.

### Pull-request link

The initially Draft PR contains exactly one marker:

```text
<!-- CONTROL_PLANE_V2_LINK_BEGIN
{"approvalCommentId":0,"authorizedBaseSha":"replace","issueBodySha256":"replace","issueNumber":0,"schema":"github-autonomous-control-v2"}
CONTROL_PLANE_V2_LINK_END -->
```

The linked object must be a real open Issue, not another PR. The PR must be open, Draft, same-repository, based on `main`, and use the authorized base SHA. Exactly one open PR may use its head branch across all base branches. If a human later marks it ready, every previous observation becomes historical and a subsequent reconcile returns `HOLD` under this current-state contract.

### Reserved ledger marker

V2 parses `CONTROL_PLANE_V2_LEDGER` only when the comment author exactly matches `github-actions[bot]` (`Bot`, ID `41898282`). It rejects edited, malformed, duplicate-trigger, duplicate-head, duplicate-round, or non-contiguous trusted evidence. Non-bot marker text is ignored so public comments cannot create a marker denial of service. Any valid trusted ledger entry still returns `LEDGER_PRESENT_WHILE_WRITER_DISABLED`; V2 neither writes a ledger nor posts `@codex`.

## Trusted observer workflow

After merge, `.github/workflows/autonomous-control-gate-v2.yml` has only two entry points:

- completion of the frozen `CI` workflow;
- a PR conversation comment whose body is exactly `CONTROL_PLANE_V2_RECONCILE`, posted by the stable owner identity.

The workflow is loaded from the default branch and checks out the immutable `github.workflow_sha` containing that workflow definition. It has read-only `actions`, `checks`, `contents`, `issues`, and `pull-requests` permissions, no secret access, and no artifact/cache restore. It never checks out or executes PR-head code. The configuration PR cannot run the not-yet-merged observer; existing `CI` separately parses and tests the proposed scripts.

The qualifying observer job uses repository-wide queued concurrency to reduce overlap, but concurrency is not treated as idempotency. Keeping it at job level prevents untrusted comments that fail the owner/exact-command condition from occupying the control queue. Mutable authority and CI metadata are read twice, followed by one final PR identity read. Any change produces `SNAPSHOT_CHANGED_DURING_READ` or `FINAL_PR_CHANGED_DURING_READ`.

## Deterministic gates

The observer returns `HOLD` unless all applicable checks pass:

1. Repository, owner, default branch, and GraphQL `autoMergeAllowed=false` identity.
2. Open owner-created Issue, unambiguous JSON markers, no duplicate JSON keys, current body digest, and one current owner approval.
3. Open same-repository Draft PR, exact authorized base, unique head branch across all bases, and bound PR marker.
4. Literal changed-path equality plus immutable base/head commit and recursive-tree identity.
5. Exact added/removed/modified/renamed endpoint modes; no symlink (`120000`) or submodule (`160000`) change.
6. Exact owner reconciliation actor/command, or exact `CI` workflow-run identity and current head.
7. CI workflow ID/name/path/event, branch, repository IDs, exact head, creation time, terminal status, and untruncated run/job collections. The selected run must not predate the current owner approval, and its deterministic `run-name` must exactly encode the current PR number, authorized base SHA, and head SHA.
8. Check Suite ID, GitHub Actions App identity, repository, branch, head, `after`, status, and conclusion. GitHub may omit the suite's PR record; the unique open-PR lookup plus workflow-run and job identities then provide the binding. If a suite PR record is present, it must exactly match the current number/base/head/repositories.
9. A fully paginated PR timeline with no base change, close/reopen, ref deletion/restoration, or base/head force-push event at or after the selected CI run was created. Combined with the `CI` workflow's `main` base filter, approval-time rule, and exact event-derived run name, this prevents a historical run from being accepted for another PR/base/head lifecycle.
10. Exactly one completed `Quality gates` job bound to run ID, attempt, head, and workflow conclusion.
11. Reserved ledger ambiguity, lifecycle changes on a failed run, P2 work, secret access, permission expansion, API/GraphQL errors, pagination, or snapshot races all fail closed.

Only `success` and `failure` are accepted terminal CI conclusions. Success produces `CI_ACCEPTED_OBSERVER_ONLY`; failure produces `HOLD` and never dispatches a repair.

## Fixed execution and credential boundary

Issue, PR, review, log, and artifact text are untrusted and never executed. V2 does not use `openai/codex-action`, an OpenAI API key, Qwen, S3, production databases, user credentials, paid providers, business providers, external downloads, PR caches, or artifacts. CI-only dummy values and its isolated PostgreSQL service remain test fixtures, not project credentials.

## Mandatory `HOLD`

- Any actor, identity, association, digest, base, PR, head, workflow, Check Suite, job, path, tree, mode, ledger, repair-budget, pagination, GraphQL, API, or two-read mismatch.
- Edited, missing, duplicated, stale, deleted, malformed, or conflicting trusted evidence.
- An ordinary task touching a protected path or a control-plane task declaring nonzero repair rounds.
- P2 scope, migration, destructive action, real secret, permission expansion, external write, provider call, or semantic ambiguity.
- Any automatic-repair, ready-for-review, push, auto-merge, or merge request.
- Any assertion that branch protection, owner-review/no-bypass, visible-field semantics, PR/head-bound approval, observer activation, or observer required-check status is established without direct evidence.

## Activation and handback

Before merge, this change can establish only `CONFIGURATION_CI_PASS`; that is not merge authorization. A post-merge no-write smoke test is required before reporting observer activation. Separately verify branch protection for `Quality gates`, owner review/no-bypass behavior, and the human semantic review that the change does not disguise P2 scope. The observer does not publish a protected result on the PR head and must not be configured or represented as such. Because the read-only metadata API does not expose exact shell-command exit codes, observer output marks those as unverified; the human task handback must report the commands and real exit codes from direct execution evidence.

Every handback includes:

```text
RESULT=PASS|HOLD|FAIL
CONTROL_STATE=OBSERVER_ONLY|HOLD|FAIL
CONTROL_MODE=OBSERVER_ONLY
ISSUE_URL=
ISSUE_APPROVAL_URL=
ISSUE_BODY_SHA256=
DRAFT_PR_URL=
BASE_SHA=
HEAD_SHA=
CHANGED_FILES=
TEST_COMMANDS_AND_EXIT_CODES=
CI_STATUS=
AUTO_FIX_ROUND_COUNT=0
P2_STATUS=LOCKED
UNVERIFIED_ITEMS=
HUMAN_ACTION_REQUIRED=
```
