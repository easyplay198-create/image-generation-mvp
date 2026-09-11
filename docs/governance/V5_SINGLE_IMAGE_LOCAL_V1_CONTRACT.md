# V5 single-image local V1 contract

Status: `PROPOSED_INACTIVE` task-scoped governance contract for `AI_VISION_V5_SINGLE_IMAGE_LOCAL_V1_20260910`. This document records the owner-approved upstream delta and the exact boundary of one future local single-image implementation task. It does not implement product code, execute a database, call a business model, deploy, or authorize Ready or merge. It carries no self-referential digest.

## 1. Exact binding and stage

- Repository: `easyplay198-create/image-generation-mvp`, ID `1328682481`; Owner `easyplay198-create`, User ID `268785207`.
- Change ID: `AI_VISION_V5_SINGLE_IMAGE_LOCAL_V1_20260910`.
- Task class / phase: `CONTROL_PLANE_CHANGE` / `P2_LOCKED`.
- Authorized base: `4d0cc117276ac2e2cc1230574c56f20733daf47a`.
- Branch: `codex/single-image-scope-v1-4d0cc117`.
- Working directory: `E:\EASY_PLAY_DEV_WORKSPACES\image-generation-mvp-single-image-scope-v1-4d0cc117`.
- Issue: `#71`. Unedited owner approval comment: `5612680014`, URL `https://github.com/easyplay198-create/image-generation-mvp/issues/71#issuecomment-5612680014`, created and updated `2026-09-10T03:55:58Z`. Immutable raw comment UTF-8 SHA-256: `50c65783273f127476d84b7d6fa206f3b443a3f7c7b5211fbe49ff2a0a400bcc`. Exact Issue-body SHA-256: `fe58f819c58a029ca04ec1aad9a6a24fb726021b430b520a012e210821b07f71`.
- Output root: `E:\EASY_PLAY_DEV_WORKSPACES\TASK_PACKETS\P2_AUTH_SESSION_PROJECT_ACCEPTANCE_V1\SINGLE_IMAGE_LOCAL_V1_20260910`.
- Continuous record: `AI_VISION_V5_SINGLE_IMAGE_SCOPE_APPROVAL_V1_20260910.md` in the parent directory of the output root. It remains the only continuous maintenance record; no second scheduler or platform is created.

The final governance diff of this stage must equal exactly these five protected repository-relative paths, and no other path:

1. `AGENTS.md`
2. `docs/governance/GITHUB_AUTONOMOUS_DEVELOPMENT_CONTROL_PLANE_V2.md`
3. `docs/governance/V5_P2_ENTRY_GOVERNANCE.md`
4. `docs/governance/V5_P2_S1E_AUTH_CONTRACT.md`
5. `docs/governance/V5_SINGLE_IMAGE_LOCAL_V1_CONTRACT.md`

The first four files receive only narrow appended clauses required by this slice. Their original historical text and the old frozen S1I block keep their original bytes. No evaluator, workflow, script, global configuration, permission, dependency, budget, or old resource-consumption state changes.

Stage state is `PROPOSED_INACTIVE`. This slice becomes active only after exact human semantic review of the actual diff, an explicitly authorized ordinary merge commit, and successful `Quality gates` for the resulting exact `main` push. A workflow-run job skipped solely because the upstream event is a `main` push is expected and is neither `PASS` nor `HOLD`; no post-merge live-PR observer result is an activation prerequisite. Until activation this slice grants nothing.

Budgets for this governance stage: automated repair `0`, local governance corrections `2` total in this `G` account, of which `1` was previously consumed and `1` is consumed by this Owner-approved Codex wording closeout (`2` used, `0` remaining), and published governance corrections `0`. No further Claude invocation or additional correction is authorized, and any future `I` 3/2 budgets are inactive and not transferable. Historical budgets remain on their original accounts and are not reissued, revived, or transferred. Product code, database execution, business model calls, service or network writes, dependency or lockfile changes, installations, and any Ready, merge, or deployment are prohibited in this stage.

## 2. Upstream originals and approved delta

The following hashes are the frozen provenance inputs:

| Input | SHA-256 |
| --- | --- |
| Original ZIP `AI_VISION_V5_SINGLE_IMAGE_LOCAL_EXECUTION_20260909.zip` | `5a68903068bbc15254e9bec80961eb94f6cbb11685366c89f2757eb16dca95cc` |
| Upstream P1 contract original | `3010c13fad54ff01e6bb75ca949dab0cc9f34b0a50b89728fc91ecf456a9493b` |
| V5 product definition original | `c1cdd36bf8b015e9b9fa7e3389c4354f5b984931545d02c20ed6ad23b11595b7` |
| V1 concise revision original | `ebad0994e2a9e72fa5d9e348b2e22849904879185bc8fa74d3d8f32aeb230e14` |
| Pre-approval local narrow-scope application and collaboration snapshot | `ef48f53e7b4b6a9c0604d686c8bb4bb54098cb74d8a107560e3ed4c0f4f0a025` |
| Approved upstream delta (sections 4 and 5) | `3cf979390c677bbfc68d6f5302455531b044c15e5dcc3318170999b198ff6607` |
| Frozen future path and resource proposal JSON | `ee5d07a2b8615b9ca79019c949da6b4016529b330e17d6188dbe0bc8c2fea838` |

The upstream P1 original keeps its original bytes and hash. The explicit approved delta does not replace it. Original plus delta form the baseline for this slice only.

Approved delta extraction convention: the delta bytes are the raw UTF-8 of sections 4 and 5 of the approved local narrow-scope application document, with `CRLF` line endings preserved exactly as approved, no BOM, no whitespace normalization, and no trailing-LF insertion. SHA-256 over exactly those bytes is `3cf979390c677bbfc68d6f5302455531b044c15e5dcc3318170999b198ff6607`. Any other extraction, reflow, or LF conversion is a different artifact and is not the approved delta.

Because no upstream text is rewritten, every original limitation that is not explicitly widened here remains in force. Where the delta and an original limitation differ, the difference is stated as an explicit exception in this document, never as a silent override.

## 3. Future implementation task binding

The future implementation is a separate task and is not authorized by this governance stage.

- Worktree: `E:\EASY_PLAY_DEV_WORKSPACES\image-generation-mvp-single-image-local-v1`.
- Branch: `codex/single-image-local-v1`.
- Task class / phase: `P2_IMPLEMENTATION` / `P2_DRAFT_ONLY`.
- Authorized base: the real, actual activation merge SHA of this governance slice. A predicted, placeholder, or reconstructed SHA is invalid.
- Base rule: no intervening `main` commit between that activation merge and the implementation branch base.
- Entry binding: one unedited owner approval comment over the implementation Issue's exact final body digest, plus repository, owner, base, phase, branch, allowlist, budgets, and resource binding. The implementation Issue, approval comment ID, and body digest are `UNKNOWN` until actually assigned; they must never be fabricated or represented as already valid.
- Requested budgets: automated repair `0`; worktree-local corrections at most `3`; published corrections at most `2`; per-fault retries at most `2`, whichever actual balance is smaller. A `HOLD` and evidence preservation replace any exhausted budget; no replacement task is created.
- Exactly one new migration; dependency and lockfile changes `0`.
- The feature PR stays Draft and does not include Ready, merge, release, or deployment.

The exact 31 authorized repository-relative paths are frozen; no wildcard, directory, or pattern authorization is permitted, and the final diff must equal this set:

1. `auth.ts`
2. `src/auth/authjs-email.ts`
3. `src/auth/local-acceptance-mail.ts`
4. `src/local/single-image-runtime.ts`
5. `src/storage/local-object-storage.ts`
6. `src/http/p2-source-snapshot-api.ts`
7. `app/api/p2/projects/[projectId]/source-snapshots/route.ts`
8. `app/api/p2/projects/[projectId]/source-snapshots/[sourceSnapshotId]/content/route.ts`
9. `app/api/local-acceptance/mail/route.ts`
10. `app/p2/page.tsx`
11. `app/p2/single-image-workspace.tsx`
12. `app/projects/[projectId]/design-editor.tsx`
13. `src/editor/design-document.ts`
14. `src/editor/fabric-adapter.ts`
15. `src/planning/single-image-layout.ts`
16. `src/http/p2-editable-document-api.ts`
17. `src/services/design-version-service.ts`
18. `app/api/p2/projects/[projectId]/layout-plan/route.ts`
19. `app/api/p2/projects/[projectId]/editable-documents/route.ts`
20. `app/api/p2/projects/[projectId]/editable-documents/[editableDocumentId]/route.ts`
21. `app/api/p2/projects/[projectId]/editable-documents/[editableDocumentId]/png/route.ts`
22. `prisma/schema.prisma`
23. `prisma/migrations/20260910000000_p2_single_image_local_v1/migration.sql`
24. `tests/unit/design-document.test.ts`
25. `tests/unit/single-image-layout.test.ts`
26. `tests/unit/local-single-image-runtime.test.ts`
27. `tests/unit/p2-editable-document-api.test.ts`
28. `tests/unit/p2-source-snapshot-http-api.test.ts`
29. `tests/integration/p2-single-image-editable-document.test.ts`
30. `tests/integration/p2-local-browser-auth.test.ts`
31. `tests/integration/p2-single-image-migration-contract.test.ts`

Generated outputs may exist only under the worktree's existing ignore rules and fixed generation commands (`node_modules`, `src/generated/prisma`, `.next`, `next-env.d.ts`). They are not committed and do not change `.gitignore`, `AGENTS.md`, or global settings. If pre-implementation evidence shows a path is unnecessary or missing, the binding is narrowed or amended first; it is never widened while writing.

### Local resource boundary (future implementation only)

The resources below are the complete and exclusive frozen local resource set for the future implementation task. They are future `I` resources, not executable authority during `G`, and no resource outside this enumeration is added.

- Database binaries: the existing PostgreSQL 17 installation at `C:\Program Files\PostgreSQL\17\bin`. Only independent task-local clusters under the existing output root `E:\EASY_PLAY_DEV_WORKSPACES\TASK_PACKETS\P2_AUTH_SESSION_PROJECT_ACCEPTANCE_V1\SINGLE_IMAGE_LOCAL_V1_20260910` may be created, and every cluster listens on loopback `127.0.0.1` only.
- Test cluster: `127.0.0.1:55481`, database `vision_local_v1_test`, data directory `runtime\pg-test`.
- Acceptance cluster: `127.0.0.1:55482`, database `vision_local_v1_acceptance`, data directory `runtime\pg-acceptance`.
- Database role: `vision_local_v1_owner`, created only inside these two new clusters. The existing `5432` instance, any shared or production database, and any real account or password are never used. Fixed integration tests may create and delete self-owned temporary databases only in the test cluster; no destructive test runs against the acceptance cluster. The runtime identity is the ordinary non-elevated supported PostgreSQL identity; if it is unavailable the task stops, and no new Windows user, ACL, service, security policy, or global `PATH` change is made.
- Application: `127.0.0.1:3311`, path `/p2`. Port ownership is rechecked before any future startup.
- Object storage: local directories `runtime\objects-test` and `runtime\objects-acceptance` only; no S3, MinIO, external bucket, or external storage service. Path traversal, symlink, and root escape are rejected, and source or revision objects are never overwritten. Failure cleanup may remove only exact self-created intent objects with proven digest and ownership; any ambiguity stops the task and never authorizes blind deletion.
- Browser: `runtime\browser-profile` only, with synthetic identities only, using the existing Chrome or Edge installation and the bundled Playwright; nothing is installed and no real user profile is reused. The acceptance runtime uses a dummy process-local `AUTH_SECRET` and `@example.invalid` identities, a process nonce, and one-time local claims; tokens, cookies, URLs, and sessions are never logged. Default and production behavior fail closed.
- Footprint and retention: the combined task-owned local runtime footprint is at most `4294967296` bytes (4 GiB). Acceptance database, image, document, and result data are retained until Owner acceptance or explicit cleanup and are never deleted automatically when a window closes. The existing per-image `<= 20 MiB` and `1080x1080` contract is unchanged, and no other numeric predicate is adjusted. Only task-owned processes are stopped, and only after verifying PID, creation time, image, and data directory against this task's own record; unknown old processes are never stopped. Closing and reopening the acceptance run must really restart this task's own application and browser.
- Business calls and fee: business planning and image model calls are `0`, and the fee cap is `CNY 0`. No global configuration, permission, dependency, or lock change is made; any generated dependency stays independently local to the same worktree and never points at the old host `w69b`. The existing output root, source hashes, and the exact 31 future paths are preserved, and the future implementation binding and activation gates are unchanged.

This boundary is registered as the named dormant task-scoped local resource exception `P2_SINGLE_IMAGE_LOCAL_RESOURCE_V1`; it grants nothing before activation. For this named resource only, after this governance slice is activated and the future implementation has its exact Owner/Issue/base/resource binding, only the already-approved acceptance cluster `127.0.0.1:55482` / `vision_local_v1_acceptance` / `runtime\pg-acceptance` under the frozen output root is excepted from both the disposable-only rule and the prohibition on persistent-database application. This exception permits only the approved local acceptance use and retention until Owner acceptance or explicit cleanup; it changes no resource identity, capacity, credentials, purpose, or cleanup authority. Every other persistent database and every shared or production database remains prohibited. The disposable-only rule continues to apply to every other task and to the test cluster, which remains disposable and is cleaned up.

## 4. Approved capability delta

This slice reuses the existing P2 identity, Workspace, project, upload, truth-activation, AssetTask, Artifact/Revision, and idempotency systems. It is a governance sub-change of an existing single-image business line, not a replacement project, and it does not revive the terminated S1I program or reset old failure budgets.

- One real SKU. Existing product material and an optional reference influence exactly one rules-based planning pass. Short copy and layout are produced together; no strategy page and no step-by-step approval are added. No formal `VisualPlan`, `GenerationPlan`, or `BrandKitRevision` is created.
- A reference supplies expression attributes only (for example palette, hierarchy, or density). Competitor parameters never become the product's own facts, and a missing fact is never invented.
- Real product pixels and editable text stay in separate layers. Reuse is limited to Fabric, the existing upload, identity, project, truth, and version systems. Legacy Demo IDs must not stand in for P2 domain objects. The required outcome is edit, move text, save, close, reopen, and one 1080x1080 PNG. It is not a platform package, QA, or listing acceptance.
- Relative to the upstream P1 `EditableDocument`/P3 rules and the passive reference-storage rule, this slice adds only local single-image edit restoration and selected-reference expression consumption. Multi-image sets, crawling, multi-platform delivery, and natural-language editing remain deferred.
- No model call is made by the document path. The first save creates a canonical `AssetTask`, `Artifact`, `EditableDocument`, and first `SYSTEM_LAYOUT` revision without fabricating a `GenerationAttempt`.
- `taskType=INTERNAL_SINGLE_IMAGE`, `outputPurpose=INTERNAL_TEST`, and every existing enum label set are retained. The no-model document path is an explicitly approved new contract branch; it is not represented as an S1I execution.

Explicit conflict handling:

| Original limitation | Exact delta for this slice only |
| --- | --- |
| P2 does not implement canvas editing and restoration | Local single-image `EditableDocument` create, version save, and restore are allowed; natural-language editing is not |
| References are passively stored and do not enter expression generation | Only explicitly selected reference expression attributes may enter one rules planning pass; competitor facts, crawling, and formal strategy objects remain prohibited |
| Fixed test artifact, Attempt binding, and first-revision-only physical contract | A provider-free layout revision bound to an `EditableDocument` is allowed, including USER_EDIT parent/actor; the old Attempt branch is unchanged |
| User edits require a new revision and invalidate old QA | New document events bind old/new head, Actor, truth, and digests; this slice creates no QA and never carries an old QA conclusion into an edit |
| PNG and edit read-back are deferred | One local 1080x1080 preview PNG is released; platform download packages, platform compliance, and publishing are not |
| Only additive DDL outside the consumed S1I exception; narrowing old-domain changes are prohibited | One task-scoped migration registered as the independent `P2_SINGLE_IMAGE_LOCAL_DDL_V1` exception may perform exactly three same-name, same-transaction, validated CHECK replacements that preserve every old-domain predicate and every old result; no other narrowing or destructive old-domain change is permitted |

## 5. No-attempt document lineage and immutable metadata

The future migration adds exactly two models and two nullable `ArtifactRevision` fields. No unlisted column is added.

`EditableDocument`:

```text
editableDocumentId TEXT NOT NULL PRIMARY KEY
workspaceId TEXT NOT NULL
projectId TEXT NOT NULL
assetTaskId TEXT NOT NULL
truthRevisionId TEXT NOT NULL
schemaVersion INTEGER NOT NULL
headArtifactRevisionId TEXT NOT NULL
status TEXT NOT NULL
brandKitRevisionId TEXT NULL
visualPlanId TEXT NULL
createdByActorId TEXT NOT NULL
createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
```

- `schemaVersion = 1` for this slice. `brandKitRevisionId` and `visualPlanId` are real nullable columns fixed to `NULL` here.
- At most one document per task: unique `(workspaceId, projectId, assetTaskId)`.
- A document never exists without a head: `headArtifactRevisionId` is `NOT NULL`.
- `status` domain is exactly `ACTIVE` and `ARCHIVED`; creation is `ACTIVE`; the only permitted status change is the terminal `ACTIVE -> ARCHIVED` transition with no reverse.
- Only `headArtifactRevisionId` and `status` may change. Every other provenance column is immutable and `DELETE` is rejected.
- The head update is compare-and-swap on the old head. A new head is accepted only when it is a `USER_EDIT` revision of the same workspace, project, task, and document, whose `parentArtifactRevisionId` equals the previous head and whose `revisionNumber` is the predecessor plus one.
- The head pointer is a deferred composite foreign key to `ArtifactRevision`, so the first document and its first revision can be inserted in one transaction.

`EditableDocumentSourceLink`:

```text
linkId TEXT NOT NULL PRIMARY KEY
workspaceId TEXT NOT NULL
projectId TEXT NOT NULL
editableDocumentId TEXT NOT NULL
assetTaskId TEXT NOT NULL
artifactRevisionId TEXT NOT NULL
sourceSnapshotId TEXT NOT NULL
sourceRole TEXT NOT NULL
inputOrder INTEGER NOT NULL
contentDigestAtBinding TEXT NOT NULL
createdByActorId TEXT NOT NULL
createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
```

- `sourceRole` is a text column constrained to exactly `PRODUCT_SOURCE` and `REFERENCE_STYLE`. The existing `P2SourceLineageRole` enum is not modified.
- Uniqueness is scoped to the document revision, not to the document as a whole: exactly one link per `artifactRevisionId`, source snapshot, and role, and exactly one link per `artifactRevisionId` and `inputOrder`; `inputOrder >= 0`. A later revision of the same document may therefore link the same source or reuse the same `inputOrder`, while a repeat link inside one revision is rejected.
- Each link binds a real `SourceSnapshot` through the composite digest foreign key, the document revision, the task, and an ACTIVE `Membership` actor in the same Workspace.
- An insert-time guard requires the snapshot to be in the same Workspace and project, `validationStatus = VALID`, `lifecycleStatus = ACTIVE`, and a role-compatible `sourceKind`: `PRODUCT_SOURCE` with `sourceKind = PRODUCT_SOURCE`, and `REFERENCE_STYLE` with `sourceKind = PRODUCT_REFERENCE`. A `PRODUCT_SOURCE` link must resolve to the source bound to the task's active truth revision.
- Every link row is immutable: `UPDATE` and `DELETE` are rejected. The legacy `ArtifactRevisionSourceLink` table and its constraints are not changed.

`ArtifactRevision` additions:

```text
documentBody JSONB NULL
documentDigest TEXT NULL
```

- Both fields are immutable edit metadata, never a second content substitute. `storageLocator` still points to the single immutable PNG and `textBody` stays `NULL`. `documentDigest` is the canonical JSON SHA-256 of `documentBody`; `contentDigest` is the PNG SHA-256.
- The existing full-row immutability trigger on `ArtifactRevision` continues to reject every `UPDATE` and `DELETE`; document revisions are append-only.
- `Artifact.selectedArtifactRevisionId` and `AssetTask.currentArtifactRevisionId` remain the initial task output and stay equal to each other. They are not advanced by user edits. The UI "current edit version" explicitly reads the `EditableDocument` head.
- The task created by the first save is terminal and consistent with the unchanged `AssetTask_state_check` and guard: `taskType=INTERNAL_SINGLE_IMAGE`, `outputPurpose=INTERNAL_TEST`, no `GenerationAttempt`, and `currentArtifactRevisionId` pointing at the first `SYSTEM_LAYOUT` revision. The old guard function and trigger are not modified.

The first save occurs only in a real authorized transaction and creates the canonical `AssetTask`, `Artifact`, `EditableDocument`, the first `SYSTEM_LAYOUT` revision, and its source links. A subsequent `USER_EDIT` binds the same domain truth, document, direct predecessor, and actor, and advances the document head by compare-and-swap.

## 6. Single migration and the three CHECK replacements

The only new migration is `prisma/migrations/20260910000000_p2_single_image_local_v1/migration.sql`. Historical migrations are not edited; the dependency set and lockfile do not change; no old enum label set, old function, or old trigger is changed; there is no DML, backfill, cutover, reset, down migration, or shared or production database application.

The registered independent exception name is `P2_SINGLE_IMAGE_LOCAL_DDL_V1`. It is separate from the consumed `P2_S1I_COMPAT_DDL_V1` and may be used only by the activated implementation task in its single migration.

New-object requirements:

- New models `EditableDocument` and `EditableDocumentSourceLink` with the columns, uniqueness, and foreign keys of section 5.
- New `ArtifactRevision` nullable fields `documentBody` and `documentDigest`, plus the necessary composite uniqueness and foreign keys: `ArtifactRevision_scope_document_revision_key (workspaceId, projectId, editableDocumentId, artifactRevisionId)`, `ArtifactRevision_scope_document_fkey (workspaceId, projectId, assetTaskId, truthRevisionId, editableDocumentId) -> EditableDocument`, and `ArtifactRevision_document_parent_fkey (workspaceId, projectId, editableDocumentId, parentArtifactRevisionId) -> ArtifactRevision`.
- New guard functions and triggers for document scope/head/provenance, source-link role/digest/immutability and same-domain insert validation, and document-revision shape. These are new objects; the frozen `public.p2_guard_asset_task_change()`, `public.p2_guard_artifact_change()`, the frozen runner, and the harness are not modified.

Exactly three CHECK constraints are dropped and recreated in the same transaction under the same names, finishing `convalidated = true`. `NOT VALID` is forbidden.

1. `ArtifactRevision_p2_contract_check` becomes `(old branch) OR (new SYSTEM_LAYOUT branch) OR (new USER_EDIT branch)`. The old branch reproduces, byte-semantically, the predecessor predicate in `prisma/migrations/20260905002000_p2_internal_attempt_artifact_lineage/migration.sql` and additionally requires `"documentBody" IS NULL AND "documentDigest" IS NULL`. It retains every old term: nonblank trim-stable identifiers, nonnull trim-stable `generationAttemptId`, nonnull trim-stable `storageLocator`, null `textBody`, null `editableDocumentId`, null `parentArtifactRevisionId`, null `brandKitRevisionId`, null `visualPlanId`, null `createdByActorId`, `revisionNumber = 1`, `kind = 'IMAGE'`, `origin = 'SYSTEM_LAYOUT'`, `status = 'CANDIDATE'`, `mediaType = 'image/png'`, `byteSize = 68`, `width = 1`, `height = 1`, sha256 `inputBindingDigest` and `contentDigest`, and the frozen 1x1 content digest. Existing rows are validated automatically because the two new columns are added as `NULL`.

The new SYSTEM_LAYOUT branch requires: `generationAttemptId IS NULL`, `editableDocumentId IS NOT NULL`, `parentArtifactRevisionId IS NULL`, `brandKitRevisionId IS NULL`, `visualPlanId IS NULL`, `documentBody IS NOT NULL`, `documentDigest IS NOT NULL`, `storageLocator IS NOT NULL` and trim-stable, `textBody IS NULL`, `createdByActorId IS NULL`, `revisionNumber = 1`, `kind = 'IMAGE'`, `origin = 'SYSTEM_LAYOUT'`, `status = 'CANDIDATE'`, `mediaType = 'image/png'`, `width = 1080`, `height = 1080`, `byteSize BETWEEN 1048576 AND 20971520`, and sha256 `inputBindingDigest`, `contentDigest`, and `documentDigest`.

The new USER_EDIT branch requires: `generationAttemptId IS NULL`, `editableDocumentId IS NOT NULL`, `parentArtifactRevisionId IS NOT NULL`, `brandKitRevisionId IS NULL`, `visualPlanId IS NULL`, `documentBody IS NOT NULL`, `documentDigest IS NOT NULL`, `storageLocator IS NOT NULL` and trim-stable, `textBody IS NULL`, `createdByActorId IS NOT NULL` and trim-stable, `revisionNumber > 1`, `kind = 'IMAGE'`, `origin = 'USER_EDIT'`, `status = 'CANDIDATE'`, `mediaType = 'image/png'`, `width = 1080`, `height = 1080`, `byteSize BETWEEN 1048576 AND 20971520`, and sha256 `inputBindingDigest`, `contentDigest`, and `documentDigest`.

A CHECK cannot query another table, so "valid document and same-domain truth" is enforced by the composite foreign keys and the document-revision guard, not by the CHECK. A forged document ID cannot admit an otherwise illegal old row: the old branch is unchanged and requires `documentBody IS NULL` and `documentDigest IS NULL`, while every new branch requires a real document through the composite foreign key and the guard.

2. `P2DomainEvent_type_check` keeps all three old values and adds exactly two:

```sql
CHECK ("eventType" IN (
  'truth_revision.activated.v1',
  'generation_attempt.started.v1',
  'artifact_revision.created.v1',
  'editable_document.created.v1',
  'editable_document.user_edited.v1'
))
```

3. `P2DomainEvent_body_check` preserves the three predecessor branches byte-semantically, including the `truth_revision.activated.v1` branch's SQL `TRUE`/`NULL` acceptance behavior and its allowance of extra keys, and the two nested-typeof object guards. It appends exactly two branches:

The `editable_document.created.v1` object has exactly these eight string keys and no other key: `artifactRevisionId`, `assetTaskId`, `contentDigest`, `createdByActorId`, `documentDigest`, `editableDocumentId`, `headArtifactRevisionId`, `truthRevisionId`. Every value is a JSON string and nonblank; the two existing digest fields `contentDigest` and `documentDigest` match `^[0-9a-f]{64}$`; `headArtifactRevisionId` equals `artifactRevisionId`. No third digest key exists.

The `editable_document.user_edited.v1` object has exactly these nine string keys and no other key: `artifactRevisionId`, `assetTaskId`, `contentDigest`, `documentDigest`, `editableDocumentId`, `editedByActorId`, `headArtifactRevisionId`, `parentArtifactRevisionId`, `truthRevisionId`. Every value is a JSON string and nonblank; the two existing digest fields `contentDigest` and `documentDigest` match `^[0-9a-f]{64}$`; `headArtifactRevisionId` equals `artifactRevisionId`; `parentArtifactRevisionId` differs from `artifactRevisionId`. No third digest key exists.

Both new branches use `CASE WHEN jsonb_typeof("eventBody") = 'object' THEN (...) IS TRUE ELSE FALSE END`, so object operators never execute on SQL `NULL`, JSON null, strings, numbers, booleans, or arrays. The old `artifact_revision.created.v1` event must never be used to represent a document revision and is not widened.

Preflight and rollback requirements:

- Before the first DDL statement, in the same transaction, catalog assertions re-read and freeze the predecessor enums, tables, columns, keys, constraints, all three old CHECK definitions, and the frozen guard function and trigger identities. Missing, duplicate, or drifted objects abort with a distinct error before any mutation. Catalog drift stops the task; it is not repaired by widening the contract.
- The migration is one `BEGIN`/`COMMIT` transaction containing every statement and exactly one rollback-probe sentinel. A test injects an artificial exception in memory immediately after the sentinel without editing the migration file; after rollback every definition, validation state, enum label, function identity, and trigger binding must equal the pre-run snapshot.
- The migration is applied only to the exclusive task-local loopback PostgreSQL 17 clusters frozen in section 3. The test cluster at `127.0.0.1:55481` is disposable; the retained acceptance cluster at `127.0.0.1:55482` is the single explicit narrow exception to both the disposable-only and persistent-database prohibitions under the exact resource binding in section 3, is used only for non-destructive Owner acceptance, and is retained until Owner acceptance or explicit cleanup. Old-domain positive and negative cases are unchanged, both new event witnesses succeed, invalid JSON is safely rejected, and all constraints end `validated`.

## 7. Authentication opt-in boundary

The only authentication change in this slice is the explicit opt-in local-acceptance mail sink defined by the appended clause in `docs/governance/V5_P2_S1E_AUTH_CONTRACT.md`. It is limited to synthetic `@example.invalid` acceptance identities in the local acceptance flow.

- Real Auth.js verification, callback, cookie, and session behavior is used; the token is database-persisted, single-use, and atomically consumed.
- The claim route is loopback-only, gated by a process-random per-process nonce, and each claim is single-use. URLs, tokens, cookies, session values, and nonces are never logged, reported, or committed.
- Default and production behavior fail closed: without the explicit isolated local mode, no sink is wired, the non-production transport fails closed, and the claim route returns `404`.
- No real email, SMTP account, API key, user account, browser profile, production data, or provider credential is read, printed, stored, committed, or uploaded.
- No public sign-up, account linking, password, recovery, OAuth provider, or new login method is added, and the compatibility-maintenance path cannot be used to reach this sink.

## 8. Idempotency, recovery, and acceptance

Idempotency and recovery:

- Double-click and network replay use one `intent`/`idempotencyKey`. The key binds the intent and request body.
- The same key with a different body is rejected. A stale head is rejected with `409`.
- An unknown result first reads the existing intent result; it never creates a second task or revision.
- A failed or rolled-back save preserves the existing canvas, the old PNG, and the document head. It never deletes an existing image or version.
- Reopen reads document and PNG data from the server; `localStorage` is never treated as saved state. The canvas is replaced only after fonts and product images load successfully.
- Download returns the already-saved PNG and triggers no planning, execution, or new revision.
- Unverified user text stays review-pending and is not promoted to a product fact. An edit never inherits an old QA conclusion, and no new version claims QA or listing readiness.

Required future acceptance evidence (not established by this governance stage):

- The database revision count, parent/head/actor/source digests are correct after save; close and reopen of the application and browser still reads and continues editing without a new model call.
- The PNG decodes to a real 1080x1080; saved and downloaded bytes and hashes match the preview export; reopened rendering has no missing font, cropped product, or cropped copy.
- Product pixels and text are independent layers; moving or editing text does not change the ID, source, geometry, or content of non-target layers, and undo or failure preserves the old canvas.
- Genuine Auth.js verification, callback, cookie, and session; anonymous, replay, expired or revoked session, cross-Workspace, forged workspace, and bad nonce all fail closed.
- All business Provider construction and call spies are zero; the browser network and service audit is zero; `GenerationAttempt` does not increase.
- Fresh and repeated migration, old positive and negative domains, illegal cross-domain and forged documents, immutable rows, and full migration rollback all pass.

## 9. Activation, non-authorization, and verification scope

This governance slice is inactive until exact human semantic review, an explicitly authorized ordinary merge commit, and successful `Quality gates` for the resulting exact `main` push. The activation SHA is the only base the future implementation task may use, and no intervening `main` commit is allowed.

The future implementation task is not authorized in advance by this document. It requires its own exact-binding owner approval over its own final Issue body digest. Actual Issue and PR numbers, approval comment IDs, body digests, and the implementation base are `UNKNOWN` until assigned and must never be represented as already valid. A machine `PASS` is metadata and CI evidence only; it never authorizes Ready, merge, deployment, or product acceptance.

Verification scope for this governance stage:

- Performed: documentation and static review of the five-file diff; the two frozen `node --check` syntax checks; the frozen governance `node --test` suite; and the exact approved `git diff --check`.
- Not run and not established here: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, `npm run db:generate`, `npm run db:migrate:check`, CI Quality gates, browser or Auth.js execution, PNG decode, real product visual comparison, database execution, and any business model call. Integration and migration local execution are explicitly `NOT_RUN` and not applicable to this documentation diff.
- Application runtime, database, model, activation, and actual business acceptance are not established by this stage. `node_modules` is intentionally not prepared; the caller executes the remaining fixed publication gates during independent review after this worktree is released.

Hard stops: any path, identity, scope, digest, or base drift; an exhausted budget; a permission, credential, or resource mismatch; a paid business call; modification of an old runner, historical migration, old enum, or old frozen evidence; and any shared or production database, real email, or release action. On any of these, stop the affected part, preserve evidence, and update the existing record instead of creating a replacement task.

## 10. One-use Windows CRLF migration-validation bridge

The local Windows checkout exposed `P2_S1I_PREDECESSOR_GUARD_MISMATCH` before this slice migration ran. The predecessor function body contains six CRLF pairs; the historical lineage migration normalizes the database function body to LF but compares it with a CRLF-preserving expected literal. This is a checkout-byte compatibility defect. It is not evidence that this slice migration or product behavior passed or failed.

`ISSUE73_WINDOWS_CRLF_RUNTIME_BRIDGE_V1` is registered by protected-path Issue #74, exact base `3e37934d6350bd1fd5913a1b208d855a50e2588e`, Issue-body SHA-256 `b8a199ddaaeffbf4b817fa169044cb50332fa6ffe2b06aa704e9cc3ca39cac30`, unedited Owner approval comment `5621852229` with raw UTF-8 SHA-256 `178862a7a175e364920a21ddb1f19eeb5c8c45eeae1642731318802c939d5340`, and branch `codex/issue73-windows-crlf-runtime-bridge-v1-3e37934d`. It stays `PROPOSED_INACTIVE` until its exact reviewed Head passes `Quality gates`, the Owner separately authorizes an ordinary one-parent squash merge to that base whose tree equals the reviewed Head, and the exact resulting `main` push passes `Quality gates`.

After activation, only existing Issue #73 may consume one unedited Owner `ISSUE73_WINDOWS_CRLF_RUNTIME_BRIDGE_JSON` record. It must bind the real repair Issue, approval, Draft PR, reviewed Head tree, merge and exact-main-push CI; old and new Issue #73 body digests and branch Heads; approval comment `5616238018`; the exact 31-path business scope; and every byte, SHA-256 and Git blob identity below. The record permits one ordinary two-parent merge of the activated governance merge into existing branch `codex/single-image-local-v1`, preserving all 31 uncommitted file bytes, followed by only the necessary Issue #73 base/readback rebinding and a new exact-body Owner approval. Missing, duplicate, edited, stale, replayed, cross-task or unstable evidence is `HOLD`.

The one permitted local migration-validation transaction has these immutable inputs:

| Historical path | Frozen Windows bytes / SHA-256 | Canonical Git blob | Canonical bytes / SHA-256 |
| --- | --- | --- | --- |
| `prisma/migrations/20260901130000_p2_internal_single_image_asset_task/migration.sql` | 5304 / `0584f4efe01962c76fce87c68456cd308abd4585e926f9472cf579416a341f48` | `045a10480d0b3bd898fb2bee9f309789b9ea0bb7` | 5157 / `eb060c49ebb8bf8497e1851b386ea66d7a7ec8e34b7b30e4948e898d2392be76` |
| `prisma/migrations/20260905002000_p2_internal_attempt_artifact_lineage/migration.sql` | 59141 / `5db64b643f3415380eb5d405c4b09191930f70b51faf39839aad7f5867c014da` | `70f4f6ce1c054f8dafa245813451c3fcbef5aa9d` | 58809 / `5bdbd911af7bc8096b39632d3bea7a66788b4b88fa36aa8de3b846d170ef5b90` |

Before materialization, the process verifies both frozen Windows identities and captures both original byte arrays in memory. It then materializes only the exact canonical Git blob bytes, verifies both canonical SHA-256 values, and runs only the already frozen migration and integration commands against the section 3 resources. A mandatory `finally` path restores both exact original byte arrays and verifies the Windows hashes, Git index equality, zero staged change and no changed path outside the Issue #73 allowlist. After interruption, restoration and verification are the only allowed next actions before any test, database, application, browser, Git or record continuation.

The acceptance migration remains later in the same fixed sequence. It may be applied to `127.0.0.1:55482` / `vision_local_v1_acceptance` / `runtime\pg-acceptance` only after the disposable cluster proves fresh migration, repeated deploy, rollback, complete old-domain equality, concurrency and integration behavior. The bridge is permanently `CONSUMED` only after exact restoration and acceptance-migration evidence is recorded.

This bridge changes no SQL or product contract. Neither historical migration may be edited, staged, committed or published. It authorizes no third migration, general normalization, `.gitattributes`, Git configuration, skipped or weakened gate, alternate database, shared or production resource, service, Windows user or ACL change, credential, email, Provider, fee, deployment, Ready, merge of Issue #73, permission expansion or security relaxation. The 31-path scope, dependency set, one new migration, resources, budgets, business semantics and all other acceptance requirements remain unchanged.

## Issue #73 S1I upgrade-fixture existing-cluster exception

Owner-approved task ISSUE73_S1I_UPGRADE_FIXTURE_EXISTING_ACCEPTANCE_CLUSTER_V1 is rooted at Issue #76, Issue-body SHA-256 1cd6fc112a5a04061f43de57facd4e937fb45b90ba4a60b5e861e9c9d40993f7, unedited Owner approval comment 5628353167 with raw UTF-8 SHA-256 a06beca9daaa317566e83e4a13cb9c9ec94a8a8481319fd98325357d58c57377, repository easyplay198-create/image-generation-mvp ID 1328682481, and Owner easyplay198-create ID 268785207.

ISSUE73_S1I_UPGRADE_FIXTURE_EXISTING_ACCEPTANCE_CLUSTER_V1 is a governance-only task on base 51a278e545d102766aab6ed71eba7e4b7ab1fe1d and branch codex/issue73-s1i-upgrade-fixture-v1-51a278e. It changes only the registered four protected paths and stays PROPOSED_INACTIVE through one initially Draft PR. Activation requires exact semantic review, exact-Head Quality gates, separate Owner authorization for an ordinary one-parent squash merge with reviewed-tree equality, and successful exact-main-push Quality gates.

After activation, only the same unfinished Issue #73 closeout may once set S1I_UPGRADE_DATABASE_URL to postgresql://vision_local_v1_owner@127.0.0.1:55482/postgres while DATABASE_URL remains its registered 127.0.0.1:55481 test resource. The unchanged frozen test may create, use and finally drop at most one database matching ^s1i_upgrade_[0-9a-f]{32}$. It never receives a URL naming vision_local_v1_acceptance.

Before the test, the scratch set is empty and read-only evidence captures maintenance current_user plus the acceptance database identity, stable catalog/settings, schema checksum and deterministic table-data digest. A cleanup target is valid only when absent before the run, the sole new exact-name match, owned by vision_local_v1_owner, and not postgres or vision_local_v1_acceptance. Cleanup may drop only that target. The acceptance database may never be deleted, rebuilt, renamed, cleared, migrated, altered, truncated or used for destructive testing during this fixture. Afterward the scratch set is empty and all acceptance evidence is equal. On interruption or ambiguity, cleanup and read-only verification of the sole proven scratch database are the only next actions.

After activation and before Issue #73 changes again, exactly one unedited Owner ISSUE73_S1I_UPGRADE_FIXTURE_CONTINUATION_JSON record with schema issue73-s1i-upgrade-fixture-continuation-v1, a unique continuationId and nonce, and state AUTHORIZED_PENDING_SINGLE_CONSUMPTION must exist. It binds this real governance activation; existing bridge comment 5628051892 and raw SHA-256 3fc8b8cacdaf2a31a3fac9bf97765172f8e0a95bbb19f070777a4102b92da5cc; current Issue #73 body SHA-256 709e62bc08c2db86732ecc73c400cb4815a2e979f2ef2869652cd9cd64a2f3fa; approval comment 5628072718 and raw SHA-256 8fda52485e696425bc80ca06741efc84cc04df8907fa75fde3fde9fdfbe610c0; branch and old Head 7c12c4a417f5079dd999bce450af2f9220896afa; exact 31-file manifest SHA-256 ab617c83a6ac9188cf6fbee6dea695e5802d0739e0158fab755cbfcab936ed88; real new base, deterministic new Head and exact field-only body replacements; and all unchanged scope, resource, budget and lifecycle facts.

The continuation permits one ordinary two-parent local merge with old Head 7c12c4a417f5079dd999bce450af2f9220896afa as first parent and the governance merge as second parent, preserving all 31 business bytes, followed only by the bound Issue base/readback replacements and one new exact-body Owner approval. This consumes the continuation record. It never edits, duplicates, reissues, resets or consumes the existing runtime bridge, which remains pending until historical-byte restoration and successful acceptance-migration evidence consume it once.

After the new approval the fixed order is process-bounded canonical-byte materialization; disposable fresh/repeated migration; full unchanged integration using only the 55482 maintenance endpoint for the scratch fixture; scratch absence and acceptance preservation; one application of the existing migration to retained vision_local_v1_acceptance while canonical bytes remain materialized; mandatory outer-finally restoration and verification of the original working bytes; original-bridge consumption evidence; then original app/browser/auth restart/real-SKU acceptance. Starting or initializing only the already registered disposable 127.0.0.1:55481 resource at its frozen directory creates no new resource identity. No source/test/script change, third database instance, new port/directory/role/credential/dependency/migration/model/provider/fee/permission/correction/retry, Issue #73 push/PR/Ready/merge, deployment, force or protection bypass is authorized. For Issue #76, automated, local and published correction limits are 0; Claude and business-model calls are 0; fee cap is CNY 0; and the endpoint is one initially Draft PR.

## Issue #73 legacy upgrade-fixture ordering repair

Owner-approved task `ISSUE73_LEGACY_UPGRADE_FIXTURE_ORDERING_REPAIR_V1` is rooted at Issue #78, Issue-body raw UTF-8 SHA-256 `8e2ff08cd052d905d22a0001e7ae446a609af7b1191411525f9de18acfb9f431`, and unedited Owner approval comment `5629190938` with raw UTF-8 SHA-256 `c28eb16cefb1e143861035693185d58966db03d533d15081e872cab0e7bfd06b`. It is a `CONTROL_PLANE_CHANGE + P2_LOCKED` task on exact base `c9b92ad951e943228842ab862b6a0439a45975f4`, branch `codex/issue73-legacy-upgrade-fixture-ordering-v1-c9b92ad`, repository `easyplay198-create/image-generation-mvp` ID `1328682481`, and Owner `easyplay198-create` ID `268785207`. Its exact allowlist is `AGENTS.md`, `docs/governance/GITHUB_AUTONOMOUS_DEVELOPMENT_CONTROL_PLANE_V2.md`, `docs/governance/V5_P2_ENTRY_GOVERNANCE.md`, and `docs/governance/V5_SINGLE_IMAGE_LOCAL_V1_CONTRACT.md`. It remains `PROPOSED_INACTIVE` through one initially Draft PR; activation requires exact semantic review, exact-Head `Quality gates`, separate Owner authorization for an ordinary one-parent squash merge to the authorized base with reviewed-tree equality, and successful exact-main-push `Quality gates`.

After activation, only the same unfinished Issue #73 closeout may consume this repair once. It is an explicit task-scoped exception to the ordinary five-worktree-local-correction ceiling: all five prior corrections and their records remain consumed without refund, renumbering, replay or reset. This exception adds exactly one fixture-only local write and one fixed post-write validation run, and expires permanently when that write occurs or its bound validation fails.

The only additional Issue #73 path is `tests/integration/p2-s1i-internal-attempt-artifact-lineage.test.ts`. Its exact source is 41843 bytes, SHA-256 `6d9d673030c73121dba7becd0c0d678b553fafd1cd089142a832c5fb2a17e93e`, Git blob `5585b28c2b2529f93d374b8852af75c403505afd`. The only permitted byte change replaces its single migration-directory predicate `entry !== migrationName` with `entry < migrationName`, producing exactly 41841 bytes and SHA-256 `e5f47bdfb5c637818ac47dec294d71613da892025d3d9ed722d5a3167bf97cee`. The current 31-file manifest after the consumed cast correction is SHA-256 `0fa72acb3c8325e89f7f81ed0d042ac6ae957a6a8a6e1be0a8c82ea2c52da020`; the proposed 32-file manifest after the fixture write is SHA-256 `8f940f0edac206b2cf493a120ead897d47895188bbc467d95d9d7f498a42f4bd`. Every assertion, timeout, migration SQL byte, expected digest, expected catalog, rollback probe, database rule and test count remains unchanged. Any nonconforming migration directory or byte mismatch stops before writing.

Before Issue #73 changes again, exactly one new unedited Owner `ISSUE73_LEGACY_UPGRADE_FIXTURE_ORDERING_CONTINUATION_JSON` comment must bind this real governance activation; the current Issue #73 body SHA-256 `b767a09f39d47cc23e601d1b412116a238e1397c0aabc1a2946b3de682384d23`, approval comment `5628811763` and raw digest, branch and old Head `4552fcb97ac8f97c7a3ee2a943fd59d0a536a724`; both 31/32-file manifests; the source/candidate fixture identities; final cast authorization comment `5628976571` and raw SHA-256 `d360961ee3f6a845ccd3143abf86c4f160f386dc50d2c58ed56891ff7cb7e666`; the existing Windows CRLF runtime bridge and Issue #76 continuation with their actual pending or consumed states; the real new base, deterministic new two-parent Head/tree, exact Issue-body replacement map; and all unchanged resources, semantics, exclusions and lifecycle boundaries.

That continuation permits one ordinary two-parent local merge with first parent `4552fcb97ac8f97c7a3ee2a943fd59d0a536a724` and second parent the real Issue #78 activation merge while preserving all current 31 business bytes. It then permits only the bound Issue #73 base/readback/Head/allowlist/manifest and special-exception fields to advance, followed by one new exact-body Owner approval. Neither the old Issue #76 continuation nor any correction record is reused. The Windows CRLF runtime bridge remains pending until successful acceptance migration and exact historical-byte restoration consume it once.

Only after that approval may the exact fixture candidate be written. The fixed sequence then runs once: required non-database gates; process-bounded canonical historical-byte materialization in the existing mandatory outer `finally`; fresh and repeated disposable migration; the unchanged complete integration suite using only the approved `127.0.0.1:55482/postgres` maintenance endpoint for its owned scratch database; scratch absence and retained acceptance preservation; one migration application to `vision_local_v1_acceptance`; exact original-byte restoration; runtime-bridge consumption evidence; and the existing local application/browser/Auth.js restart/real-SKU PNG acceptance. Any failure stops with no further correction or retry.

This repair adds no dependency, migration, database instance, port, directory, role, credential, permission, workflow, model, provider, fee, published correction, destructive acceptance action, force operation, protection bypass, deployment or Issue #73 push/PR/Ready/merge authority. For Issue #78, automated, local and published correction limits are zero; Claude and business-model calls are zero; fee cap is CNY 0; and the endpoint is one initially Draft PR. Ready, merge, activation, Issue #73 mutation, fixture write and runtime execution remain separately gated.
