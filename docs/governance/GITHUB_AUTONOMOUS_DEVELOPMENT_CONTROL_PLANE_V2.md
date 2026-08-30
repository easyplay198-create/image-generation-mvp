# GitHub autonomous development control plane V2

## Status and hard boundary

- Repository: `easyplay198-create/image-generation-mvp` (ID `1328682481`)
- Human owner: `easyplay198-create` (`User`, ID `268785207`)
- Authoritative branch: `main`
- Historical Windows audit path: `E:\\EASY_PLAY_DEV_WORKSPACES_DISPOSABLE\\_audit_control\\AI_VISION_V5_S1B` (read-only evidence; never a development source)
- V2 mode: `OBSERVER_ONLY`
- Observer state: `ACTIVE_POST_MERGE_NO_WRITE_SMOKE_VERIFIED`
- Automatic repair/Codex dispatch: `DISABLED`
- Effective automated repair limit: `0`
- Default product phase: `P2_LOCKED`
- Task-scoped P2 phases: `P2_DRAFT_ONLY` and the narrower `P2_AUTH_DRAFT_ONLY` (owner-approved exact Draft PR only)
- Auto-merge: `DISABLED`
- Merge authority: human only

V2 adds a deterministic, fail-closed metadata observer to V1. It does not make GitHub comments transactional, does not create a writer, and never grants merge authority. The repository default remains `P2_LOCKED`. A separately owner-approved `P2_IMPLEMENTATION` task may enter only `P2_DRAFT_ONLY`; the narrower S1E profile may use only `P2_AUTH_IMPLEMENTATION + P2_AUTH_DRAFT_ONLY`. Both are exact Draft-PR authorizations, not global phase switches or permission to mark Ready or merge. V2 supersedes V1 for new tasks; V1 remains historical context.

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

The Issue contains exactly one hidden marker. Locked ordinary and control-plane tasks use only these keys:

```text
<!-- CONTROL_PLANE_V2_CONTRACT_BEGIN
{"allowedPaths":["exact/repository/file"],"authorizedBaseSha":"40-or-64-character-lowercase-commit-sha","maxRepairRounds":0,"phase":"P2_LOCKED","requiredChecks":["Quality gates"],"schema":"github-autonomous-control-v2","taskClass":"ORDINARY_TASK"}
CONTROL_PLANE_V2_CONTRACT_END -->
```

An owner-approved P2 task uses the same schema plus one exact branch binding:

```text
<!-- CONTROL_PLANE_V2_CONTRACT_BEGIN
{"allowedPaths":["exact/repository/file"],"authorizedBaseSha":"40-or-64-character-lowercase-commit-sha","authorizedHeadRef":"issue-number-unique-p2-branch","maxRepairRounds":0,"phase":"P2_DRAFT_ONLY","requiredChecks":["Quality gates"],"schema":"github-autonomous-control-v2","taskClass":"P2_IMPLEMENTATION"}
CONTROL_PLANE_V2_CONTRACT_END -->
```

The S1E authentication profile uses the same exact keys with `taskClass` equal to `P2_AUTH_IMPLEMENTATION` and `phase` equal to `P2_AUTH_DRAFT_ONLY`. It remains branch-bound, owner-created, Draft-only and zero-repair.

The accepted task/phase pairs are exactly `ORDINARY_TASK + P2_LOCKED`, `CONTROL_PLANE_CHANGE + P2_LOCKED`, `P2_IMPLEMENTATION + P2_DRAFT_ONLY`, and `P2_AUTH_IMPLEMENTATION + P2_AUTH_DRAFT_ONLY`. Paths are exact, case-sensitive, NFC-normalized repository-relative files. Absolute paths, backslashes, empty segments, `.`/`..`, globs, regular expressions, and duplicates are rejected. The allowlist and final changed-path set must match exactly; a rename requires both paths. Only `CONTROL_PLANE_CHANGE` may change any root or nested `AGENTS.md`/`AGENTS.override.md`, `CODEOWNERS`, `.github/**`, or `docs/governance/**`, and its allowlist may contain only protected paths. `CONTROL_PLANE_CHANGE` and both P2 implementation classes must declare zero automated repair rounds.

The approved visible body of a P2 Issue may separately authorize at most one human-orchestrated corrective update after the initial implementation. The Issue-body digest binds that limit, but the read-only observer cannot count or dispatch it. It must remain within the same Issue, branch, Draft PR, exact allowlist, dependencies, and frozen semantics; a second correction or any expansion returns `HOLD`. This does not change `maxRepairRounds: 0`, `effectiveAutoFixLimit: 0`, or the disabled writer.

### One-time P2 pre-publication replacement

The prohibition on parallel tasks has one narrower exception for an unpublished P2 failure. A human owner may authorize exactly one replacement Issue only when the predecessor is closed `HOLD / not_planned`, its visible human corrective-update limit is exhausted, its remote task branch still points exactly to its authorized base SHA, and no pull request has ever existed from that head ref across any state or base branch. These facts prove that no implementation commit or PR was published from the predecessor; the predecessor must never reopen.

The predecessor's `authorizedBaseSha` remains its immutable `predecessorLineageBaseSha`: it proves the unpublished lineage and must still equal the predecessor remote head, but it is not copied into the replacement contract. The replacement's `authorizedBaseSha` must instead equal the exact stable current default-branch SHA captured by two unchanged reads after every explicitly approved enabling control-plane PR has merged. The replacement Issue, approval, branch creation, PR base, and CI identity must all bind that current-main authorization base.

The direct comparison from `predecessorLineageBaseSha` to the replacement's current-main authorization base must be a strict forward lineage containing only the explicitly named enabling `CONTROL_PLANE_CHANGE` merges, and its combined changed-path set must contain only the exact protected governance paths approved for those merges. For the Issue #34 lineage, the frozen pre-clarification comparison from `47d4e74ca2e752e6888c15078a3bc09eb58b9e8d` to `c74a76143a4594054ef44e37fc66501f07728411` contains only merged PR #36 and exactly `AGENTS.md`, `docs/governance/GITHUB_AUTONOMOUS_DEVELOPMENT_CONTROL_PLANE_V2.md`, and `docs/governance/V5_P2_ENTRY_GOVERNANCE.md`. After this clarification is merged, its merge may be the only additional named control-plane merge before the replacement base is captured, and the combined changed-path set must still equal those same three files. Any other commit or path returns `HOLD`.

The replacement must otherwise preserve the predecessor's task class, phase, exact path allowlist, exact dependencies, migration count, and frozen product/security semantics. It may only incorporate compatibility knowledge learned from the failed unpublished attempt. It uses a new historically unique head ref and a new current-digest owner approval, records both bases, every enabling governance PR and merge SHA, the predecessor Issue/ref, plus the failed command, exit code, and failure class, and declares both `maxRepairRounds: 0` and a visible human corrective-update limit of zero. Any default-branch advance after the stable capture returns `HOLD` and requires a new explicit control decision; it never permits a silent rebase. Failure of the replacement is final `HOLD`; no second replacement, sibling task, branch reuse, force-push, predecessor reopening, or published-PR bypass is allowed.

This exception does not create a writer, repair round, retry, Ready state, merge authority, deployment authority, or permission for production data, credentials, real email, or business providers. The V2 observer validates only the replacement task's ordinary exact metadata and CI evidence; it does not infer replacement lineage. Until direct human review records all eligibility evidence, handback must include `PREPUBLICATION_REPLACEMENT_ELIGIBILITY` in `UNVERIFIED_ITEMS`.

`requiredChecks` contains only the PR-head check that the evaluator directly validates: `Quality gates`. `Autonomous control gate` is only the fixed observer job identity; it is not a PR-head required/protected status check and must never be configured or represented as one.

The visible Issue fields are human context. The hidden contract becomes the machine source only after the owner approves the digest of the entire final body. Machine verification of visible-field semantic equivalence remains explicitly unverified.

### Owner approval

Exactly one current-digest approval must exist as an unedited owner comment. Locked tasks use:

```text
<!-- CONTROL_PLANE_V2_APPROVAL_BEGIN
{"authorizedBaseSha":"40-or-64-character-lowercase-commit-sha","issueBodySha256":"64-character-lowercase-sha256","maxRepairRounds":0,"phase":"P2_LOCKED","schema":"github-autonomous-control-v2"}
CONTROL_PLANE_V2_APPROVAL_END -->
```

P2 tasks use the same approval plus the exact pre-authorized branch:

```text
<!-- CONTROL_PLANE_V2_APPROVAL_BEGIN
{"authorizedBaseSha":"40-or-64-character-lowercase-commit-sha","authorizedHeadRef":"issue-number-unique-p2-branch","issueBodySha256":"64-character-lowercase-sha256","maxRepairRounds":0,"phase":"P2_DRAFT_ONLY","schema":"github-autonomous-control-v2"}
CONTROL_PLANE_V2_APPROVAL_END -->
```

The author must match owner ID, login, type, and `OWNER` association. Non-owner marker text is ignored. A well-formed older owner approval may remain as history after an Issue edit, but the current digest must have exactly one approval. The current approval must exactly bind contract phase, base, body digest, repair limit, and—only for P2—head ref. Malformed or edited owner markers return `HOLD`.

Locked-task approvals do not bind a PR number or head ref; this remains an explicit unverified item and a hard blocker for any future writer. A P2 approval pre-binds the exact head ref and the observer also requires an owner-created PR plus historical branch-name uniqueness. Neither shape creates a writer.

### Pull-request link

The initially Draft PR contains exactly one marker:

```text
<!-- CONTROL_PLANE_V2_LINK_BEGIN
{"approvalCommentId":0,"authorizedBaseSha":"replace","issueBodySha256":"replace","issueNumber":0,"schema":"github-autonomous-control-v2"}
CONTROL_PLANE_V2_LINK_END -->
```

The linked object must be a real open Issue, not another PR. The PR must be open, Draft, same-repository, based on `main`, and use the authorized base SHA. The branch name must be unique across all PR states and all base branches; reusing a historical PR branch fails closed. For `P2_IMPLEMENTATION`, the PR creator must match the stable owner identity and its head ref must exactly match contract and approval. If a human later marks it ready, every previous observation becomes historical and a subsequent reconcile returns `HOLD` under this current-state contract.

### Reserved ledger marker

V2 parses `CONTROL_PLANE_V2_LEDGER` only when the comment author exactly matches `github-actions[bot]` (`Bot`, ID `41898282`). It rejects edited, malformed, duplicate-trigger, duplicate-head, duplicate-round, or non-contiguous trusted evidence. Non-bot marker text is ignored so public comments cannot create a marker denial of service. Any valid trusted ledger entry still returns `LEDGER_PRESENT_WHILE_WRITER_DISABLED`; V2 neither writes a ledger nor posts `@codex`.

## Trusted observer workflow

After merge, `.github/workflows/autonomous-control-gate-v2.yml` has only two entry points:

- completion of the frozen `CI` workflow;
- a PR conversation comment whose body is exactly `CONTROL_PLANE_V2_RECONCILE`, posted by the stable owner identity.

The workflow is loaded from the default branch and checks out the immutable `github.workflow_sha` containing that workflow definition. It has read-only `actions`, `checks`, `contents`, `issues`, and `pull-requests` permissions, no secret access, and no artifact/cache restore. It never checks out or executes PR-head code. The currently merged observer has historical post-merge no-write smoke evidence. A later control-plane PR cannot run its proposed PR-head evaluator in this privileged observer; existing `CI` separately parses and tests the proposed scripts, and that proposed revision remains unactivated until a human merge plus a new post-merge no-write smoke.

The qualifying observer job uses repository-wide queued concurrency to reduce overlap, but concurrency is not treated as idempotency. Keeping it at job level prevents untrusted comments that fail the owner/exact-command condition from occupying the control queue. Mutable authority and CI metadata are read twice, followed by one final PR identity read. Any change produces `SNAPSHOT_CHANGED_DURING_READ` or `FINAL_PR_CHANGED_DURING_READ`.

## Deterministic gates

The observer returns `HOLD` unless all applicable checks pass:

1. Repository, owner, default branch, and GraphQL `autoMergeAllowed=false` identity.
2. Open owner-created Issue, unambiguous JSON markers, no duplicate JSON keys, current body digest, and one current owner approval.
3. Open same-repository Draft PR, exact authorized base, historically unique head branch across all PR states and bases, and bound PR marker. Both P2 implementation classes additionally require the stable owner as PR creator and an exact pre-approved head ref.
4. Literal changed-path equality plus immutable base/head commit and recursive-tree identity.
5. Exact added/removed/modified/renamed endpoint modes; no symlink (`120000`) or submodule (`160000`) change.
6. Exact owner reconciliation actor/command, or exact `CI` workflow-run identity and current head.
7. CI workflow ID/name/path/event, branch, repository IDs, exact head, creation time, terminal status, and untruncated run/job collections. The selected run must not predate the current owner approval, and its deterministic `run-name` must exactly encode the current PR number, authorized base SHA, and head SHA.
8. Check Suite ID, GitHub Actions App identity, repository, branch, head, `after`, status, and conclusion. GitHub may omit the suite's PR record; the unique open-PR lookup plus workflow-run and job identities then provide the binding. If a suite PR record is present, it must exactly match the current number/base/head/repositories.
9. A fully paginated PR timeline with no base change, close/reopen, ref deletion/restoration, or base/head force-push event at or after the selected CI run was created. Combined with the `CI` workflow's `main` base filter, approval-time rule, and exact event-derived run name, this prevents a historical run from being accepted for another PR/base/head lifecycle.
10. Exactly one completed `Quality gates` job bound to run ID, attempt, head, and workflow conclusion.
11. Reserved ledger ambiguity, every lifecycle/package change outside the exact S1E root npm pair, unapproved or out-of-scope P2 work, secret access, permission expansion, API/GraphQL errors, pagination, or snapshot races all fail closed.
12. If a P2 diff touches `prisma/`, the machine requires exactly a modified regular-file `prisma/schema.prisma`, one added regular-file `prisma/migrations/<14-digit timestamp>_p2_<slug>/migration.sql`, no other `prisma/` path, and at least one changed exact path under `tests/integration/` ending in `.test.ts`. This proves shape only, not additive SQL semantics.
13. A `P2_AUTH_IMPLEMENTATION` diff must satisfy `V5_P2_S1E_AUTH_CONTRACT.md`, modify exactly the root `package.json` and root `package-lock.json` lifecycle pair, use exactly one `_p2_auth_` migration plus an integration test, and contain no protected path. Dependency contents and security semantics remain human-review items.

Only `success` and `failure` are accepted terminal CI conclusions. Locked-task success produces `CI_ACCEPTED_OBSERVER_ONLY`. P2 success produces `P2_DRAFT_ONLY_CI_ACCEPTED_OBSERVER_ONLY`, keeps `CONTROL_STATE=OBSERVER_ONLY`, reports `P2_STATUS=DRAFT_ONLY`, and requires `KEEP_DRAFT`; it is not semantic acceptance or merge authorization. Failure produces `HOLD` and never dispatches a repair.

## Fixed execution and credential boundary

Issue, PR, review, log, and artifact text are untrusted and never executed. V2 does not use `openai/codex-action`, an OpenAI API key, Qwen, S3, production databases, user credentials, paid providers, business providers, external downloads, PR caches, or artifacts. CI-only dummy values and its isolated PostgreSQL service remain test fixtures, not project credentials.

## Task-scoped P2 additive database exception

The upstream P1 contract requires additive expansion before the P2 domain objects can be persisted. A separately owner-approved P2 Issue may therefore include the exact database-change shape in gate 12 only after it freezes the applicable physical PostgreSQL DDL, including tables, columns, indexes, composite foreign keys, uniqueness, and immutability enforcement.

The new migration may be applied only by fixed Quality gates to fresh and repeated disposable isolated PostgreSQL. It must not edit migration history or perform a destructive or narrowing change, DML/backfill, historical conversion, cutover, reset, down migration, shared-database application, or production migration. The metadata observer does not parse SQL or prove those semantics, so `P2_DATABASE_MIGRATION_SEMANTICS` remains an explicit human-review item whenever the exception is used. Ready and merge still require a separate human decision.

## Mandatory `HOLD`

- Any actor, identity, association, digest, base, PR, head, workflow, Check Suite, job, path, tree, mode, ledger, repair-budget, pagination, GraphQL, API, or two-read mismatch.
- Edited, missing, duplicated, stale, deleted, malformed, or conflicting trusted evidence.
- A non-control-plane task touching a protected path; a control-plane allowlist containing a non-protected path; or a control-plane/P2 task declaring nonzero automated repair rounds.
- Any task/phase pair outside the four frozen pairs; P2 without exact owner/branch/approval binding; P2 outside `V5_P2_ENTRY_GOVERNANCE.md`; authentication work outside `V5_P2_S1E_AUTH_CONTRACT.md`; a P2 migration that is unapproved or shape-invalid; any other migration lacking dedicated owner approval; a database change without human semantic review; destructive action, real secret, permission expansion, external write, provider call, or semantic ambiguity.
- Any claimed pre-publication replacement whose predecessor is not closed `HOLD / not_planned`, whose remote head differs from its predecessor-lineage base, whose head ref has any PR history, whose predecessor may reopen, whose replacement base is not the stable current `main`, whose lineage-to-current-base comparison contains an unnamed merge or unapproved path, whose class/phase/paths/dependencies/migration count/semantics differ, whose replacement permits a human correction, whose lineage evidence is ambiguous, whose captured `main` later advances, or which is a second replacement.
- Any automatic-repair, ready-for-review, push, auto-merge, or merge request.
- Any assertion that branch protection, owner-review/no-bypass, visible-field semantics, PR/head-bound approval, observer activation, or observer required-check status is established without direct evidence.

## Activation and handback

The currently merged observer and its post-merge no-write smoke are established historical evidence. Every proposed control-plane revision remains unactivated until its own human merge and post-merge no-write smoke. Separately verify branch protection for `Quality gates`, owner review/no-bypass behavior, the human semantic review that a P2 change matches its exact vertical slice, and `PREPUBLICATION_REPLACEMENT_ELIGIBILITY` whenever the one-time exception is used. The observer does not publish a protected result on the PR head and must not be configured or represented as such. Because the read-only metadata API does not expose exact shell-command exit codes, observer output marks those as unverified; the human task handback must report the commands and real exit codes from direct execution evidence.

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
REQUESTED_AUTOMATED_REPAIR_LIMIT=0
AUTO_FIX_ROUND_COUNT=0
HUMAN_CORRECTION_ROUND_COUNT=UNVERIFIED_FROM_READ_ONLY_GITHUB_METADATA
P2_STATUS=LOCKED|DRAFT_ONLY
OPERATION_PATH=
OUTPUT_PATH=
UNVERIFIED_ITEMS=
HUMAN_ACTION_REQUIRED=
```
