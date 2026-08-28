## Linked Issue

Closes #

## Autonomous control status

- Control-plane version: `GITHUB_AUTONOMOUS_DEVELOPMENT_CONTROL_PLANE_V2`
- Control mode: `OBSERVER_ONLY`
- Current phase: `P2_LOCKED` / `P2_DRAFT_ONLY`
- Task class: `ORDINARY_TASK` / `CONTROL_PLANE_CHANGE` / `P2_IMPLEMENTATION`
- Authorized P2 task branch or `Not applicable`:
- Issue approval URL:
- Approver GitHub login:
- Approved Issue body SHA-256:
- Authorized base SHA:
- Requested autonomy/round limit:
- Effective automated repair round limit: `0`
- Automated repair round count: `0`
- [ ] No automatic repair request was issued; the V2 writer and Codex dispatch remain disabled.
- [ ] This pull request must not be auto-merged; final merge requires a human decision.
- [ ] If this is `P2_IMPLEMENTATION`, the PR is owner-created, remains Draft, uses the exact pre-approved head ref, declares zero automated repair rounds, and is governed by the mandatory boundaries in `docs/governance/V5_P2_ENTRY_GOVERNANCE.md`.
- [ ] Any human corrective update stayed inside the same Issue, branch, Draft PR, path allowlist, and frozen semantics; at most one is allowed and its count is reported below.

<!-- CONTROL_PLANE_V2_LINK_BEGIN
{"approvalCommentId":0,"authorizedBaseSha":"replace-with-authorized-base-sha","issueBodySha256":"replace-with-lowercase-sha256","issueNumber":0,"schema":"github-autonomous-control-v2"}
CONTROL_PLANE_V2_LINK_END -->

## Change scope

### Files and behavior changed

-

### Explicitly not done

-

## Risk

- Risk level:
- Failure modes and affected users or systems:
- Mitigations and monitoring:

## Verification

Report the exact command and its real exit code. Do not report a command as passed when it was not run.

| Command | Exit code | Result |
| --- | ---: | --- |
| `command` | `not run` | Reason |

## CI status

- [ ] `Quality gates` passed for the exact current head SHA.
- [ ] Any CI failure was resolved in this Issue and pull request.
- CI run URL or current status:

## Database migration

- [ ] No database migration is included.
- [ ] A P2 database-foundation exception is included: `prisma/schema.prisma` is modified, exactly one new `prisma/migrations/<14-digit timestamp>_p2_<slug>/migration.sql` is added, and at least one exact path under `tests/integration/` ending in `.test.ts` verifies it.
- [ ] A separately owner-approved non-P2 migration is included; the approval URL plus forward, repeat, rollback, and human semantic-review evidence are documented below. Without that approval, status is `HOLD`.
- [ ] The owner-approved Issue freezes the physical DDL; fresh and repeated migration application passed only in disposable isolated PostgreSQL.
- [ ] The new migration directory sorts after the authorized base's latest migration directory.
- [ ] Human semantic review confirmed additive-only SQL and no historical-migration edit, destructive/narrowing operation, DML/backfill, cutover, reset, down migration, shared database, or production database application.
- Approval and migration details or reason not applicable:

## UI screenshots

- [ ] This is not a UI change.
- [ ] Before and after screenshots are attached for affected states and viewports.
- [ ] A screenshot exception is explained below.
- Screenshot links or exception:

## Secret scan

- [ ] The tracked diff was scanned without printing secret values.
- [ ] No real credentials, browser sessions, generated artifacts, or unsanitized audit evidence are included.
- Scanner, command, and sanitized result:

## Rollback

Describe the exact revert or recovery procedure and any data implications.

-

## Unverified items

List every unverified behavior, environment, service, or manual review item. Write `None` only when all acceptance criteria have direct evidence.

-

Branch protection for `Quality gates` and owner-review/no-bypass behavior require separate direct verification. The read-only observer is not a protected PR-head check, GitHub comments are not a transactional ledger, and no observer result authorizes a repair dispatch or merge. For a `P2_IMPLEMENTATION` PR, `PASS` means only `P2_DRAFT_ONLY`; keep the PR Draft for human semantic review.

If a human converts the PR from Draft to ready, every prior observer result becomes a historical snapshot; a later reconcile must return `HOLD` while the current-state contract still requires Draft.

## Structured handback

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
REQUESTED_AUTOMATED_REPAIR_LIMIT=
AUTO_FIX_ROUND_COUNT=
HUMAN_CORRECTION_ROUND_COUNT=
P2_STATUS=LOCKED|DRAFT_ONLY
OPERATION_PATH=
OUTPUT_PATH=
UNVERIFIED_ITEMS=
HUMAN_ACTION_REQUIRED=
```
