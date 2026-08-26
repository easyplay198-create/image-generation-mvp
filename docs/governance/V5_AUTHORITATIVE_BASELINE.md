# V5 Authoritative Engineering Baseline

Status: frozen for the GitHub-hosted development bootstrap.

## Authoritative source

- GitHub is the sole engineering source of truth for this project.
- The authoritative repository is `https://github.com/easyplay198-create/image-generation-mvp.git`.
- The authoritative baseline commit is `20fa6e7b6a95ca44b77544df6ea99061bf7902c1`.
- The new formal development root is `E:\EASY_PLAY_DEV_WORKSPACES\image-generation-mvp-github-managed-v5`.

Changes intended for formal development must originate from this GitHub baseline and proceed through an Issue, a task branch, CI, and pull request review.

## Historical evidence boundary

The following directories are read-only historical evidence. They are not development sources and must not be modified, cleaned, or automatically migrated into this repository:

- `D:\RUSSIA_ECOM_TOOL_DEV\image-generation-mvp`
- `E:\EASY_PLAY_DEV_WORKSPACES\image-generation-mvp-v5-ui-audit-20fa6e7`

Historical local versions of `README.md` and `qwen_test.py` remain `PORT_AFTER_REVIEW`. This pull request does not automatically migrate either file.

## Repository exclusions

Generated artifacts, browser sessions or profiles, real credentials, and unsanitized audit evidence must never enter this repository. Test and CI configuration must use mocks or explicitly CI-only dummy values and isolated services.

## Gate boundary

This governance pull request establishes the hosted-development baseline only. It does not represent completion of V5 product engineering and does not release Gate 0B.
