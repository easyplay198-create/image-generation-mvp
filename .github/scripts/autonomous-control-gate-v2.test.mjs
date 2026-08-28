import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  POLICY,
  evaluateControlSnapshot,
  extractMarkedJson,
  formatResultLines,
  isCanonicalHeadRef,
  isCanonicalRepositoryPath,
  latestCi,
  normalizeEvent,
  resolvePrNumber,
  sha256Text,
} from './autonomous-control-gate-v2.mjs';

const BASE_SHA = 'f6a55979dd37aba84e66d19c947b6be572c9973c';
const HEAD_SHA = '1111111111111111111111111111111111111111';
const PR_CREATED_AT = '2026-08-28T00:00:00Z';
const CI_CREATED_AT = '2026-08-28T00:01:00Z';
const CI_RUN_NAME = `CI pull_request PR-19 base-${BASE_SHA} head-${HEAD_SHA}`;

function marker(name, value) {
  return `<!-- ${name}_BEGIN\n${JSON.stringify(value)}\n${name}_END -->`;
}

function owner() {
  return { ...POLICY.owner };
}

function actionsBot() {
  return { ...POLICY.actionsBot };
}

function makeSnapshot({
  taskClass = 'ORDINARY_TASK',
  maxRepairRounds = 0,
  allowedPaths = ['src/example.ts'],
  changedFiles,
  ciConclusion = 'success',
  ciStatus = 'completed',
  phase = 'P2_LOCKED',
  eventType = 'workflow_run',
  authorizedHeadRef,
} = {}) {
  const contract = {
    allowedPaths,
    authorizedBaseSha: BASE_SHA,
    maxRepairRounds,
    phase,
    requiredChecks: [POLICY.qualityJobName],
    schema: POLICY.schema,
    taskClass,
  };
  if (taskClass === 'P2_IMPLEMENTATION') {
    contract.authorizedHeadRef = authorizedHeadRef ?? 'issue-21-p2-draft-only';
  }
  const issueBody = marker('CONTROL_PLANE_V2_CONTRACT', contract);
  const issueBodySha256 = sha256Text(issueBody);
  const approval = {
    authorizedBaseSha: BASE_SHA,
    issueBodySha256,
    maxRepairRounds,
    phase,
    schema: POLICY.schema,
  };
  if (taskClass === 'P2_IMPLEMENTATION') {
    approval.authorizedHeadRef = contract.authorizedHeadRef;
  }
  const link = {
    approvalCommentId: 9001,
    authorizedBaseSha: BASE_SHA,
    issueBodySha256,
    issueNumber: 18,
    schema: POLICY.schema,
  };
  const base = { ref: 'main', sha: BASE_SHA, repoId: POLICY.repositoryId };
  const head = {
    ref: contract.authorizedHeadRef ?? 'issue-18-test',
    sha: HEAD_SHA,
    repoId: POLICY.repositoryId,
  };
  return {
    repository: {
      id: POLICY.repositoryId,
      fullName: POLICY.repositoryFullName,
      defaultBranch: POLICY.defaultBranch,
      owner: owner(),
      allowAutoMerge: false,
    },
    event: {
      type: eventType,
      triggerId: eventType === 'workflow_run' ? '8001' : '7001',
      workflowId: POLICY.qualityWorkflowId,
      workflowPath: POLICY.qualityWorkflowPath,
      workflowEvent: 'pull_request',
      runName: CI_RUN_NAME,
      displayTitle: CI_RUN_NAME,
      headSha: HEAD_SHA,
      headBranch: head.ref,
      runAttempt: eventType === 'workflow_run' ? 1 : null,
      actor: { id: 123, login: 'contributor', type: 'User' },
      authorAssociation: 'CONTRIBUTOR',
    },
    issue: {
      number: 18,
      state: 'open',
      body: issueBody,
      user: owner(),
      isPullRequest: false,
    },
    issueComments: [{
      id: 9001,
      body: marker('CONTROL_PLANE_V2_APPROVAL', approval),
      user: owner(),
      authorAssociation: 'OWNER',
      createdAt: '2026-08-28T00:00:00Z',
      updatedAt: '2026-08-28T00:00:00Z',
      htmlUrl: 'https://github.com/example/issues/18#issuecomment-9001',
    }],
    pr: {
      number: 19,
      state: 'open',
      draft: true,
      merged: false,
      createdAt: PR_CREATED_AT,
      body: marker('CONTROL_PLANE_V2_LINK', link),
      user: owner(),
      base,
      head,
    },
    prTimeline: [],
    relatedPullRequests: [{ number: 19 }],
    changedFiles: changedFiles ?? allowedPaths.map((filename) => ({
      filename,
      previousFilename: null,
      status: 'modified',
      mode: '100644',
      previousMode: '100644',
    })),
    prComments: [],
    ci: {
      id: 8001,
      workflowId: POLICY.qualityWorkflowId,
      workflowName: POLICY.qualityWorkflowName,
      workflowPath: POLICY.qualityWorkflowPath,
      workflowState: 'active',
      runName: CI_RUN_NAME,
      runPath: POLICY.qualityWorkflowPath,
      displayTitle: CI_RUN_NAME,
      event: 'pull_request',
      headSha: HEAD_SHA,
      headBranch: head.ref,
      repositoryId: POLICY.repositoryId,
      headRepositoryId: POLICY.repositoryId,
      createdAt: CI_CREATED_AT,
      status: ciStatus,
      conclusion: ciConclusion,
      checkSuiteId: 8101,
      runAttempt: 1,
      checkSuite: {
        id: 8101,
        repositoryId: POLICY.repositoryId,
        appId: POLICY.actionsApp.id,
        appSlug: POLICY.actionsApp.slug,
        headSha: HEAD_SHA,
        headBranch: head.ref,
        after: HEAD_SHA,
        status: ciStatus,
        conclusion: ciConclusion,
        pullRequests: [],
      },
      jobTotalCount: 1,
      jobs: [{
        id: 8201,
        name: POLICY.qualityJobName,
        status: ciStatus,
        conclusion: ciConclusion,
        headSha: HEAD_SHA,
        runId: 8001,
        runAttempt: 1,
      }],
    },
  };
}

function makeReconcileSnapshot(options = {}) {
  const snapshot = makeSnapshot({ ...options, eventType: 'issue_comment' });
  snapshot.event.actor = owner();
  snapshot.event.authorAssociation = 'OWNER';
  snapshot.event.command = 'CONTROL_PLANE_V2_RECONCILE';
  return snapshot;
}

function holdReason(snapshot) {
  const result = evaluateControlSnapshot(snapshot);
  assert.equal(result.result, 'HOLD');
  assert.equal(result.controlState, 'HOLD');
  assert.equal(result.autoFixWrite, 'DISABLED');
  assert.equal(result.autoMerge, 'DISABLED');
  assert.equal(result.p2Status, 'LOCKED');
  return result.reasons.join(',');
}

function ledgerEntry(snapshot, overrides = {}) {
  return {
    approvalCommentId: 9001,
    authorizedBaseSha: BASE_SHA,
    fixedRequestSha256: '2'.repeat(64),
    headSha: HEAD_SHA,
    issueBodySha256: sha256Text(snapshot.issue.body),
    issueNumber: 18,
    prNumber: 19,
    repositoryId: POLICY.repositoryId,
    round: 1,
    schema: POLICY.schema,
    triggerId: '8001',
    triggerType: 'workflow_run',
    ...overrides,
  };
}

function ledgerComment(entry, overrides = {}) {
  return {
    id: 9901,
    body: marker('CONTROL_PLANE_V2_LEDGER', entry),
    user: actionsBot(),
    authorAssociation: 'NONE',
    createdAt: '2026-08-28T00:01:00Z',
    updatedAt: '2026-08-28T00:01:00Z',
    ...overrides,
  };
}

test('accepts a fully bound exact-head successful observer snapshot', () => {
  const result = evaluateControlSnapshot(makeSnapshot());
  assert.equal(result.result, 'PASS');
  assert.equal(result.controlState, 'OBSERVER_ONLY');
  assert.equal(result.decision, 'CI_ACCEPTED_OBSERVER_ONLY');
  assert.equal(result.effectiveAutoFixLimit, 0);
  assert.equal(result.autoFixWrite, 'DISABLED');
  assert.equal(result.autoMerge, 'DISABLED');
  assert.equal(result.p2SemanticEnforcement, 'HUMAN_GOVERNANCE_REQUIRED');
  assert.equal(result.unverifiedItems.includes('PROPOSED_CONTROL_REVISION_POST_MERGE_ACTIVATION'), false);
});

test('accepts an owner-bound P2 task only as Draft-only observer evidence', () => {
  const result = evaluateControlSnapshot(makeSnapshot({
    taskClass: 'P2_IMPLEMENTATION',
    phase: 'P2_DRAFT_ONLY',
    authorizedHeadRef: 'issue-21-p2-draft-only',
  }));
  assert.equal(result.result, 'PASS');
  assert.equal(result.controlState, 'OBSERVER_ONLY');
  assert.equal(result.decision, 'P2_DRAFT_ONLY_CI_ACCEPTED_OBSERVER_ONLY');
  assert.equal(result.p2Status, 'DRAFT_ONLY');
  assert.equal(result.autoFixWrite, 'DISABLED');
  assert.equal(result.autoMerge, 'DISABLED');
  assert.equal(
    result.humanActionRequired,
    'KEEP_DRAFT;HUMAN_SEMANTIC_REVIEW;DO_NOT_MERGE_BY_AUTOMATION',
  );
});

test('P2 contract, approval, owner, and branch bindings fail closed', () => {
  assert.match(
    holdReason(makeSnapshot({
      taskClass: 'P2_IMPLEMENTATION',
      phase: 'P2_DRAFT_ONLY',
      maxRepairRounds: 1,
    })),
    /P2_IMPLEMENTATION_REPAIR_LIMIT_NOT_ZERO/u,
  );
  assert.match(
    holdReason(makeSnapshot({
      taskClass: 'P2_IMPLEMENTATION',
      phase: 'P2_DRAFT_ONLY',
      authorizedHeadRef: 'bad..ref',
    })),
    /AUTHORIZED_HEAD_REF_INVALID/u,
  );

  const approvalMismatch = makeSnapshot({
    taskClass: 'P2_IMPLEMENTATION',
    phase: 'P2_DRAFT_ONLY',
  });
  const approval = extractMarkedJson(
    approvalMismatch.issueComments[0].body,
    'CONTROL_PLANE_V2_APPROVAL',
  );
  approval.authorizedHeadRef = 'issue-21-other-branch';
  approvalMismatch.issueComments[0].body = marker('CONTROL_PLANE_V2_APPROVAL', approval);
  assert.match(holdReason(approvalMismatch), /APPROVAL_BINDING_MISMATCH/u);

  const approvalPhaseMismatch = makeSnapshot({
    taskClass: 'P2_IMPLEMENTATION',
    phase: 'P2_DRAFT_ONLY',
  });
  const wrongPhaseApproval = extractMarkedJson(
    approvalPhaseMismatch.issueComments[0].body,
    'CONTROL_PLANE_V2_APPROVAL',
  );
  wrongPhaseApproval.phase = 'P2_LOCKED';
  approvalPhaseMismatch.issueComments[0].body = marker(
    'CONTROL_PLANE_V2_APPROVAL',
    wrongPhaseApproval,
  );
  assert.match(holdReason(approvalPhaseMismatch), /APPROVAL_SHAPE_INVALID/u);

  const nonOwner = makeSnapshot({ taskClass: 'P2_IMPLEMENTATION', phase: 'P2_DRAFT_ONLY' });
  nonOwner.pr.user = { id: 42, login: 'contributor', type: 'User' };
  assert.match(holdReason(nonOwner), /P2_PR_CREATOR_NOT_OWNER/u);

  const wrongBranch = makeSnapshot({ taskClass: 'P2_IMPLEMENTATION', phase: 'P2_DRAFT_ONLY' });
  wrongBranch.pr.head.ref = 'issue-21-other-branch';
  assert.match(holdReason(wrongBranch), /P2_PR_HEAD_REF_NOT_AUTHORIZED/u);
});

test('allows a historical locked approval before the current P2 approval', () => {
  const snapshot = makeSnapshot({ taskClass: 'P2_IMPLEMENTATION', phase: 'P2_DRAFT_ONLY' });
  snapshot.issueComments.unshift({
    ...snapshot.issueComments[0],
    id: 8000,
    body: marker('CONTROL_PLANE_V2_APPROVAL', {
      authorizedBaseSha: BASE_SHA,
      issueBodySha256: 'a'.repeat(64),
      maxRepairRounds: 0,
      phase: 'P2_LOCKED',
      schema: POLICY.schema,
    }),
  });
  assert.equal(evaluateControlSnapshot(snapshot).result, 'PASS');
});

test('ignores an untrusted forged approval marker', () => {
  const snapshot = makeSnapshot();
  snapshot.issueComments.unshift({
    ...snapshot.issueComments[0],
    id: 8999,
    user: { id: 42, login: 'attacker', type: 'User' },
    authorAssociation: 'NONE',
  });
  assert.equal(evaluateControlSnapshot(snapshot).result, 'PASS');
});

test('ignores malformed approval text from an untrusted actor', () => {
  const snapshot = makeSnapshot();
  snapshot.issueComments.unshift({
    ...snapshot.issueComments[0],
    id: 8999,
    body: '<!-- CONTROL_PLANE_V2_APPROVAL_BEGIN\n{bad\nCONTROL_PLANE_V2_APPROVAL_END -->',
    user: { id: 42, login: 'attacker', type: 'User' },
    authorAssociation: 'NONE',
  });
  assert.equal(evaluateControlSnapshot(snapshot).result, 'PASS');
});

test('rejects an edited trusted approval', () => {
  const snapshot = makeSnapshot();
  snapshot.issueComments[0].updatedAt = '2026-08-28T00:00:01Z';
  assert.match(holdReason(snapshot), /APPROVAL_EDITED_OR_TIME_MISSING/u);
});

test('allows one historical owner approval plus one current approval', () => {
  const snapshot = makeSnapshot();
  const historical = {
    authorizedBaseSha: BASE_SHA,
    issueBodySha256: 'a'.repeat(64),
    maxRepairRounds: 0,
    phase: 'P2_LOCKED',
    schema: POLICY.schema,
  };
  snapshot.issueComments.unshift({
    ...snapshot.issueComments[0],
    id: 8000,
    body: marker('CONTROL_PLANE_V2_APPROVAL', historical),
  });
  assert.equal(evaluateControlSnapshot(snapshot).result, 'PASS');
});

test('rejects duplicate current approvals', () => {
  const snapshot = makeSnapshot();
  snapshot.issueComments.push({ ...snapshot.issueComments[0], id: 9002 });
  assert.match(holdReason(snapshot), /VALID_APPROVAL_COUNT_2/u);
});

test('rejects an Issue body edit without reapproval', () => {
  const snapshot = makeSnapshot();
  snapshot.issue.body += '\nchanged';
  assert.match(holdReason(snapshot), /VALID_APPROVAL_COUNT_0/u);
});

test('rejects a linked object that is actually a pull request', () => {
  const snapshot = makeSnapshot();
  snapshot.issue.isPullRequest = true;
  assert.match(holdReason(snapshot), /LINKED_ISSUE_IS_PULL_REQUEST/u);
});

test('rejects a linked Issue number equal to the PR number', () => {
  const snapshot = makeSnapshot();
  snapshot.issue.number = snapshot.pr.number;
  assert.match(holdReason(snapshot), /LINKED_ISSUE_IS_PULL_REQUEST/u);
});

test('rejects a fork head', () => {
  const snapshot = makeSnapshot();
  snapshot.pr.head.repoId += 1;
  assert.match(holdReason(snapshot), /PR_IDENTITY_OR_STATE_INVALID/u);
});

test('rejects a non-draft or merged PR', () => {
  const snapshot = makeSnapshot();
  snapshot.pr.draft = false;
  assert.match(holdReason(snapshot), /PR_IDENTITY_OR_STATE_INVALID/u);
  const merged = makeSnapshot();
  merged.pr.merged = true;
  assert.match(holdReason(merged), /PR_IDENTITY_OR_STATE_INVALID/u);
});

test('rejects a stale workflow head', () => {
  const snapshot = makeSnapshot();
  snapshot.event.headSha = '3'.repeat(40);
  assert.match(holdReason(snapshot), /TRIGGER_HEAD_STALE/u);
});

test('binds workflow-run trigger source and dynamic title to the selected CI run', () => {
  for (const mutate of [
    (snapshot) => { snapshot.event.workflowPath = '.github/workflows/other.yml'; },
    (snapshot) => { snapshot.event.workflowEvent = 'push'; },
    (snapshot) => { snapshot.event.runName = `${CI_RUN_NAME} `; },
    (snapshot) => { snapshot.event.displayTitle = `${CI_RUN_NAME} `; },
    (snapshot) => { snapshot.event.headBranch = 'other'; },
  ]) {
    const snapshot = makeSnapshot();
    mutate(snapshot);
    assert.match(
      holdReason(snapshot),
      /TRIGGER_WORKFLOW_IDENTITY_INVALID|TRIGGER_RUN_NAME_BINDING_INVALID|TRIGGER_HEAD_STALE/u,
    );
  }

  const mismatched = makeSnapshot();
  mismatched.ci.runName = `${CI_RUN_NAME} `;
  assert.match(holdReason(mismatched), /TRIGGER_CI_IDENTITY_MISMATCH/u);
});

test('binds a workflow-run trigger to the exact positive run attempt', () => {
  const mismatched = makeSnapshot();
  mismatched.event.runAttempt = 2;
  assert.match(holdReason(mismatched), /TRIGGER_CI_RUN_ATTEMPT_MISMATCH/u);

  for (const invalidAttempt of [null, 0, '1']) {
    const invalid = makeSnapshot();
    invalid.event.runAttempt = invalidAttempt;
    assert.match(holdReason(invalid), /TRIGGER_RUN_ATTEMPT_INVALID/u);
  }

  const rerun = makeSnapshot();
  rerun.event.runAttempt = 2;
  rerun.ci.runAttempt = 2;
  rerun.ci.jobs[0].runAttempt = 2;
  assert.equal(evaluateControlSnapshot(rerun).result, 'PASS');

  rerun.ci.jobs[0].runAttempt = 1;
  assert.match(holdReason(rerun), /QUALITY_JOB_BINDING_OR_CONCLUSION_MISMATCH/u);
});

test('rejects any historical reuse of a head branch across all PR states', () => {
  const snapshot = makeSnapshot();
  snapshot.relatedPullRequests.push({ number: 20 });
  assert.match(holdReason(snapshot), /PR_NOT_UNIQUE_FOR_BRANCH/u);
});

for (const [status, conclusion] of [
  ['queued', null],
  ['completed', 'cancelled'],
  ['completed', 'skipped'],
  ['completed', 'neutral'],
  ['completed', 'timed_out'],
  ['completed', 'action_required'],
]) {
  test(`rejects CI state ${status}/${conclusion}`, () => {
    assert.match(
      holdReason(makeSnapshot({ ciStatus: status, ciConclusion: conclusion })),
      /CI_NOT_ACCEPTED_TERMINAL_STATE/u,
    );
  });
}

test('rejects path traversal and glob syntax in the allowlist', () => {
  assert.match(holdReason(makeSnapshot({ allowedPaths: ['src/../secrets.txt'] })), /ALLOWLIST_INVALID/u);
  assert.match(holdReason(makeSnapshot({ allowedPaths: ['src/*.ts'] })), /ALLOWLIST_INVALID/u);
});

test('rejects a rename whose previous path is not allowed', () => {
  const snapshot = makeSnapshot({
    allowedPaths: ['src/new.ts'],
    changedFiles: [{
      filename: 'src/new.ts',
      previousFilename: 'src/old.ts',
      status: 'renamed',
      mode: '100644',
      previousMode: '100644',
    }],
  });
  assert.match(holdReason(snapshot), /CHANGED_PATH_NOT_ALLOWED:src\/old.ts/u);
});

test('rejects a symlink addition and symlink deletion', () => {
  const added = makeSnapshot();
  Object.assign(added.changedFiles[0], { status: 'added', mode: '120000', previousMode: null });
  assert.match(holdReason(added), /SYMLINK_CHANGE/u);
  const removed = makeSnapshot();
  Object.assign(removed.changedFiles[0], { status: 'removed', mode: null, previousMode: '120000' });
  assert.match(holdReason(removed), /SYMLINK_CHANGE/u);
});

test('rejects a submodule addition and submodule deletion', () => {
  const added = makeSnapshot();
  Object.assign(added.changedFiles[0], { status: 'added', mode: '160000', previousMode: null });
  assert.match(holdReason(added), /SUBMODULE_CHANGE/u);
  const removed = makeSnapshot();
  Object.assign(removed.changedFiles[0], { status: 'removed', mode: null, previousMode: '160000' });
  assert.match(holdReason(removed), /SUBMODULE_CHANGE/u);
});

test('rejects missing tree modes and unsupported file statuses', () => {
  const missing = makeSnapshot();
  missing.changedFiles[0].previousMode = null;
  assert.match(holdReason(missing), /TREE_MODE_SHAPE_INVALID/u);
  const unknown = makeSnapshot();
  unknown.changedFiles[0].status = 'copied';
  assert.match(holdReason(unknown), /CHANGED_FILE_STATUS_UNSUPPORTED/u);
});

test('rejects protected paths for every non-control-plane task', () => {
  for (const path of [
    '.github/workflows/ci.yml',
    'AGENTS.md',
    'src/AGENTS.md',
    'AGENTS.override.md',
    'src/AGENTS.override.md',
  ]) {
    assert.match(
      holdReason(makeSnapshot({ allowedPaths: [path] })),
      /NON_CONTROL_PLANE_PROTECTED_PATH/u,
    );
  }
  assert.match(
    holdReason(makeSnapshot({
      taskClass: 'P2_IMPLEMENTATION',
      phase: 'P2_DRAFT_ONLY',
      allowedPaths: ['docs/governance/V5_P2_ENTRY_GOVERNANCE.md'],
    })),
    /NON_CONTROL_PLANE_PROTECTED_PATH/u,
  );
});

test('CONTROL_PLANE_CHANGE requires zero repair rounds', () => {
  const accepted = makeSnapshot({
    taskClass: 'CONTROL_PLANE_CHANGE',
    maxRepairRounds: 0,
    allowedPaths: ['.github/workflows/ci.yml'],
  });
  assert.equal(evaluateControlSnapshot(accepted).result, 'PASS');
  assert.equal(
    evaluateControlSnapshot(accepted).unverifiedItems.includes(
      'PROPOSED_CONTROL_REVISION_POST_MERGE_ACTIVATION',
    ),
    true,
  );
  const rejected = makeSnapshot({
    taskClass: 'CONTROL_PLANE_CHANGE',
    maxRepairRounds: 1,
    allowedPaths: ['.github/workflows/ci.yml'],
  });
  assert.match(holdReason(rejected), /CONTROL_PLANE_CHANGE_REPAIR_LIMIT_NOT_ZERO/u);

  assert.match(
    holdReason(makeSnapshot({
      taskClass: 'CONTROL_PLANE_CHANGE',
      allowedPaths: ['src/example.ts'],
    })),
    /CONTROL_PLANE_CHANGE_NON_CONTROL_PATH/u,
  );
});

test('accepts only the frozen task-class and phase pairs', () => {
  for (const [taskClass, phase] of [
    ['ORDINARY_TASK', 'P2_DRAFT_ONLY'],
    ['CONTROL_PLANE_CHANGE', 'P2_DRAFT_ONLY'],
    ['P2_IMPLEMENTATION', 'P2_LOCKED'],
    ['P2_IMPLEMENTATION', 'P2_ACTIVE'],
  ]) {
    assert.match(
      holdReason(makeSnapshot({ taskClass, phase })),
      /TASK_CLASS_PHASE_MISMATCH/u,
    );
  }
  assert.match(
    holdReason(makeSnapshot({ taskClass: 'UNKNOWN_TASK' })),
    /TASK_CLASS_INVALID/u,
  );
});

test('requires GraphQL proof that repository auto-merge is disabled', () => {
  for (const value of [true, null, undefined]) {
    const snapshot = makeSnapshot();
    snapshot.repository.allowAutoMerge = value;
    assert.match(holdReason(snapshot), /AUTO_MERGE_NOT_PROVEN_DISABLED/u);
  }
});

test('rejects a stale CI run, wrong workflow, and wrong job', () => {
  const stale = makeReconcileSnapshot();
  stale.ci.headSha = '4'.repeat(40);
  assert.match(holdReason(stale), /CI_HEAD_STALE/u);
  const workflow = makeReconcileSnapshot();
  workflow.ci.workflowId += 1;
  assert.match(holdReason(workflow), /CI_WORKFLOW_IDENTITY_INVALID/u);
  const job = makeReconcileSnapshot();
  job.ci.jobs[0].name = 'Quality gate';
  assert.match(holdReason(job), /QUALITY_JOB_IDENTITY_OR_STATUS_INVALID/u);
});

test('rejects CI from another branch or repository and CI predating PR', () => {
  const branch = makeReconcileSnapshot();
  branch.ci.headBranch = 'other';
  assert.match(holdReason(branch), /CI_PR_IDENTITY_MISMATCH/u);
  const old = makeReconcileSnapshot();
  old.ci.createdAt = '2026-08-27T23:59:59Z';
  assert.match(holdReason(old), /CI_PREDATES_CURRENT_PR/u);
});

test('rejects CI whose deterministic run name does not bind the current PR, base, and head', () => {
  for (const field of ['runName', 'displayTitle']) {
    const snapshot = makeReconcileSnapshot();
    snapshot.ci[field] = `CI pull_request PR-20 base-${BASE_SHA} head-${HEAD_SHA}`;
    assert.match(holdReason(snapshot), /CI_RUN_NAME_BINDING_INVALID/u);
  }
});

test('rejects CI created before the current owner approval', () => {
  const snapshot = makeSnapshot();
  snapshot.issueComments[0].createdAt = '2026-08-28T00:02:00Z';
  snapshot.issueComments[0].updatedAt = '2026-08-28T00:02:00Z';
  assert.match(holdReason(snapshot), /CI_PREDATES_CURRENT_APPROVAL/u);
});

test('rejects ambiguous equal CI and owner-approval timestamps', () => {
  const snapshot = makeSnapshot();
  snapshot.issueComments[0].createdAt = CI_CREATED_AT;
  snapshot.issueComments[0].updatedAt = CI_CREATED_AT;
  assert.match(holdReason(snapshot), /CI_APPROVAL_TIMESTAMP_ORDER_AMBIGUOUS/u);
});

test('rejects CI invalidated by later PR base, close/reopen, or ref events', () => {
  for (const event of ['base_ref_changed', 'reopened', 'head_ref_force_pushed']) {
    const snapshot = makeSnapshot();
    snapshot.prTimeline.push({ event, createdAt: CI_CREATED_AT });
    assert.match(holdReason(snapshot), /CI_INVALIDATED_BY_PR_TIMELINE/u);
  }
  const historical = makeSnapshot();
  historical.prTimeline.push({ event: 'base_ref_changed', createdAt: '2026-08-27T23:59:59Z' });
  assert.equal(evaluateControlSnapshot(historical).result, 'PASS');
});

test('permanently rejects any ready or convert-to-draft lifecycle history', () => {
  for (const event of ['ready_for_review', 'convert_to_draft']) {
    for (const createdAt of ['2026-08-28T00:00:30Z', CI_CREATED_AT, '2026-08-28T00:02:00Z']) {
      const snapshot = makeSnapshot();
      snapshot.prTimeline.push({ event, createdAt });
      assert.match(
        holdReason(snapshot),
        new RegExp(`PR_DRAFT_LIFECYCLE_HISTORY_INVALID:${event}`, 'u'),
      );
    }
  }
});

test('accepts an API-omitted Check Suite PR list', () => {
  const snapshot = makeSnapshot();
  assert.equal(evaluateControlSnapshot(snapshot).result, 'PASS');
});

test('rejects Check Suite PR number, base, head, and app mismatches when present', () => {
  for (const mutate of [
    (snapshot) => { snapshot.ci.checkSuite.pullRequests[0].number = 20; },
    (snapshot) => { snapshot.ci.checkSuite.pullRequests[0].base.sha = '5'.repeat(40); },
    (snapshot) => { snapshot.ci.checkSuite.pullRequests[0].head.repoId += 1; },
    (snapshot) => { snapshot.ci.checkSuite.appId += 1; },
  ]) {
    const snapshot = makeSnapshot();
    snapshot.ci.checkSuite.pullRequests = [{
      number: snapshot.pr.number,
      base: { ...snapshot.pr.base },
      head: { ...snapshot.pr.head },
    }];
    mutate(snapshot);
    assert.match(holdReason(snapshot), /CI_CHECK_SUITE/u);
  }
});

test('rejects truncated job evidence', () => {
  const snapshot = makeSnapshot();
  snapshot.ci.jobTotalCount = 101;
  assert.match(holdReason(snapshot), /CI_JOBS_PAGINATION_OR_COUNT_MISMATCH/u);
});

test('failed CI is observer-only and lifecycle changes always require a human', () => {
  assert.match(
    holdReason(makeSnapshot({ ciConclusion: 'failure' })),
    /OBSERVER_ONLY_AUTO_FIX_DISABLED/u,
  );
  for (const ciConclusion of ['failure', 'success']) {
    for (const path of ['package.json', 'bun.lock', 'bun.lockb']) {
      assert.match(
        holdReason(makeSnapshot({ allowedPaths: [path], ciConclusion })),
        /LIFECYCLE_CHANGE_REQUIRES_HUMAN/u,
      );
    }
  }
  for (const path of [
    'apps/web/package.json',
    'packages/core/package-lock.json',
    'apps/web/bun.lock',
    'packages/core/bun.lockb',
  ]) {
    assert.match(
      holdReason(makeSnapshot({ allowedPaths: [path], ciConclusion: 'success' })),
      /LIFECYCLE_CHANGE_REQUIRES_HUMAN/u,
    );
  }

  for (const [previousFilename, filename] of [
    ['apps/web/source.txt', 'apps/web/bun.lock'],
    ['packages/core/bun.lockb', 'packages/core/archive.txt'],
  ]) {
    assert.match(
      holdReason(makeSnapshot({
        allowedPaths: [previousFilename, filename],
        changedFiles: [{
          filename,
          previousFilename,
          status: 'renamed',
          mode: '100644',
          previousMode: '100644',
        }],
      })),
      /LIFECYCLE_CHANGE_REQUIRES_HUMAN/u,
    );
  }

  for (const path of ['bun.lock.backup', 'package.json.example']) {
    assert.equal(evaluateControlSnapshot(makeSnapshot({ allowedPaths: [path] })).result, 'PASS');
  }
});

test('ignores untrusted ledger markers', () => {
  const snapshot = makeSnapshot();
  snapshot.prComments = [ledgerComment(ledgerEntry(snapshot), { user: owner() })];
  assert.equal(evaluateControlSnapshot(snapshot).result, 'PASS');
});

test('holds on any valid trusted ledger while writer is disabled', () => {
  const snapshot = makeSnapshot();
  snapshot.prComments = [ledgerComment(ledgerEntry(snapshot))];
  assert.match(holdReason(snapshot), /LEDGER_PRESENT_WHILE_WRITER_DISABLED/u);
});

test('rejects edited, duplicate, and non-contiguous trusted ledger evidence', () => {
  const edited = makeSnapshot();
  edited.prComments = [ledgerComment(ledgerEntry(edited), { updatedAt: '2026-08-28T00:02:00Z' })];
  assert.match(holdReason(edited), /LEDGER_EDITED_OR_TIME_MISSING/u);

  const duplicate = makeSnapshot();
  const first = ledgerEntry(duplicate);
  duplicate.prComments = [
    ledgerComment(first),
    ledgerComment({ ...first, round: 2, headSha: '5'.repeat(40) }, { id: 9902 }),
  ];
  assert.match(holdReason(duplicate), /LEDGER_DUPLICATE_TRIGGER/u);

  const gap = makeSnapshot();
  gap.prComments = [ledgerComment(ledgerEntry(gap, { round: 2 }))];
  assert.match(holdReason(gap), /LEDGER_ROUND_SEQUENCE_INVALID/u);
});

test('requires exact owner reconcile command', () => {
  const snapshot = makeSnapshot({ eventType: 'issue_comment' });
  snapshot.event.actor = owner();
  snapshot.event.authorAssociation = 'OWNER';
  snapshot.event.command = 'please reconcile';
  assert.match(holdReason(snapshot), /TRIGGER_COMMAND_INVALID/u);
  snapshot.event.command = 'CONTROL_PLANE_V2_RECONCILE';
  assert.equal(evaluateControlSnapshot(snapshot).result, 'PASS');
});

test('rejects duplicate top-level JSON keys', () => {
  const text = '<!-- X_BEGIN\n{"schema":"a","schema":"b"}\nX_END -->';
  assert.throws(() => extractMarkedJson(text, 'X'), /X_DUPLICATE_KEYS/u);
});

test('rejects required-check additions or omissions', () => {
  for (const requiredChecks of [
    [],
    [POLICY.qualityJobName, POLICY.controlJobName],
    [POLICY.qualityJobName, 'Extra gate'],
  ]) {
    const snapshot = makeSnapshot();
    const contract = extractMarkedJson(snapshot.issue.body, 'CONTROL_PLANE_V2_CONTRACT');
    contract.requiredChecks = requiredChecks;
    snapshot.issue.body = marker('CONTROL_PLANE_V2_CONTRACT', contract);
    assert.match(holdReason(snapshot), /REQUIRED_CHECKS_INVALID/u);
  }
});

function workflowRunEvent(overrides = {}) {
  return {
    workflow_run: {
      id: 8001,
      workflow_id: POLICY.qualityWorkflowId,
      name: CI_RUN_NAME,
      display_title: CI_RUN_NAME,
      path: POLICY.qualityWorkflowPath,
      event: 'pull_request',
      head_sha: HEAD_SHA,
      head_branch: 'issue-18-test',
      run_attempt: 1,
      pull_requests: [],
      ...overrides,
    },
  };
}

test('resolves workflow-run PR from a unique head across all bases', async () => {
  const api = {
    async list(path) {
      assert.match(path, /head=easyplay198-create%3Aissue-18-test/u);
      assert.doesNotMatch(path, /base=/u);
      return [{
        number: 19,
        head: { ref: 'issue-18-test', sha: HEAD_SHA, repo: { id: POLICY.repositoryId } },
        base: { ref: 'main', sha: BASE_SHA, repo: { id: POLICY.repositoryId } },
      }];
    },
  };
  const number = await resolvePrNumber(
    api,
    '/repos/example/repo',
    'workflow_run',
    workflowRunEvent(),
  );
  assert.equal(number, 19);
});

test('PR resolution fails closed on multiple open PRs', async () => {
  const api = { async list() { return [{ number: 19 }, { number: 20 }]; } };
  await assert.rejects(
    resolvePrNumber(api, '/repos/example/repo', 'workflow_run', workflowRunEvent()),
    /TRIGGER_PR_COUNT_2/u,
  );
});

test('workflow-run normalization preserves the exact run attempt', () => {
  const normalized = normalizeEvent('workflow_run', {
    ...workflowRunEvent({ run_attempt: 2 }),
    sender: { id: 123, login: 'contributor', type: 'User' },
  });
  assert.equal(normalized.runAttempt, 2);
  assert.equal(normalized.workflowPath, POLICY.qualityWorkflowPath);
  assert.equal(normalized.workflowEvent, 'pull_request');
  assert.equal(normalized.runName, CI_RUN_NAME);
  assert.equal(normalized.displayTitle, CI_RUN_NAME);
});

test('workflow-run PR resolution rejects missing or invalid run attempts before API access', async () => {
  const api = { async list() { assert.fail('API must not be called'); } };
  for (const runAttempt of [undefined, 0, '1']) {
    await assert.rejects(
      resolvePrNumber(
        api,
        '/repos/example/repo',
        'workflow_run',
        workflowRunEvent({ run_attempt: runAttempt }),
      ),
      /TRIGGER_WORKFLOW_SOURCE_INVALID/u,
    );
  }
});

test('workflow-run PR resolution rejects wrong source identity before API access', async () => {
  const api = { async list() { assert.fail('API must not be called'); } };
  for (const overrides of [
    { id: 0 },
    { workflow_id: POLICY.qualityWorkflowId + 1 },
    { path: '.github/workflows/other.yml' },
    { event: 'push' },
    { head_branch: '' },
  ]) {
    await assert.rejects(
      resolvePrNumber(
        api,
        '/repos/example/repo',
        'workflow_run',
        workflowRunEvent(overrides),
      ),
      /TRIGGER_WORKFLOW_SOURCE_INVALID/u,
    );
  }
});

test('workflow-run PR resolution requires exact dynamic name and display title', async () => {
  const api = {
    async list() {
      return [{
        number: 19,
        head: { ref: 'issue-18-test', sha: HEAD_SHA, repo: { id: POLICY.repositoryId } },
        base: { ref: 'main', sha: BASE_SHA, repo: { id: POLICY.repositoryId } },
      }];
    },
  };
  for (const overrides of [
    { name: POLICY.qualityWorkflowName },
    { name: `${CI_RUN_NAME} ` },
    { display_title: `${CI_RUN_NAME} ` },
    { name: `CI pull_request PR-20 base-${BASE_SHA} head-${HEAD_SHA}` },
    { display_title: `CI pull_request PR-19 base-${'2'.repeat(40)} head-${HEAD_SHA}` },
  ]) {
    await assert.rejects(
      resolvePrNumber(
        api,
        '/repos/example/repo',
        'workflow_run',
        workflowRunEvent(overrides),
      ),
      /TRIGGER_RUN_NAME_BINDING_INVALID/u,
    );
  }
});

function ciApiFixture({
  totalCount = 1,
  suitePrNumber = null,
  runAttempt = 1,
  jobRunAttempt = runAttempt,
  workflowOverrides = {},
  runOverrides = {},
} = {}) {
  const workflow = {
    id: POLICY.qualityWorkflowId,
    name: POLICY.qualityWorkflowName,
    path: POLICY.qualityWorkflowPath,
    state: 'active',
    ...workflowOverrides,
  };
  const run = {
    id: 8001,
    workflow_id: POLICY.qualityWorkflowId,
    name: CI_RUN_NAME,
    display_title: CI_RUN_NAME,
    path: POLICY.qualityWorkflowPath,
    event: 'pull_request',
    head_sha: HEAD_SHA,
    head_branch: 'issue-18-test',
    repository: { id: POLICY.repositoryId },
    head_repository: { id: POLICY.repositoryId },
    created_at: CI_CREATED_AT,
    status: 'completed',
    conclusion: 'success',
    check_suite_id: 8101,
    run_attempt: runAttempt,
    ...runOverrides,
  };
  return {
    async request(path) {
      if (path.includes('/actions/workflows/ci.yml/runs')) {
        return { data: { total_count: totalCount, workflow_runs: [run] } };
      }
      if (path.endsWith(`/actions/workflows/${POLICY.qualityWorkflowId}`)) {
        return { data: workflow };
      }
      if (path.includes('/actions/runs/8001/jobs')) {
        return { data: { total_count: 1, jobs: [{
          id: 8201,
          name: POLICY.qualityJobName,
          status: 'completed',
          conclusion: 'success',
          head_sha: HEAD_SHA,
          run_id: 8001,
          run_attempt: jobRunAttempt,
        }] } };
      }
      if (path.includes('/check-suites/8101')) {
        return { data: {
          id: 8101,
          repository: { id: POLICY.repositoryId },
          app: { id: POLICY.actionsApp.id, slug: POLICY.actionsApp.slug },
          head_sha: HEAD_SHA,
          head_branch: 'issue-18-test',
          before: '0'.repeat(40),
          after: HEAD_SHA,
          status: 'completed',
          conclusion: 'success',
          pull_requests: suitePrNumber === null ? [] : [{
            number: suitePrNumber,
            base: { ref: 'main', sha: BASE_SHA, repo: { id: POLICY.repositoryId } },
            head: { ref: 'issue-18-test', sha: HEAD_SHA, repo: { id: POLICY.repositoryId } },
          }],
        } };
      }
      throw new Error(`unexpected path ${path}`);
    },
  };
}

test('latest CI accepts the observed empty Check Suite PR list and ignores all-zero suite.before', async () => {
  const ci = await latestCi(ciApiFixture(), '/repos/example/repo', {
    number: 19,
    createdAt: PR_CREATED_AT,
    base: { ref: 'main', sha: BASE_SHA, repoId: POLICY.repositoryId },
    head: { ref: 'issue-18-test', sha: HEAD_SHA, repoId: POLICY.repositoryId },
  });
  assert.deepEqual(ci.checkSuite.pullRequests, []);
  assert.equal(ci.checkSuite.after, HEAD_SHA);
  assert.equal(ci.workflowName, POLICY.qualityWorkflowName);
  assert.equal(ci.workflowState, 'active');
  assert.equal(ci.runName, CI_RUN_NAME);
  assert.equal(ci.displayTitle, CI_RUN_NAME);
});

test('latest CI retains an explicit Check Suite PR binding when GitHub supplies it', async () => {
  const ci = await latestCi(ciApiFixture({ suitePrNumber: 19 }), '/repos/example/repo', {
    number: 19,
    createdAt: PR_CREATED_AT,
    base: { ref: 'main', sha: BASE_SHA, repoId: POLICY.repositoryId },
    head: { ref: 'issue-18-test', sha: HEAD_SHA, repoId: POLICY.repositoryId },
  });
  assert.equal(ci.checkSuite.pullRequests[0].number, 19);
});

test('latest CI fails closed on truncated run list', async () => {
  await assert.rejects(
    latestCi(ciApiFixture({ totalCount: 2 }), '/repos/example/repo', {
      number: 19,
      createdAt: PR_CREATED_AT,
      base: { ref: 'main', sha: BASE_SHA, repoId: POLICY.repositoryId },
      head: { ref: 'issue-18-test', sha: HEAD_SHA, repoId: POLICY.repositoryId },
    }),
    /CI_RUNS_PAGINATION_OR_COUNT_MISMATCH/u,
  );
});

test('latest CI rejects a non-positive run attempt', async () => {
  await assert.rejects(
    latestCi(ciApiFixture({ runAttempt: 0 }), '/repos/example/repo', {
      number: 19,
      createdAt: PR_CREATED_AT,
      base: { ref: 'main', sha: BASE_SHA, repoId: POLICY.repositoryId },
      head: { ref: 'issue-18-test', sha: HEAD_SHA, repoId: POLICY.repositoryId },
    }),
    /CI_RUN_IDENTITY_SHAPE_INVALID/u,
  );
});

test('latest CI rejects a mismatched workflow definition', async () => {
  for (const workflowOverrides of [
    { id: POLICY.qualityWorkflowId + 1 },
    { name: 'Other' },
    { path: '.github/workflows/other.yml' },
    { state: 'disabled_manually' },
  ]) {
    await assert.rejects(
      latestCi(ciApiFixture({ workflowOverrides }), '/repos/example/repo', {
        number: 19,
        createdAt: PR_CREATED_AT,
        base: { ref: 'main', sha: BASE_SHA, repoId: POLICY.repositoryId },
        head: { ref: 'issue-18-test', sha: HEAD_SHA, repoId: POLICY.repositoryId },
      }),
      /CI_WORKFLOW_DEFINITION_INVALID/u,
    );
  }
});

test('latest CI rejects dynamic run-name or display-title mismatches', async () => {
  for (const runOverrides of [
    { name: POLICY.qualityWorkflowName },
    { name: `${CI_RUN_NAME} ` },
    { display_title: `${CI_RUN_NAME} ` },
    { name: `CI pull_request PR-20 base-${BASE_SHA} head-${HEAD_SHA}` },
    { display_title: `CI pull_request PR-19 base-${BASE_SHA} head-${'2'.repeat(40)}` },
  ]) {
    await assert.rejects(
      latestCi(ciApiFixture({ runOverrides }), '/repos/example/repo', {
        number: 19,
        createdAt: PR_CREATED_AT,
        base: { ref: 'main', sha: BASE_SHA, repoId: POLICY.repositoryId },
        head: { ref: 'issue-18-test', sha: HEAD_SHA, repoId: POLICY.repositoryId },
      }),
      /CI_RUN_NAME_BINDING_INVALID/u,
    );
  }
});

test('canonical path validation rejects ambiguous inputs', () => {
  for (const path of ['', '/absolute', 'a/../b', 'a/./b', 'a\\b', 'a//b', 'a/*', 'a/']) {
    assert.equal(isCanonicalRepositoryPath(path), false, path);
  }
  assert.equal(isCanonicalRepositoryPath('src/valid-file.ts'), true);
  assert.equal(isCanonicalRepositoryPath('app/[id]/page.tsx'), true);
});

test('canonical head-ref validation rejects ambiguous or dangerous refs', () => {
  for (const ref of [
    '', '/absolute', 'trailing/', '.hidden', 'nested/.hidden', 'trailing.', 'name.lock',
    'nested/name.lock/other', '@', 'a..b', 'a//b',
    'a@{b', 'a\\b', 'has space', 'question?', 'star*', 'bracket[', 'bracket]',
  ]) {
    assert.equal(isCanonicalHeadRef(ref), false, ref);
  }
  assert.equal(isCanonicalHeadRef('issue-21-p2-draft-only'), true);
  assert.equal(isCanonicalHeadRef('feature/p2-draft-only'), true);
});

test('structured HOLD output cannot hide disabled safety controls', () => {
  const snapshot = makeSnapshot();
  snapshot.repository.allowAutoMerge = true;
  const result = evaluateControlSnapshot(snapshot);
  const output = formatResultLines(result).join('\n');
  assert.match(output, /^RESULT=HOLD$/mu);
  assert.match(output, /^AUTO_FIX_WRITE=DISABLED$/mu);
  assert.match(output, /^AUTO_MERGE=DISABLED$/mu);
  assert.match(output, /^P2_STATUS=LOCKED$/mu);
  assert.match(output, /^OPERATION_PATH=UNKNOWN$/mu);
  assert.match(output, /^OUTPUT_PATH=UNKNOWN$/mu);
  assert.doesNotMatch(output, /^UNVERIFIED_ITEMS=NONE$/mu);
});

test('structured PASS reports exact operation and output paths', () => {
  const output = formatResultLines(evaluateControlSnapshot(makeSnapshot())).join('\n');
  assert.match(
    output,
    new RegExp(`^OPERATION_PATH=https://github\\.com/${POLICY.repositoryFullName}/tree/${HEAD_SHA}$`, 'mu'),
  );
  assert.match(
    output,
    new RegExp(`^OUTPUT_PATH=https://github\\.com/${POLICY.repositoryFullName}/pull/19$`, 'mu'),
  );
});

test('P2 templates and governance freeze Draft-only task-scoped entry', async () => {
  const [issueTemplate, prTemplate, p2Governance, evaluator] = await Promise.all([
    readFile(new URL('../ISSUE_TEMPLATE/codex-development-task.yml', import.meta.url), 'utf8'),
    readFile(new URL('../pull_request_template.md', import.meta.url), 'utf8'),
    readFile(new URL('../../docs/governance/V5_P2_ENTRY_GOVERNANCE.md', import.meta.url), 'utf8'),
    readFile(new URL('./autonomous-control-gate-v2.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(issueTemplate, /P2_IMPLEMENTATION/u);
  assert.match(issueTemplate, /P2_DRAFT_ONLY/u);
  assert.match(issueTemplate, /authorizedHeadRef/u);
  assert.match(prTemplate, /keep the PR Draft/u);
  assert.match(p2Governance, /P2 implementation has not started/u);
  assert.match(p2Governance, /P2_DRAFT_ONLY/u);
  assert.match(p2Governance, /maxRepairRounds": 0/u);
  assert.match(p2Governance, /DO_NOT_MERGE_BY_AUTOMATION/u);
  assert.match(evaluator, /pulls\?state=all&head=/u);
});

test('observer workflow is read-only, pinned, queued, and never executes PR head', async () => {
  const workflow = await readFile(
    new URL('../workflows/autonomous-control-gate-v2.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /actions:\s*read/u);
  assert.match(workflow, /checks:\s*read/u);
  assert.match(workflow, /contents:\s*read/u);
  assert.match(workflow, /issues:\s*read/u);
  assert.match(workflow, /pull-requests:\s*read/u);
  assert.doesNotMatch(workflow, /:\s*write\b/u);
  assert.doesNotMatch(workflow, /pull_request_target|pull_request_review|workflow_dispatch/u);
  assert.doesNotMatch(workflow, /secrets\.|pull_request\.head/u);
  assert.match(workflow, /workflow_run\.event == 'pull_request'/u);
  assert.match(workflow, /github\.event\.sender\.id == 268785207/u);
  assert.match(workflow, /github\.event\.comment\.body == 'CONTROL_PLANE_V2_RECONCILE'/u);
  assert.match(workflow, /ref: \$\{\{ github\.workflow_sha \}\}/u);
  assert.doesNotMatch(workflow, /^concurrency:/mu);
  assert.match(workflow, /^    concurrency:\n      group: autonomous-control-v2-/mu);
  assert.match(workflow, /queue:\s*max/u);
  assert.match(workflow, /cancel-in-progress:\s*false/u);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/u);
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/u);
  assert.match(workflow, /persist-credentials:\s*false/u);
  assert.match(workflow, /CONTROL_PLANE_MODE:\s*OBSERVER_ONLY/u);

  const ciWorkflow = await readFile(new URL('../workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(
    ciWorkflow,
    /run-name: CI \$\{\{ github\.event_name \}\} PR-\$\{\{ github\.event\.pull_request\.number \|\| 'none' \}\} base-/u,
  );
});
