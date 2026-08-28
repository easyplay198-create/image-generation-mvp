# V5 Authoritative Engineering Baseline

Status: GitHub-hosted engineering baseline active; P2 remains task-scoped and Draft-only when separately authorized.

## Authoritative source

- GitHub is the sole engineering source of truth for this project.
- The authoritative repository is `https://github.com/easyplay198-create/image-generation-mvp.git`.
- Commit `20fa6e7b6a95ca44b77544df6ea99061bf7902c1` is the bootstrap lineage anchor for this hosted-development migration; it is not a permanently fixed engineering baseline.
- The reviewed and merged `origin/main` in the GitHub repository is the sole continuously updated authoritative engineering state.
- After each change proceeds through an Issue, a task branch, CI, pull request review, and human merge, the authoritative engineering state advances with `origin/main`.
- `E:\EASY_PLAY_DEV_WORKSPACES\image-generation-mvp-github-managed-v5` is only the current managed Windows working copy; it is not a cross-environment source of truth.
- Codex Cloud and GitHub Actions use temporary or isolated checkouts created from GitHub and do not depend on the Windows `E:` path.

Changes intended for formal development must originate from the current authoritative `origin/main` and proceed through an Issue, a task branch, CI, pull request review, and human merge.

## Historical evidence boundary

The following directories are read-only historical evidence. They are not development sources and must not be modified, cleaned, or automatically migrated into this repository:

- `D:\RUSSIA_ECOM_TOOL_DEV\image-generation-mvp`
- `E:\EASY_PLAY_DEV_WORKSPACES\image-generation-mvp-v5-ui-audit-20fa6e7`

Historical local versions of `README.md` and `qwen_test.py` remain `PORT_AFTER_REVIEW`. This pull request does not automatically migrate either file.

## Repository exclusions

Generated artifacts, browser sessions or profiles, real credentials, and unsanitized audit evidence must never enter this repository. Test and CI configuration must use mocks or explicitly CI-only dummy values and isolated services.

## Gate and P2 boundary

The human owner reported and accepted the external Gate 0B evidence as:

```text
GATE_0B_FINAL_STATUS=PASS_ACCEPTED_AND_FROZEN
FROZEN_MANIFEST_SHA256=12CB214DE0BE252AEB274967B24D7407AD006ECE4338FEEE62B8994DA829E783
```

This repository records that decision as referenced owner-accepted historical evidence; it does not reconstruct or independently revalidate the Windows audit tree. Gate 0B acceptance does not establish completion of V5 product engineering and does not globally unlock P2.

The repository default is `P2_LOCKED`. A future P2 task must follow `V5_P2_ENTRY_GOVERNANCE.md`, use `P2_IMPLEMENTATION + P2_DRAFT_ONLY`, remain on one pre-approved owner-created Draft PR, and receive human semantic review. This governance change establishes the entry contract only and does not begin P2 implementation.
