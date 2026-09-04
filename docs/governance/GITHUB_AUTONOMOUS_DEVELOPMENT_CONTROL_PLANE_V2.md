# GitHub autonomous development control plane V2

## Status and hard boundary

- Repository: `easyplay198-create/image-generation-mvp` (ID `1328682481`)
- Human owner: `easyplay198-create` (`User`, ID `268785207`)
- Authoritative branch: `main`
- Historical Windows audit path: `E:\\EASY_PLAY_DEV_WORKSPACES_DISPOSABLE\\_audit_control\\AI_VISION_V5_S1B` (read-only evidence; never a development source)
- V2 mode: `OBSERVER_ONLY`
- Observer state: `ACTIVE_OPEN_DRAFT_PR_READ_ONLY`
- Automatic repair/Codex dispatch: `DISABLED`
- Effective automated repair limit: `0`
- Maximum owner-authorized worktree-local corrections: `5`
- Maximum owner-authorized published Draft-PR corrections: `2`
- Default product phase: `P2_LOCKED`
- Task-scoped P2 phases: `P2_DRAFT_ONLY` and the narrower `P2_AUTH_DRAFT_ONLY` (owner-approved exact Draft PR only)
- Auto-merge: `DISABLED`
- Merge authority: human only

V2 adds a deterministic, fail-closed metadata observer to V1. It does not make GitHub comments transactional, does not create a writer, and never grants merge authority. The repository default remains `P2_LOCKED`. Separately approved P2 tasks may enter only their exact Draft-only phases. A zero automated-repair contract may still authorize bounded human-orchestrated worktree and Draft-PR corrections because those actions occur under the original exact scope and are never dispatched by the observer. V2 supersedes V1 for new tasks; V1 remains historical context.

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

The approved visible body of a P2 Issue may authorize bounded convergence while the machine contract continues to declare `maxRepairRounds: 0`. The read-only observer never dispatches, pushes, or repairs. The human-audited budgets are separate: at most five worktree-local corrections before the first published implementation commit, and at most two human-orchestrated corrections after the initially Draft PR exists. Every correction remains inside the same Issue, worktree, non-force branch, Draft PR, exact allowlist, dependency set, migration count, and frozen semantics, and must rerun the fixed validation gates. The Issue-body digest binds both limits; the observer reports their counts as unverified.

### Failure classification and bounded convergence

- `BLOCKED_ENVIRONMENT`: deterministic dependency, worktree, toolchain, or ignored generated-content preparation failed without tracked dependency or lockfile-semantic drift. Restore the same task environment and continue; this does not consume an implementation correction.
- `RETRY_LOCAL`: lint, strict typecheck, unit/integration test, migration check, build, or diff validation failed before the first published implementation commit. Correct only the direct failure inside the allowlist and consume one of at most five local corrections.
- `RETRY_CI`: the exact Draft-PR head failed a fixed Quality gate. Correct only the direct failure on the same non-force branch and Draft PR and consume one of at most two published corrections.
- `HOLD_SCOPE`: a required path, dependency, migration, capability, or semantic change is outside the approved contract.
- `HOLD_SECURITY`: a real secret, production/shared resource, destructive migration, paid/business provider, permission expansion, or unauthorized external write is required or observed.
- `FAIL_FINAL`: a bounded correction budget is exhausted or an acceptance criterion is impossible inside the frozen scope.

Every iteration rechecks changed paths, lifecycle files, dependency versions, migration shape, secrets, and diff integrity. Nothing is published until the fixed local lint, typecheck, tests, applicable integration/migration checks, build, and `git diff --check` all succeed. Ordinary recoverable feedback must not create a sibling Issue, replacement branch, or error-specific governance PR.

### Historical task transition

The earlier unpublished-replacement and one-time environment-resumption rules are historical evidence, not the active recovery mechanism after the final simplification is ordinarily merged and `Quality gates` succeeds for the resulting exact `main` push. Issue #39 is the only closed historical task eligible for one owner-approved transition: bind a twice-read stable new `main`, preserve the same branch, exact fourteen paths, exact dependency versions, single `_p2_auth_` migration and frozen S1E semantics, and fast-forward without force. Its preserved local draft may then continue under the bounded local budget, including correction of the recorded Auth.js `handlers` GET/POST export binding and later ordinary validation feedback. It must not create another Issue, replacement branch, migration, dependency, or governance exception.

`requiredChecks` contains only the PR-head check that the evaluator directly validates: `Quality gates`. `Autonomous control gate` is only the fixed observer job identity; it is not a PR-head required/protected status check and must never be configured or represented as one.

The visible Issue fields are human context. The hidden contract becomes the machine source only after the owner approves the digest of the entire final body. Machine verification of visible-field semantic equivalence remains explicitly unverified.

### Owner approval

The initially Draft PR selects exactly one current approval by `approvalCommentId`. That exact comment must be an unedited owner comment for the current Issue digest. Locked tasks use:

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

The linked author must match owner ID, login, type, and `OWNER` association. The linked comment must be unedited and must exactly bind contract phase, base, body digest, repair limit, and—only for P2—head ref. A second well-formed approval for the same current digest is ambiguous and returns `HOLD`. Unlinked historical markers remain audit evidence; malformed, edited, or obsolete unlinked markers neither authorize nor poison the current task. Linking any malformed, edited, stale, deleted, non-owner, or mismatched approval returns `HOLD`.

The PR link binds the approval comment ID, Issue number, body digest and base. Locked-task approvals still do not pre-bind a head ref; this remains an explicit unverified item and a hard blocker for any future writer. A P2 approval pre-binds the exact head ref and the observer also requires an owner-created PR plus historical branch-name uniqueness. Neither shape creates a writer.

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

The workflow is loaded from the default branch and checks out the immutable `github.workflow_sha` containing that workflow definition. It has read-only `actions`, `checks`, `contents`, `issues`, and `pull-requests` permissions, no secret access, and no artifact/cache restore. It never checks out or executes PR-head code. A control-plane PR cannot run its proposed PR-head evaluator in this privileged observer; existing `CI` separately parses and tests the proposed scripts. A control-plane revision becomes active only after exact human semantic review, an explicitly authorized ordinary merge commit, and successful `Quality gates` for the resulting exact `main` push. Because the observer job intentionally accepts only pull-request CI or an exact owner reconcile on an open PR, a workflow-run job skipped solely for an upstream `main` push is expected and is neither `PASS` nor `HOLD`; no post-merge live-PR observer result is an activation prerequisite.

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

The new migration may be applied only by fixed Quality gates to fresh and repeated disposable isolated PostgreSQL. It must not edit migration history or perform a destructive or narrowing change, DML/backfill, historical conversion, cutover, reset, down migration, shared-database application, or production migration. The metadata observer does not parse SQL or prove those semantics, so `P2_DATABASE_MIGRATION_SEMANTICS` remains an explicit semantic-review item whenever the exception is used. Outside the exact active autonomous-program successor rule below, Ready and merge still require a separate human decision.

## One-time P2 S1I compatibility DDL exception

`P2_S1I_COMPAT_DDL_V1` is registered only by child ordinal 2 of `AI_VISION_V5_S1I_AUTONOMOUS_DELIVERY_V1`. Its complete contract is the unique `P2_S1I_COMPLETE_CONTRACT_BEGIN/END` section in `V5_P2_ENTRY_GOVERNANCE.md`. Registration is `PROPOSED_INACTIVE` until the exact ordinal-2 one-parent squash merge and successful exact-main-push `Quality gates`; it then becomes `AVAILABLE`.

Only ordinal 3 of the same still-active delegation may request `CONSUME`, and it must bind the registration merge SHA, a new unique branch, the exact nine-path allowlist, one exact migration, and the registered contract digest. A candidate visible compatibility binding is not valid merely because it exists. It is valid only when the latest owner Issue body has exactly one canonical program-child binding whose digest and resource request match the latest body, the immutable PR1 delegation, the AVAILABLE registration, and the unique Draft PR link. Candidate and valid counts are evaluated separately. The program evaluator's complete twice-read history must find exactly one valid binding and no prior consumption. A pre-merge close or expiry changes `BOUND` to terminal `EXPIRED`; exact merge plus successful main-push CI changes it to terminal `CONSUMED`. `BOUND` never returns to `AVAILABLE`, and reopening never restores `EXPIRED`.

The only replacement operations are the same-transaction, same-name, validated replacements of `P2DomainEvent_type_check` and `P2DomainEvent_body_check`, and property-preserving `CREATE OR REPLACE FUNCTION public.p2_guard_asset_task_change()`. The type CHECK independently and the combined CHECK predicates must be strict supersets; the body CHECK must preserve every old result throughout the old type domain. Function OID, owner, ACL, proconfig, identity attributes, and `AssetTask_guard_change_trigger` binding remain unchanged. The mapping `GenerationAttempt.status=AMBIGUOUS` plus `AssetTask.status=HARD_BLOCKED` is P1-enum-compatible and owner-frozen for S1I, not a P1-mandated cross-object mapping.

The migration is one explicit `BEGIN`/`COMMIT` transaction containing every approved DDL statement and exactly one rollback-probe sentinel. New JSONB object operations are isolated by `CASE`. Fresh and immediate-predecessor PostgreSQL 17 fixtures, mid-transaction rollback, catalog/drift reconciliation, and real two-session row-lock proof are mandatory. Every other DROP or REPLACE, historical migration edit, destructive/narrowing operation, DML/backfill, shared/persistent/production database, real Provider/object storage, credential, deployment, force operation, protection bypass, or security weakening remains prohibited.

The actor-condition successor rule is narrow: after PR1 activation, a valid program-child binding plus the exact reviewer, CI, path, budget, resource, lifecycle, and twice-read gates is equivalent to the legacy Owner binding for only that child. `PROGRAM_CHILD_SAFE_TO_READY` permits one ordinary Ready transition; a subsequent exact reconcile result `PROGRAM_CHILD_SAFE_TO_SQUASH_MERGE` permits the Lifecycle Controller to perform one ordinary squash merge. This is not automatic merge and does not relax any non-program Owner/human condition. Ordinal 3's exact merge and successful exact-main-push CI alone consume the resource and terminate the delegation.

## Mandatory `HOLD`

- Any actor, identity, association, digest, base, PR, head, workflow, Check Suite, job, path, tree, mode, ledger, repair-budget, pagination, GraphQL, API, or two-read mismatch.
- A linked approval that is edited, missing, duplicated-current, stale, deleted, malformed, non-owner, or conflicting. Unlinked historical markers are non-authoritative audit evidence.
- A non-control-plane task touching a protected path; a control-plane allowlist containing a non-protected path; or a control-plane/P2 task declaring nonzero automated repair rounds.
- Any task/phase pair outside the four frozen pairs; P2 without exact owner/branch/approval binding; P2 outside `V5_P2_ENTRY_GOVERNANCE.md`; authentication work outside `V5_P2_S1E_AUTH_CONTRACT.md`; a P2 migration that is unapproved or shape-invalid; any other migration lacking dedicated owner approval; a database change without human semantic review; destructive action, real secret, permission expansion, external write, provider call, or semantic ambiguity.
- Any correction beyond the owner-approved local or published budget; any sibling Issue, replacement branch, force-push, new dependency, extra migration, semantic expansion, or publication before all fixed local gates pass.
- Any Issue #39 transition without a twice-read stable post-activation `main`, a current body digest and linked owner approval, the same branch and fourteen paths, exact dependencies, single migration, non-force fast-forward, and preserved frozen S1E semantics.
- Any automatic-repair, ready-for-review, push, auto-merge, or merge request.
- Any assertion that branch protection, owner-review/no-bypass, visible-field semantics, PR/head-bound approval, control-plane activation, or observer required-check status is established without direct evidence.

## Activation and handback

Every proposed control-plane revision remains inactive until exact human semantic review, an explicitly authorized ordinary merge commit, and successful `Quality gates` for the resulting exact `main` push. That main-push run validates the control evaluator syntax and complete tests in the ordinary CI boundary. The live metadata observer remains restricted to open task PRs and is not a post-merge activation mechanism. Separately verify branch protection for `Quality gates`, owner review/no-bypass behavior, the human semantic review that a P2 change matches its exact vertical slice, and the local/published correction counts. The observer does not publish a protected result on the PR head and must not be represented as a writer or merge authority. Because read-only GitHub metadata cannot prove local rounds or exact shell-command exit codes, the human task handback must report them from direct execution evidence.

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
LOCAL_CORRECTION_ROUND_COUNT=UNVERIFIED_FROM_READ_ONLY_GITHUB_METADATA
PUBLISHED_CORRECTION_ROUND_COUNT=UNVERIFIED_FROM_READ_ONLY_GITHUB_METADATA
FAILURE_CLASS=NONE|BLOCKED_ENVIRONMENT|RETRY_LOCAL|RETRY_CI|HOLD_SCOPE|HOLD_SECURITY|FAIL_FINAL
P2_STATUS=LOCKED|DRAFT_ONLY
OPERATION_PATH=
OUTPUT_PATH=
UNVERIFIED_ITEMS=
HUMAN_ACTION_REQUIRED=
```

## Program-scoped single-use autonomy overlay

This overlay is limited to `AI_VISION_V5_S1I_AUTONOMOUS_DELIVERY_V1`. It does not change the legacy path for any other Issue or pull request. The PR1 bootstrap itself continues to require its exact pre-PR1 owner approval, human lifecycle, ordinary squash merge, and successful exact-main-push `Quality gates` before this overlay exists as active governance.

The immutable root record is the unique `PROGRAM_CHILD_BINDING_JSON` block in owner Issue #55. The root record fixes repository ID `1328682481`, the program contract digest, maximum PR count 3, two remaining children, exact permitted/prohibited action sets, root grant/nonce, expiry, authorized PR1 base and branch, and the five-path PR1 allowlist. Its literal pending activation value is resolved only by the exact PR1 squash merge commit and that commit's exact successful main-push CI; an Issue edit does not activate or refresh it.

Each child Issue must contain exactly one canonical LF-only `PROGRAM_CHILD_BINDING_JSON`. Its exact schema is `autonomous-delivery-child-v1` and binds: program/repository/root Issue; ordinal; delegation activation SHA; authorized/expected base; previous merge; unique branch; exact allowlist; risk class; contract and canonical Issue-contract SHA-256; unique grant and nonce; concrete activation/expiry instants; task class; required checks; correction limits; orchestrator session identity; and zero or one declarative named-resource request. The Issue contract digest removes the complete marker block plus its single following LF, then hashes the remaining UTF-8, BOM-free, LF-only text with exactly one final LF. The API readback body digest is separate and is never inserted into the same Issue.

The Draft PR must contain exactly one `PROGRAM_CHILD_LINK_JSON` binding the Issue number, API readback digest, canonical contract digest, ordinal, grant, nonce, activation SHA, base, branch, and actual process-retry/local-correction/published-correction/CI-rerun counts. A failed operation permits at most two process retries; the remaining bounds are fixed by the Issue and program root. All values must equal the Issue binding. Changed paths must equal the allowlist including rename endpoints; symlinks, submodules, protected-path leakage, lifecycle files, extra migrations, and ambiguous tree modes fail closed.

The observer scans all owner Issues and all historical PRs for the program. Root plus observed child ordinals must be exactly contiguous, monotonic, and unique. Every grant ID, grant/nonce pair, branch history, and ordinal is single-use. A prior child counts as consumed only when its unique PR is merged, the merge commit has exactly one parent equal to its bound expected base, and its binding is otherwise exact. Current `main` must still equal the child's expected base.

Independent AI review is recorded by an unedited `PROGRAM_INDEPENDENT_REVIEW_JSON` comment with the exact PR number, exact Head SHA, distinct reviewer session ID, review instant, empty blocking findings, and `PASS`. Ordinal 2 requires exactly one current-Head reviewer; ordinal 3 requires exactly two distinct current-Head reviewers. Any new Head invalidates the comments without exception.

For a Draft PR, an exact successful pull-request `Quality gates` run plus all bindings and reviews yields only `PROGRAM_CHILD_SAFE_TO_READY`. The orchestrator may then perform one ordinary Ready transition. The exact owner `CONTROL_PLANE_V2_RECONCILE` comment causes the immutable default-branch observer to re-read the now-Ready PR; only a second PASS, `PROGRAM_CHILD_SAFE_TO_SQUASH_MERGE`, permits one ordinary squash merge. The observer never writes, dispatches a repair, marks Ready, merges, enables auto-merge, or checks out PR Head code in its privileged context.

Named resources are generic declarations, not evaluator constants. `REGISTER` is legal only when no exact merged registration or consumption exists for that name. `CONSUME` requires exactly one exact merged registration bound by its merge SHA and no prior exact merged consumption. A concurrent registration/consumption, repeated nonce, stale registration SHA, old-base replay, skipped ordinal, pre-merge close, or expiry returns `HOLD`. If GitHub autocloses an Issue causally from its exact successful merge, `CONSUMED` wins over `EXPIRED`; transitions are idempotent.

The program permits only `GREEN` and frozen `YELLOW_BOUNDED` work. Every production deployment, shared/persistent database operation, real Provider/object-storage call, credential or permission change, paid action, destructive operation, force push, protection bypass, or security-check weakening remains `RED` and requires a new human decision. Child 3's exact merge plus successful exact-main-push CI permanently terminates the grant.

## S1I squash capability repair and one-use baseline migration

Owner authorization AI_VISION_V5_S1I_CONTROL_PLANE_SQUASH_CAPABILITY_REPAIR_V1, including its explicit baseline-migration supplement, permits only independent repair Issue #59 and branch codex/s1i-squash-capability-repair-v1-29ba2f1b. This repair is outside the three program children. Its orchestrator may create an initially Draft PR, obtain independent exact-Head AI review and complete exact-Head Quality gates, perform one ordinary Ready transition and one ordinary squash merge, then verify the exact resulting main-push CI. Up to three published repair corrections are authorized; the Observer remains read-only with maxRepairRounds zero. These task-specific instructions do not grant a general writer, bypass protection or weaken any safety check.

The only migration target is existing Issue #57 / PR #58, with the original program, branch, grant, nonce and canonical Issue-contract digest preserved. The root Issue #55, root activation SHA and expiry never change. The old baseline is exactly 29ba2f1badac6023c42f1ca8e1d7aad67eedc5b1. The new baseline is resolved from the unique repair PR, whose squash commit must have exactly that old baseline as its sole parent and whose tree must equal the independently reviewed Head. Repair repository/owner, Issue approval, exact paths, Head CI, review and exact-main-push CI are mandatory evidence, read twice.

One unedited owner S1I_BASELINE_MIGRATION_JSON comment on Issue #57 records schema s1i-baseline-migration-v1, migrationId, programId, issueNumber, prNumber, oldBaseSha, newBaseSha, repairIssueNumber, repairPrNumber, repairMergeSha, grantId, nonce, issueBodySha256 and consumptionState=CONSUMED. It binds the actual new SHA, never a placeholder. It is written after repair activation and the exact Issue marker update. Exactly one record is accepted; missing, duplicate, edited, mismatched, stale or second-target consumption fails closed. Re-reading the same consumed record verifies immutable history and cannot grant another migration.

Only the three base fields in the child Issue binding and corresponding PR link/readback digest advance. The visible Issue body is retained as the original historical contract; its canonical digest remains frozen. The same PR58 branch advances without force, retaining the original three-path business bytes plus the repair's exact appended governance text. Head changes invalidate all old CI/review evidence. The previousMergeSha/expectedBaseSha/authorizedBaseSha comparisons remain exact against this verified single history edge. Child3 revalidates the same consumed edge before accepting PR2 history. Extra main commits, unknown paths, identity drift or business-content drift return HOLD. No replacement PR or general migration is implemented.

Repository squash capability is read from GraphQL squashMergeAllowed alongside autoMergeAllowed with exact repository identity and strict boolean validation. No REST omission, null, permission failure or malformed response implies permission. Capability, run attempt, Check Suite, jobs and complete migration evidence remain in stable double-read snapshots. Ordinary CI verifies this with its existing contents:read token; the immutable Observer workflow and permissions are unchanged. All prior production, persistent/shared database, real Provider/storage, credential/permission, paid, destructive, force and protection-bypass exclusions remain in force.
