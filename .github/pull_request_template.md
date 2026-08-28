## Linked Issue

Closes #

## Autonomous control status

- Control-plane version: `GITHUB_AUTONOMOUS_DEVELOPMENT_CONTROL_PLANE_V1`
- Current phase: `P2_LOCKED`
- Task class: `ORDINARY_TASK` / `CONTROL_PLANE_CHANGE`
- Issue approval URL:
- Approver GitHub login:
- Approved Issue body SHA-256:
- Authorized base SHA:
- Requested autonomy/round limit:
- Effective automated repair round limit: `0`
- Automated repair round count: `0`
- Last processed event/comment ID: `none`
- Last processed head SHA: `none`
- [ ] Any repair request was issued only after trusted-actor and idempotency gates passed.
- [ ] This pull request must not be auto-merged; final merge requires a human decision.

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

- [ ] Required GitHub Actions checks passed.
- [ ] Any CI failure was resolved in this Issue and pull request.
- CI run URL or current status:

## Database migration

- [ ] No database migration is included.
- [ ] A separately owner-approved migration is included; the approval URL plus forward, repeat, and rollback evidence are documented below. Without that approval, status is `HOLD`.
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

## Structured handback

```text
RESULT=PASS|HOLD|FAIL
CONTROL_STATE=READY_FOR_HUMAN_MERGE|HOLD|FAIL
ISSUE_URL=
ISSUE_APPROVAL_URL=
ISSUE_BODY_SHA256=
DRAFT_PR_URL=
BASE_SHA=
HEAD_SHA=
CHANGED_FILES=
TEST_COMMANDS_AND_EXIT_CODES=
CI_STATUS=
AUTO_FIX_ROUND_COUNT=
UNVERIFIED_ITEMS=
HUMAN_ACTION_REQUIRED=
```
