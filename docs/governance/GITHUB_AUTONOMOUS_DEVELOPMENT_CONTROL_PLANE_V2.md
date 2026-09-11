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

## S1I PR3 single-use scope and baseline refreeze

Owner authorization `AI_VISION_V5_S1I_PR3_SCOPE_REFREEZE_AND_LEGACY_ENUM_TEST_MIGRATION_V1` permits one independent protected-path control-plane repair rooted at Issue #62 and exact base `c46ba6af717628e528b71f2e335c6b5aa37ab407`. After its exact reviewed Head CI, ordinary one-parent squash merge, and exact-main-push CI, Issue #61 may advance once to that merge SHA. The existing PR3 branch advances by ordinary merge; force operations remain forbidden.

The child-3 path set is the registered nine paths plus exactly `tests/integration/p2-s1h-internal-single-image-asset-task.test.ts`. That legacy test may change only its exact ordered `AssetTaskStatus` expectation to `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `HARD_BLOCKED`. Exact equality and every other assertion remain mandatory.

The evaluator accepts this only through one unedited owner `S1I_PR3_SCOPE_REFREEZE_JSON` record on Issue #61. It proves the unique Issue #62 repair PR, exact protected-path allowlist, owner approval, reviewed Head tree, one-parent merge, exact PR and main-push CI, unchanged legacy-test bytes at the old base, old/new Issue-body digests, current binding grant/nonce/branch, and stable two-read evidence. `previousMergeSha`, `authorizedBaseSha`, and `expectedBaseSha` all equal the repair merge. Missing fields, duplicate records, replay, edits, stale evidence, unknown paths, identity changes, lifecycle ambiguity, or extra main commits are `HOLD`. The record expires permanently after the exact child-3 merge and cannot migrate another task.

## PR3 CRLF compatibility and one-use baseline bridge

`PR3_CRLF_COMPATIBILITY_AND_BASELINE_BRIDGE_V1` is a separate protected-path repair at Issue #65 and base `2dd6c6d7d50680d3e25579f4d6a562eede756b25`. Its exact branch is `codex/pr3-crlf-governance-repair-v1-2dd6c6d`; its exact allowlist is `.github/scripts/autonomous-control-gate-v2.mjs`, `.github/scripts/autonomous-control-gate-v2.test.mjs`, `AGENTS.md`, this document, and `V5_P2_ENTRY_GOVERNANCE.md`. Its current authority ends at one Draft PR. It does not authorize Ready, merge, deployment, workflow or permission changes, Issue #61/PR #64 mutation, PR3-branch mutation, or a bridge record.

Comment normalization preserves `body` byte-for-byte as GitHub returned it and records SHA-256 over that raw UTF-8 body before constructing a parsing-only view. A comment is parseable only when its line endings are uniformly LF, uniformly CRLF, or absent. The parsing view converts only uniform CRLF to LF. Mixed LF/CRLF and lone CR fail closed. All Marker count, JSON, duplicate-key, actor, association, unedited-time, review-before-merge, and stable-snapshot rules operate unchanged. Issue and PR bodies are not passed through this view, so program canonicalization, API readback hashes, and approval binding keep their existing exact semantics. Comments 5548103159 and 5548062689 are frozen by ID, raw-body SHA-256, and their equal created/updated times.

After the repair is independently reviewed on its exact Head, passes exact-Head `Quality gates`, is explicitly authorized for an ordinary one-parent squash merge whose parent is the authorized base and whose tree equals the reviewed Head, and passes exact-main-push `Quality gates`, the active evaluator may accept exactly one unedited owner `S1I_PR3_CRLF_BASELINE_BRIDGE_JSON` comment on Issue #61. It must bind schema `s1i-pr3-crlf-baseline-bridge-v1`, the task ID, program/Issue/PR, old and real new bases, Issue #65 and its approved body/comment, repair PR/merge, old/new PR3 Heads, old/new Issue and PR body digests, original refreeze and review comment IDs/raw digests, existing branch/grant/nonce, and `consumptionState=CONSUMED`. The new base equals the actual repair merge; placeholders, predictions, another main commit, another target, or a second record fail closed.

The current Issue #61 body may differ from frozen SHA-256 `ae200bc00b5c0146550fa15f9a855667e2c57daacc21eb6a810ff97d6e20bb5f` only by replacing its three binding fields `authorizedBaseSha`, `expectedBaseSha`, and `previousMergeSha` from the old base to the repair merge. The current PR #64 body may differ from frozen SHA-256 `78a3464d703a89c453eac0d45c26d4150cc737a1921d249431e681ca4b9d5cbf` only by replacing link fields `authorizedBaseSha` and `issueBodyReadbackSha256`. Reverse reconstruction must reproduce both frozen bodies and the canonical Issue-contract digest must stay `df796f6ce926884eb7a38b3ee7abd4809b9cf97773de73f42dd5bb2bacaff0ed`. Grant, nonce, activation, expiry, resources, visible history, and exact ten-path scope cannot change.

The PR3 Head transition is one ordinary two-parent merge from first parent `61d171e4685a1148bec63afb9be0f881db83fd74` and second parent the exact repair merge. Each exact product-path blob at the resulting Head equals its blob at the first parent; the repair contributes governance only. PR #64 must then obtain fresh exact-Head `Quality gates` and two distinct new exact-Head independent reviews before the existing program gates may proceed. Any force event, edited/deleted/duplicate record, raw-comment drift, approval or identity mismatch, review at or after merge, CI ambiguity, tree/path drift, product-byte change, replay, resource change, expiry extension, or extra main commit is `HOLD`.

## Task-scoped V5 single-image local governance slice

`AI_VISION_V5_SINGLE_IMAGE_LOCAL_V1_20260910` is one owner-approved `CONTROL_PLANE_CHANGE + P2_LOCKED` slice registered by Issue #71 at base `4d0cc117276ac2e2cc1230574c56f20733daf47a`, branch `codex/single-image-scope-v1-4d0cc117`, approval comment `5612680014`, and exact Issue-body SHA-256 `fe58f819c58a029ca04ec1aad9a6a24fb726021b430b520a012e210821b07f71`. Its complete and self-contained physical, semantic, resource, and acceptance contract is `docs/governance/V5_SINGLE_IMAGE_LOCAL_V1_CONTRACT.md`; its allowlist is exactly the five protected paths named there, its effective automated repair limit remains zero, and its stage grants no Ready or merge authority.

This appended section is a narrow task-scoped recognition only. It creates no blanket exemption and does not modify, relax, reinterpret, or supersede any observer, workflow, permission, correction-budget, activation, path, or security rule above, and it creates no GitHub writer, no dispatch, and no post-merge observer prerequisite. Its only deltas are the named single-use database exception `P2_SINGLE_IMAGE_LOCAL_DDL_V1`, limited to exactly three same-name, same-transaction, validated CHECK replacements that preserve every old-domain predicate and every old result, and the named dormant local resource exception `P2_SINGLE_IMAGE_LOCAL_RESOURCE_V1`, limited to the exact local clusters, ports, directories, and retention frozen in the new contract. For this named resource only, after this governance slice is activated and the future implementation has its exact Owner/Issue/base/resource binding, only the already-approved acceptance cluster `127.0.0.1:55482` / `vision_local_v1_acceptance` / `runtime\pg-acceptance` under the frozen output root is excepted from both the disposable-only rule and the prohibition on persistent-database application. This exception permits only the approved local acceptance use and retention until Owner acceptance or explicit cleanup; it changes no resource identity, capacity, credentials, purpose, or cleanup authority. Every other persistent database and every shared or production database remains prohibited. All destructive-action, historical-evidence, and security prohibitions remain unchanged. The slice stays `PROPOSED_INACTIVE` until exact human semantic review, an explicitly authorized ordinary merge commit, and successful `Quality gates` for the resulting exact `main` push.

The frozen S1I program contract, the consumed `P2_S1I_COMPAT_DDL_V1` registration, the terminated S1I delegation, and every historical marker remain byte-frozen and are not replayed. This slice independently registers the single-use task-scoped database exception `P2_SINGLE_IMAGE_LOCAL_DDL_V1` and the dormant named local resource exception `P2_SINGLE_IMAGE_LOCAL_RESOURCE_V1`, both usable only by the activated future implementation task under its own exact Owner, Issue, base, path, and resource binding. Formal `VisualPlan`, `GenerationPlan`, and `BrandKitRevision`, destructive or narrowing old-domain changes, and historical migration, old-enum, old-function, or old-trigger edits remain prohibited for this slice too. No existing `HOLD`, activation, security, lifecycle, or merge condition is weakened.

## Issue #73 Windows CRLF runtime bridge

`ISSUE73_WINDOWS_CRLF_RUNTIME_BRIDGE_V1` is the task-scoped protected-path governance repair rooted at Issue #74. It is bound to repository `easyplay198-create/image-generation-mvp` (ID `1328682481`), Owner `easyplay198-create` (ID `268785207`), exact base `3e37934d6350bd1fd5913a1b208d855a50e2588e`, Issue-body SHA-256 `b8a199ddaaeffbf4b817fa169044cb50332fa6ffe2b06aa704e9cc3ca39cac30`, unedited Owner approval comment `5621852229` with raw UTF-8 SHA-256 `178862a7a175e364920a21ddb1f19eeb5c8c45eeae1642731318802c939d5340`, and branch `codex/issue73-windows-crlf-runtime-bridge-v1-3e37934d`. Its exact four protected paths are `AGENTS.md`, this document, `V5_P2_ENTRY_GOVERNANCE.md`, and `V5_SINGLE_IMAGE_LOCAL_V1_CONTRACT.md`. Automated, local and published correction limits are zero. This stage may deliver only one initially Draft PR.

The bridge remains `PROPOSED_INACTIVE` until the four-path Head receives exact semantic review and exact-Head `Quality gates`, the Owner separately authorizes an ordinary one-parent squash merge to the authorized base whose tree equals that reviewed Head, and `Quality gates` succeeds for the exact resulting `main` push. The V2 Observer stays read-only. Draft status, CI, review or this registration alone grants no Ready, merge, database, runtime or Issue #73 mutation authority.

After activation, exactly one unedited Owner `ISSUE73_WINDOWS_CRLF_RUNTIME_BRIDGE_JSON` record on Issue #73 may bind the real repair Issue, approval comment, Draft PR, reviewed Head tree, merge SHA, exact-main-push CI, the old and new Issue #73 body digests and branch Heads, existing approval comment `5616238018`, the exact 31-path scope, and the complete two-file working-byte and canonical Git-blob identities registered below. The record is valid only for Issue #73 and becomes permanently unavailable after its exact successful consumption. Missing, duplicate, edited, stale, replayed, cross-task or two-read-unstable evidence is `HOLD`.

The valid record permits one ordinary two-parent merge into existing branch `codex/single-image-local-v1`, whose first parent is old Head `3e37934d6350bd1fd5913a1b208d855a50e2588e` and second parent is the activated governance merge. The merge must preserve every one of the 31 uncommitted business-file bytes. No force operation is permitted. Only Issue #73 base/readback fields required by that verified edge may change, followed by one fresh unedited Owner approval of the exact updated Issue body. Product scope, dependencies, one-migration limit, resources, budgets, semantics, historical evidence and exclusions remain unchanged.

The bridge narrows historical-migration immutability only for one process-bounded working-byte transaction during the already authorized local migration validation. Before materialization, the process verifies both frozen Windows files and captures their original byte arrays in memory:

1. `prisma/migrations/20260901130000_p2_internal_single_image_asset_task/migration.sql`: 5304 working bytes, SHA-256 `0584f4efe01962c76fce87c68456cd308abd4585e926f9472cf579416a341f48`, Git blob `045a10480d0b3bd898fb2bee9f309789b9ea0bb7`, 5157 canonical bytes, canonical SHA-256 `eb060c49ebb8bf8497e1851b386ea66d7a7ec8e34b7b30e4948e898d2392be76`.
2. `prisma/migrations/20260905002000_p2_internal_attempt_artifact_lineage/migration.sql`: 59141 working bytes, SHA-256 `5db64b643f3415380eb5d405c4b09191930f70b51faf39839aad7f5867c014da`, Git blob `70f4f6ce1c054f8dafa245813451c3fcbef5aa9d`, 58809 canonical bytes, canonical SHA-256 `5bdbd911af7bc8096b39632d3bea7a66788b4b88fa36aa8de3b846d170ef5b90`.

The process materializes only those exact canonical blob bytes, verifies both canonical SHA-256 values, and runs only the unchanged fixed migration and integration commands against the frozen Issue #73 loopback resources. A mandatory `finally` path restores the exact captured Windows byte arrays and verifies both original hashes, Git index equality, zero staged change and no changed path outside the existing Issue #73 allowlist. If interrupted, restoration and verification are the only legal next actions before any test, database, application, browser, Git or record continuation.

Only after disposable fresh migration, repeated deploy, rollback, complete old-domain equality, concurrency and integration gates pass may the Issue #73 migration be applied to the already retained acceptance cluster `127.0.0.1:55482` / `vision_local_v1_acceptance` / `runtime\pg-acceptance`. Exact restoration and acceptance-migration evidence consume the bridge. It cannot be reused or transferred.

This exception does not authorize editing, staging, committing or publishing a historical migration; a third migration; `.gitattributes` or Git-configuration changes; altered SQL; a skipped or weakened gate; an alternate, shared or production database; service registration; Windows user, token or ACL changes; credentials; email; Provider or paid calls; deployment; Issue #73 Ready or merge; workflow, permission or security changes. All V2 identity, path, tree, lifecycle, approval, Draft-only and human merge boundaries remain fail-closed.

## Issue #73 S1I upgrade-fixture existing-cluster exception

Owner-approved task ISSUE73_S1I_UPGRADE_FIXTURE_EXISTING_ACCEPTANCE_CLUSTER_V1 is rooted at Issue #76, Issue-body SHA-256 1cd6fc112a5a04061f43de57facd4e937fb45b90ba4a60b5e861e9c9d40993f7, unedited Owner approval comment 5628353167 with raw UTF-8 SHA-256 a06beca9daaa317566e83e4a13cb9c9ec94a8a8481319fd98325357d58c57377, repository easyplay198-create/image-generation-mvp ID 1328682481, and Owner easyplay198-create ID 268785207.

ISSUE73_S1I_UPGRADE_FIXTURE_EXISTING_ACCEPTANCE_CLUSTER_V1 is a governance-only task on base 51a278e545d102766aab6ed71eba7e4b7ab1fe1d and branch codex/issue73-s1i-upgrade-fixture-v1-51a278e. It changes only the registered four protected paths and stays PROPOSED_INACTIVE through one initially Draft PR. Activation requires exact semantic review, exact-Head Quality gates, separate Owner authorization for an ordinary one-parent squash merge with reviewed-tree equality, and successful exact-main-push Quality gates.

After activation, only the same unfinished Issue #73 closeout may once set S1I_UPGRADE_DATABASE_URL to postgresql://vision_local_v1_owner@127.0.0.1:55482/postgres while DATABASE_URL remains its registered 127.0.0.1:55481 test resource. The unchanged frozen test may create, use and finally drop at most one database matching ^s1i_upgrade_[0-9a-f]{32}$. It never receives a URL naming vision_local_v1_acceptance.

Before the test, the scratch set is empty and read-only evidence captures maintenance current_user plus the acceptance database identity, stable catalog/settings, schema checksum and deterministic table-data digest. A cleanup target is valid only when absent before the run, the sole new exact-name match, owned by vision_local_v1_owner, and not postgres or vision_local_v1_acceptance. Cleanup may drop only that target. The acceptance database may never be deleted, rebuilt, renamed, cleared, migrated, altered, truncated or used for destructive testing during this fixture. Afterward the scratch set is empty and all acceptance evidence is equal. On interruption or ambiguity, cleanup and read-only verification of the sole proven scratch database are the only next actions.

After activation and before Issue #73 changes again, exactly one unedited Owner ISSUE73_S1I_UPGRADE_FIXTURE_CONTINUATION_JSON record with schema issue73-s1i-upgrade-fixture-continuation-v1, a unique continuationId and nonce, and state AUTHORIZED_PENDING_SINGLE_CONSUMPTION must exist. It binds this real governance activation; existing bridge comment 5628051892 and raw SHA-256 3fc8b8cacdaf2a31a3fac9bf97765172f8e0a95bbb19f070777a4102b92da5cc; current Issue #73 body SHA-256 709e62bc08c2db86732ecc73c400cb4815a2e979f2ef2869652cd9cd64a2f3fa; approval comment 5628072718 and raw SHA-256 8fda52485e696425bc80ca06741efc84cc04df8907fa75fde3fde9fdfbe610c0; branch and old Head 7c12c4a417f5079dd999bce450af2f9220896afa; exact 31-file manifest SHA-256 ab617c83a6ac9188cf6fbee6dea695e5802d0739e0158fab755cbfcab936ed88; real new base, deterministic new Head and exact field-only body replacements; and all unchanged scope, resource, budget and lifecycle facts.

The continuation permits one ordinary two-parent local merge with old Head 7c12c4a417f5079dd999bce450af2f9220896afa as first parent and the governance merge as second parent, preserving all 31 business bytes, followed only by the bound Issue base/readback replacements and one new exact-body Owner approval. This consumes the continuation record. It never edits, duplicates, reissues, resets or consumes the existing runtime bridge, which remains pending until historical-byte restoration and successful acceptance-migration evidence consume it once.

After the new approval the fixed order is process-bounded canonical-byte materialization; disposable fresh/repeated migration; full unchanged integration using only the 55482 maintenance endpoint for the scratch fixture; scratch absence and acceptance preservation; one application of the existing migration to retained vision_local_v1_acceptance while canonical bytes remain materialized; mandatory outer-finally restoration and verification of the original working bytes; original-bridge consumption evidence; then original app/browser/auth restart/real-SKU acceptance. Starting or initializing only the already registered disposable 127.0.0.1:55481 resource at its frozen directory creates no new resource identity. No source/test/script change, third database instance, new port/directory/role/credential/dependency/migration/model/provider/fee/permission/correction/retry, Issue #73 push/PR/Ready/merge, deployment, force or protection bypass is authorized. For Issue #76, automated, local and published correction limits are 0; Claude and business-model calls are 0; fee cap is CNY 0; and the endpoint is one initially Draft PR.
