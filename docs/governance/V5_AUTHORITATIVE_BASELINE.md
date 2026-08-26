# V5 Authoritative Engineering Baseline

Status: frozen for the GitHub-hosted development bootstrap.

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

## Gate boundary

This governance pull request establishes the hosted-development bootstrap only. It does not establish or release Gate 0B, and it does not establish completion of V5 product engineering.
