# V5 P2 S1E authentication contract

Status: frozen task-scoped prerequisite for a future `P2_AUTH_IMPLEMENTATION` Issue. This document does not implement authentication or authorize production use.

## Fixed decision

- Framework: Auth.js / `next-auth` v5, pinned to an exact reviewed version in the future Issue.
- Method: email magic-link verification with an injected mail transport.
- Session: opaque database token, seven-day absolute expiry, server-side revocation, and an HttpOnly cookie that is Secure in production and SameSite=Lax.
- Verification token: database persisted, single-use, atomically consumed, never logged, and expired after 15 minutes.
- Identity: normalized email maps server-side to existing `UserActor.authIssuer` and `UserActor.authSubject`; the existing scope service then requires one ACTIVE OWNER Membership and ACTIVE Workspace.
- Workspace identity is never accepted from a request header, cookie claim, query, path, body, Demo identity, or client-selected value.

## Provisioning and recovery boundary

S1E has no public sign-up, automatic Workspace creation, password, password recovery, account linking, OAuth provider, or production credential recovery. Only owner-approved pre-provisioned test identities may complete the local/CI flow. Unknown email, expired or replayed token, revoked or expired session, inactive actor, inactive membership, inactive Workspace, ambiguous membership, and missing identity all fail closed.

## Mail and secret boundary

No real email is sent. Tests use a deterministic injected transport that captures a verification URL only inside the test process. Outside test mode, the non-production transport fails closed. No real SMTP account, API key, `AUTH_SECRET`, user account, browser profile, production data, or provider credential may be read, printed, stored, committed, or uploaded. CI may use explicit dummy values only.

## Structural task profile

The future task must use `P2_AUTH_IMPLEMENTATION + P2_AUTH_DRAFT_ONLY`, an exact unique owner-created same-repository Draft branch, zero automated repair rounds, and an owner-approved exact allowlist. It must include:

1. modified root `package.json` and root `package-lock.json`, with exact approved Auth.js dependencies and no unrelated dependency update;
2. modified `prisma/schema.prisma`;
3. exactly one added `prisma/migrations/<14-digit timestamp>_p2_auth_<slug>/migration.sql`;
4. at least one exact `tests/integration/*.test.ts`;
5. only the exact Auth.js configuration, route, trusted principal resolver, existing P2 route wiring, and unit/integration test paths frozen in the Issue.

Nested manifests, alternative lockfiles, a second migration, historical migration edits, destructive/narrowing DDL, DML/backfill, cutover, reset, down migration, shared or production database use, protected control-plane files, UI, UserAssertion, AssetTask, Provider, deployment and real email remain prohibited.

## Acceptance and human gates

Fixed quality gates must prove fresh and repeated migrations in disposable PostgreSQL, lint, strict type checking, unit/integration tests and build. Direct negative tests must cover missing identity, unknown email, token replay/expiry, session revocation/expiry, forged client identity, inactive actor/membership/Workspace and cross-Workspace access. Human review must separately verify dependency scope, additive SQL, cookie/session security, fail-closed mail behavior and the absence of production claims. The PR remains Draft; Ready and merge require separate owner decisions.

## Compatibility maintenance after initial implementation

The structural profile above applies to initial S1E implementation under `P2_AUTH_IMPLEMENTATION + P2_AUTH_DRAFT_ONLY` and remains unchanged.

After that implementation is merged and its exact main-push Quality gates succeed, the narrowly defined compatibility-maintenance capability in `V5_P2_ENTRY_GOVERNANCE.md` may use `P2_IMPLEMENTATION + P2_DRAFT_ONLY`. Its purpose is to correct a reproduced interoperability defect in already tracked S1E implementation while preserving every fixed authentication, provisioning, mail, token/session, cookie, identity and Workspace-authorization decision in this contract.

Such a maintenance task changes only its exact owner-approved existing authentication implementation paths and corresponding test paths, including a real Auth.js request-initialization regression. It changes no manifest, lockfile, dependency version, Prisma file or migration, and adds no authentication implementation module, route, login method, transport capability, production access, UI or authentication bypass. Existing negative/security tests remain applicable. A no-sink mail request must still fail closed, anonymous P2 access must still be denied, and a healthy initialization response is not evidence of a completed real-user login flow.

The current compatibility-maintenance candidate is the outer Provider configuration extensibility defect: Auth.js needs to normalize its configuration object during request initialization. Any permitted fix must preserve the existing test-only mail transport and immutable verification-message payloads. Merely assigning an apiKey, catching the initialization error, returning a fabricated session, or weakening authorization does not satisfy acceptance.

This maintenance path does not reopen Issue #39, revive the terminated S1I delegation, waive Owner approval or semantic review, grant Ready/merge authority, or relax the initial implementation profile. Scope expansion requires a new decision before execution.
