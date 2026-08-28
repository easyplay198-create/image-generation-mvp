import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const POLICY = Object.freeze({
  schema: 'github-autonomous-control-v2',
  repositoryId: 1328682481,
  repositoryFullName: 'easyplay198-create/image-generation-mvp',
  owner: Object.freeze({ id: 268785207, login: 'easyplay198-create', type: 'User' }),
  actionsBot: Object.freeze({ id: 41898282, login: 'github-actions[bot]', type: 'Bot' }),
  actionsApp: Object.freeze({ id: 15368, slug: 'github-actions' }),
  defaultBranch: 'main',
  qualityWorkflowId: 330531212,
  qualityWorkflowName: 'CI',
  qualityWorkflowPath: '.github/workflows/ci.yml',
  qualityJobName: 'Quality gates',
  controlJobName: 'Autonomous control gate',
  hardRepairLimit: 3,
  controlMode: 'OBSERVER_ONLY',
});

const CONTRACT_MARKER = 'CONTROL_PLANE_V2_CONTRACT';
const APPROVAL_MARKER = 'CONTROL_PLANE_V2_APPROVAL';
const LINK_MARKER = 'CONTROL_PLANE_V2_LINK';
const LEDGER_MARKER = 'CONTROL_PLANE_V2_LEDGER';
const TERMINAL_CI_CONCLUSIONS = new Set(['success', 'failure']);
const FILE_MODES = new Set(['100644', '100755', '120000', '160000']);
const PROTECTED_PATHS = ['AGENTS.md', 'CODEOWNERS', '.github/', 'docs/governance/'];
const LIFECYCLE_PATHS = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);
const CI_INVALIDATING_PR_EVENTS = new Set([
  'automatic_base_change_succeeded',
  'base_ref_changed',
  'base_ref_deleted',
  'base_ref_force_pushed',
  'closed',
  'head_ref_deleted',
  'head_ref_force_pushed',
  'head_ref_restored',
  'reopened',
]);

function hold(reasons, details = {}) {
  return {
    result: 'HOLD',
    controlState: 'HOLD',
    decision: 'HOLD',
    controlMode: POLICY.controlMode,
    effectiveAutoFixLimit: 0,
    autoFixWrite: 'DISABLED',
    autoMerge: 'DISABLED',
    p2Status: 'LOCKED',
    p2SemanticEnforcement: 'HUMAN_GOVERNANCE_REQUIRED',
    unverifiedItems: [
      'BRANCH_PROTECTION',
      'OWNER_REVIEW_NO_BYPASS',
      'OBSERVER_POST_MERGE_ACTIVATION',
      'P2_SEMANTIC_SCOPE_REVIEW',
      'EXACT_TEST_COMMAND_EXIT_CODES',
    ],
    reasons: [...new Set(reasons)].sort(),
    ...details,
  };
}

function pass(decision, details = {}) {
  return {
    result: 'PASS',
    controlState: 'OBSERVER_ONLY',
    decision,
    controlMode: POLICY.controlMode,
    effectiveAutoFixLimit: 0,
    autoFixWrite: 'DISABLED',
    autoMerge: 'DISABLED',
    p2Status: 'LOCKED',
    p2SemanticEnforcement: 'HUMAN_GOVERNANCE_REQUIRED',
    reasons: [],
    ...details,
  };
}

export function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function topLevelJsonKeys(text, marker) {
  const keys = [];
  let objectDepth = 0;
  let arrayDepth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      const start = index;
      index += 1;
      for (; index < text.length; index += 1) {
        if (text[index] === '\\') {
          index += 1;
          continue;
        }
        if (text[index] === '"') break;
      }
      if (index >= text.length) throw new Error(`${marker}_JSON_INVALID`);
      if (objectDepth === 1 && arrayDepth === 0) {
        let cursor = index + 1;
        while (/\s/u.test(text[cursor] ?? '')) cursor += 1;
        if (text[cursor] === ':') {
          try {
            keys.push(JSON.parse(text.slice(start, index + 1)));
          } catch {
            throw new Error(`${marker}_JSON_INVALID`);
          }
        }
      }
      continue;
    }
    if (character === '{') objectDepth += 1;
    else if (character === '}') objectDepth -= 1;
    else if (character === '[') arrayDepth += 1;
    else if (character === ']') arrayDepth -= 1;
    if (objectDepth < 0 || arrayDepth < 0) throw new Error(`${marker}_JSON_INVALID`);
  }
  if (objectDepth !== 0 || arrayDepth !== 0) throw new Error(`${marker}_JSON_INVALID`);
  if (new Set(keys).size !== keys.length) throw new Error(`${marker}_DUPLICATE_KEYS`);
}

export function extractMarkedJson(text, marker) {
  if (typeof text !== 'string') throw new Error(`${marker}_TEXT_MISSING`);
  const begin = `<!-- ${marker}_BEGIN\n`;
  const end = `\n${marker}_END -->`;
  const matches = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(begin, cursor);
    if (start === -1) break;
    const contentStart = start + begin.length;
    const finish = text.indexOf(end, contentStart);
    if (finish === -1) throw new Error(`${marker}_END_MISSING`);
    matches.push(text.slice(contentStart, finish));
    cursor = finish + end.length;
  }
  if (matches.length !== 1) throw new Error(`${marker}_COUNT_${matches.length}`);
  topLevelJsonKeys(matches[0], marker);
  let parsed;
  try {
    parsed = JSON.parse(matches[0]);
  } catch {
    throw new Error(`${marker}_JSON_INVALID`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${marker}_JSON_NOT_OBJECT`);
  }
  return parsed;
}

function exactKeys(object, keys, prefix) {
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${prefix}_KEYS_INVALID`);
  }
}

function isCommitSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(value);
}

export function isCanonicalRepositoryPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return false;
  if (value !== value.normalize('NFC')) return false;
  if (value.startsWith('/') || value.endsWith('/') || value.includes('\\')) return false;
  if (/[\u0000-\u001f\u007f*?{}!]/u.test(value)) return false;
  const segments = value.split('/');
  return !segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..');
}

function isOwner(user, association) {
  return (
    user?.id === POLICY.owner.id &&
    user?.login === POLICY.owner.login &&
    user?.type === POLICY.owner.type &&
    association === 'OWNER'
  );
}

function isActionsBot(user) {
  return (
    user?.id === POLICY.actionsBot.id &&
    user?.login === POLICY.actionsBot.login &&
    user?.type === POLICY.actionsBot.type
  );
}

function mentionsMarker(body, marker) {
  return (
    typeof body === 'string' &&
    (body.includes(`${marker}_BEGIN`) || body.includes(`${marker}_END`))
  );
}

function validateContract(contract) {
  exactKeys(
    contract,
    ['allowedPaths', 'authorizedBaseSha', 'maxRepairRounds', 'phase', 'requiredChecks', 'schema', 'taskClass'],
    'CONTRACT',
  );
  if (contract.schema !== POLICY.schema) throw new Error('CONTRACT_SCHEMA_INVALID');
  if (contract.phase !== 'P2_LOCKED') throw new Error('P2_NOT_LOCKED');
  if (!['ORDINARY_TASK', 'CONTROL_PLANE_CHANGE'].includes(contract.taskClass)) {
    throw new Error('TASK_CLASS_INVALID');
  }
  if (!isCommitSha(contract.authorizedBaseSha)) throw new Error('AUTHORIZED_BASE_SHA_INVALID');
  if (
    !Number.isInteger(contract.maxRepairRounds) ||
    contract.maxRepairRounds < 0 ||
    contract.maxRepairRounds > POLICY.hardRepairLimit
  ) {
    throw new Error('REPAIR_LIMIT_INVALID');
  }
  if (contract.taskClass === 'CONTROL_PLANE_CHANGE' && contract.maxRepairRounds !== 0) {
    throw new Error('CONTROL_PLANE_CHANGE_REPAIR_LIMIT_NOT_ZERO');
  }
  if (!Array.isArray(contract.allowedPaths) || contract.allowedPaths.length === 0) {
    throw new Error('ALLOWLIST_EMPTY');
  }
  if (
    contract.allowedPaths.some((path) => !isCanonicalRepositoryPath(path)) ||
    new Set(contract.allowedPaths).size !== contract.allowedPaths.length
  ) {
    throw new Error('ALLOWLIST_INVALID');
  }
  const expectedChecks = [POLICY.qualityJobName];
  if (
    !Array.isArray(contract.requiredChecks) ||
    JSON.stringify([...contract.requiredChecks].sort()) !== JSON.stringify(expectedChecks)
  ) {
    throw new Error('REQUIRED_CHECKS_INVALID');
  }
  return contract;
}

function parseTrustedApproval(comment) {
  if (!comment.createdAt || comment.updatedAt !== comment.createdAt) {
    throw new Error('APPROVAL_EDITED_OR_TIME_MISSING');
  }
  const approval = extractMarkedJson(comment.body, APPROVAL_MARKER);
  exactKeys(
    approval,
    ['authorizedBaseSha', 'issueBodySha256', 'maxRepairRounds', 'phase', 'schema'],
    'APPROVAL',
  );
  if (
    approval.schema !== POLICY.schema ||
    approval.phase !== 'P2_LOCKED' ||
    !/^[0-9a-f]{64}$/u.test(approval.issueBodySha256) ||
    !isCommitSha(approval.authorizedBaseSha) ||
    !Number.isInteger(approval.maxRepairRounds) ||
    approval.maxRepairRounds < 0 ||
    approval.maxRepairRounds > POLICY.hardRepairLimit
  ) {
    throw new Error('APPROVAL_SHAPE_INVALID');
  }
  return approval;
}

function currentApproval(comments, contract, issueBodySha256) {
  const matches = [];
  for (const comment of comments) {
    if (!mentionsMarker(comment.body, APPROVAL_MARKER)) continue;
    if (!isOwner(comment.user, comment.authorAssociation)) continue;
    const approval = parseTrustedApproval(comment);
    if (approval.issueBodySha256 !== issueBodySha256) continue;
    if (
      approval.authorizedBaseSha !== contract.authorizedBaseSha ||
      approval.maxRepairRounds !== contract.maxRepairRounds
    ) {
      throw new Error('APPROVAL_BINDING_MISMATCH');
    }
    matches.push(comment);
  }
  if (matches.length !== 1) throw new Error(`VALID_APPROVAL_COUNT_${matches.length}`);
  return matches[0];
}

function validateLink(pr, issue, contract, approvalComment, issueBodySha256) {
  const link = extractMarkedJson(pr.body, LINK_MARKER);
  exactKeys(
    link,
    ['approvalCommentId', 'authorizedBaseSha', 'issueBodySha256', 'issueNumber', 'schema'],
    'PR_LINK',
  );
  if (
    link.schema !== POLICY.schema ||
    link.issueNumber !== issue.number ||
    link.approvalCommentId !== approvalComment.id ||
    link.issueBodySha256 !== issueBodySha256 ||
    link.authorizedBaseSha !== contract.authorizedBaseSha
  ) {
    throw new Error('PR_LINK_BINDING_MISMATCH');
  }
}

function pathIsProtected(path) {
  if (
    path === 'AGENTS.md' || path.endsWith('/AGENTS.md') ||
    path === 'AGENTS.override.md' || path.endsWith('/AGENTS.override.md')
  ) return true;
  return PROTECTED_PATHS.some((protectedPath) =>
    protectedPath.endsWith('/') ? path.startsWith(protectedPath) : path === protectedPath,
  );
}

function validateModeShape(file) {
  const current = file.mode;
  const previous = file.previousMode;
  const currentKnown = FILE_MODES.has(current);
  const previousKnown = FILE_MODES.has(previous);
  if (file.status === 'added') {
    if (!currentKnown || previous !== null) throw new Error(`TREE_MODE_SHAPE_INVALID:${file.filename}`);
  } else if (file.status === 'removed') {
    if (current !== null || !previousKnown) throw new Error(`TREE_MODE_SHAPE_INVALID:${file.filename}`);
  } else if (file.status === 'modified') {
    if (!currentKnown || !previousKnown) throw new Error(`TREE_MODE_SHAPE_INVALID:${file.filename}`);
  } else if (file.status === 'renamed') {
    if (!currentKnown || !previousKnown) throw new Error(`TREE_MODE_SHAPE_INVALID:${file.filename}`);
  } else {
    throw new Error(`CHANGED_FILE_STATUS_UNSUPPORTED:${file.status}`);
  }
}

function validateChangedFiles(changedFiles, contract) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) throw new Error('CHANGED_FILES_EMPTY');
  const allowlist = new Set(contract.allowedPaths);
  const seen = new Set();
  let lifecycleChange = false;
  for (const file of changedFiles) {
    validateModeShape(file);
    const paths = [file.filename];
    if (file.status === 'renamed') paths.push(file.previousFilename);
    for (const path of paths) {
      if (!isCanonicalRepositoryPath(path)) throw new Error('CHANGED_PATH_INVALID');
      if (!allowlist.has(path)) throw new Error(`CHANGED_PATH_NOT_ALLOWED:${path}`);
      seen.add(path);
      if (LIFECYCLE_PATHS.has(path)) lifecycleChange = true;
      if (contract.taskClass === 'ORDINARY_TASK' && pathIsProtected(path)) {
        throw new Error(`ORDINARY_TASK_PROTECTED_PATH:${path}`);
      }
    }
    if (file.mode === '120000' || file.previousMode === '120000') {
      throw new Error(`SYMLINK_CHANGE:${file.filename}`);
    }
    if (file.mode === '160000' || file.previousMode === '160000') {
      throw new Error(`SUBMODULE_CHANGE:${file.filename}`);
    }
  }
  if (seen.size !== allowlist.size || [...seen].some((path) => !allowlist.has(path))) {
    throw new Error('ALLOWLIST_AND_DIFF_SET_MISMATCH');
  }
  return { lifecycleChange };
}

function validateLedger(comments, context) {
  const entries = [];
  for (const comment of comments) {
    if (!mentionsMarker(comment.body, LEDGER_MARKER)) continue;
    if (!isActionsBot(comment.user)) continue;
    if (!comment.createdAt || comment.updatedAt !== comment.createdAt) {
      throw new Error('LEDGER_EDITED_OR_TIME_MISSING');
    }
    const entry = extractMarkedJson(comment.body, LEDGER_MARKER);
    exactKeys(
      entry,
      [
        'approvalCommentId', 'authorizedBaseSha', 'fixedRequestSha256', 'headSha',
        'issueBodySha256', 'issueNumber', 'prNumber', 'repositoryId', 'round',
        'schema', 'triggerId', 'triggerType',
      ],
      'LEDGER',
    );
    if (
      entry.schema !== POLICY.schema ||
      entry.repositoryId !== POLICY.repositoryId ||
      entry.issueNumber !== context.issueNumber ||
      entry.prNumber !== context.prNumber ||
      entry.approvalCommentId !== context.approvalCommentId ||
      entry.issueBodySha256 !== context.issueBodySha256 ||
      entry.authorizedBaseSha !== context.authorizedBaseSha ||
      !isCommitSha(entry.headSha) ||
      !Number.isInteger(entry.round) || entry.round < 1 ||
      !/^[0-9a-f]{64}$/u.test(entry.fixedRequestSha256) ||
      typeof entry.triggerId !== 'string' || entry.triggerId.length === 0 ||
      typeof entry.triggerType !== 'string' || entry.triggerType.length === 0
    ) {
      throw new Error('LEDGER_BINDING_INVALID');
    }
    entries.push(entry);
  }
  const triggerKeys = new Set();
  const rounds = new Set();
  const heads = new Set();
  for (const entry of entries) {
    const triggerKey = `${entry.triggerType}:${entry.triggerId}`;
    if (triggerKeys.has(triggerKey)) throw new Error('LEDGER_DUPLICATE_TRIGGER');
    if (rounds.has(entry.round)) throw new Error('LEDGER_DUPLICATE_ROUND');
    if (heads.has(entry.headSha)) throw new Error('LEDGER_DUPLICATE_HEAD');
    triggerKeys.add(triggerKey);
    rounds.add(entry.round);
    heads.add(entry.headSha);
  }
  const orderedRounds = [...rounds].sort((a, b) => a - b);
  if (orderedRounds.some((round, index) => round !== index + 1)) {
    throw new Error('LEDGER_ROUND_SEQUENCE_INVALID');
  }
  return entries;
}

function validateRepository(repository) {
  if (
    repository?.id !== POLICY.repositoryId ||
    repository?.fullName !== POLICY.repositoryFullName ||
    repository?.defaultBranch !== POLICY.defaultBranch ||
    repository?.owner?.id !== POLICY.owner.id ||
    repository?.owner?.login !== POLICY.owner.login ||
    repository?.owner?.type !== POLICY.owner.type
  ) {
    throw new Error('REPOSITORY_OR_OWNER_IDENTITY_MISMATCH');
  }
  if (repository.allowAutoMerge !== false) throw new Error('AUTO_MERGE_NOT_PROVEN_DISABLED');
}

function validatePr(pr, relatedPullRequests, contract) {
  if (
    pr?.state !== 'open' || pr?.draft !== true || pr?.merged === true ||
    pr?.base?.ref !== POLICY.defaultBranch ||
    pr?.base?.repoId !== POLICY.repositoryId ||
    pr?.head?.repoId !== POLICY.repositoryId ||
    !isCommitSha(pr?.head?.sha)
  ) {
    throw new Error('PR_IDENTITY_OR_STATE_INVALID');
  }
  if (
    !Array.isArray(relatedPullRequests) || relatedPullRequests.length !== 1 ||
    relatedPullRequests[0].number !== pr.number
  ) {
    throw new Error('PR_NOT_UNIQUE_FOR_BRANCH');
  }
  if (pr.base.sha !== contract.authorizedBaseSha) throw new Error('PR_BASE_SHA_NOT_AUTHORIZED_BASE');
}

function validateTrigger(snapshot) {
  const event = snapshot.event;
  if (event.type === 'workflow_run') {
    if (event.workflowId !== POLICY.qualityWorkflowId || event.workflowName !== POLICY.qualityWorkflowName) {
      throw new Error('TRIGGER_WORKFLOW_IDENTITY_INVALID');
    }
    if (event.headSha !== snapshot.pr.head.sha) throw new Error('TRIGGER_HEAD_STALE');
    if (String(snapshot.ci?.id) !== event.triggerId) throw new Error('TRIGGER_CI_RUN_MISMATCH');
    return;
  }
  if (event.type === 'issue_comment') {
    if (!isOwner(event.actor, event.authorAssociation)) throw new Error('TRIGGER_ACTOR_NOT_OWNER');
    if (event.command !== 'CONTROL_PLANE_V2_RECONCILE') throw new Error('TRIGGER_COMMAND_INVALID');
    return;
  }
  throw new Error('TRIGGER_TYPE_UNSUPPORTED');
}

function validateCi(ci, pr, approvalCreatedAt) {
  if (!ci || ci.workflowId !== POLICY.qualityWorkflowId || ci.workflowName !== POLICY.qualityWorkflowName) {
    throw new Error('CI_WORKFLOW_IDENTITY_INVALID');
  }
  if (ci.workflowPath !== POLICY.qualityWorkflowPath || ci.event !== 'pull_request') {
    throw new Error('CI_WORKFLOW_SOURCE_INVALID');
  }
  const expectedDisplayTitle =
    `CI pull_request PR-${pr.number} base-${pr.base.sha} head-${pr.head.sha}`;
  if (ci.displayTitle !== expectedDisplayTitle) throw new Error('CI_RUN_NAME_BINDING_INVALID');
  if (ci.headSha !== pr.head.sha) throw new Error('CI_HEAD_STALE');
  if (
    ci.headBranch !== pr.head.ref || ci.repositoryId !== POLICY.repositoryId ||
    ci.headRepositoryId !== POLICY.repositoryId
  ) {
    throw new Error('CI_PR_IDENTITY_MISMATCH');
  }
  const ciCreatedAt = Date.parse(ci.createdAt);
  const prCreatedAt = Date.parse(pr.createdAt);
  const approvalCreatedAtMs = Date.parse(approvalCreatedAt);
  if (
    !Number.isFinite(ciCreatedAt) || !Number.isFinite(prCreatedAt) ||
    !Number.isFinite(approvalCreatedAtMs)
  ) {
    throw new Error('CI_PR_OR_APPROVAL_CREATED_AT_INVALID');
  }
  if (ciCreatedAt < prCreatedAt) throw new Error('CI_PREDATES_CURRENT_PR');
  if (ciCreatedAt < approvalCreatedAtMs) throw new Error('CI_PREDATES_CURRENT_APPROVAL');
  if (ci.status !== 'completed' || !TERMINAL_CI_CONCLUSIONS.has(ci.conclusion)) {
    throw new Error(`CI_NOT_ACCEPTED_TERMINAL_STATE:${ci.conclusion ?? ci.status}`);
  }
  const suite = ci.checkSuite;
  if (
    !suite || suite.id !== ci.checkSuiteId || suite.repositoryId !== POLICY.repositoryId ||
    suite.appId !== POLICY.actionsApp.id || suite.appSlug !== POLICY.actionsApp.slug ||
    suite.headSha !== pr.head.sha || suite.headBranch !== pr.head.ref || suite.after !== pr.head.sha ||
    suite.status !== ci.status || suite.conclusion !== ci.conclusion ||
    !Array.isArray(suite.pullRequests) || suite.pullRequests.length > 1
  ) {
    throw new Error('CI_CHECK_SUITE_IDENTITY_INVALID');
  }
  // GitHub may return an empty pull_requests array for a pull_request workflow's
  // Check Suite. The unique-open-PR lookup plus workflow-run and job identity
  // establish the binding in that case. If GitHub does return a record, it must
  // agree exactly with the current PR.
  if (suite.pullRequests.length === 1) {
    const suitePr = suite.pullRequests[0];
    if (
      suitePr.number !== pr.number ||
      suitePr.base.ref !== pr.base.ref || suitePr.base.sha !== pr.base.sha ||
      suitePr.base.repoId !== pr.base.repoId ||
      suitePr.head.ref !== pr.head.ref || suitePr.head.sha !== pr.head.sha ||
      suitePr.head.repoId !== pr.head.repoId
    ) {
      throw new Error('CI_CHECK_SUITE_PR_BINDING_INVALID');
    }
  }
  if (ci.jobTotalCount !== ci.jobs.length) throw new Error('CI_JOBS_PAGINATION_OR_COUNT_MISMATCH');
  const jobs = ci.jobs.filter((job) => job.name === POLICY.qualityJobName);
  if (jobs.length !== 1 || ci.jobs.length !== 1 || jobs[0].status !== 'completed') {
    throw new Error('QUALITY_JOB_IDENTITY_OR_STATUS_INVALID');
  }
  if (
    jobs[0].headSha !== pr.head.sha || jobs[0].runId !== ci.id ||
    jobs[0].runAttempt !== ci.runAttempt || jobs[0].conclusion !== ci.conclusion
  ) {
    throw new Error('QUALITY_JOB_BINDING_OR_CONCLUSION_MISMATCH');
  }
  return ci.conclusion;
}

function validatePrTimeline(prTimeline, ci) {
  if (!Array.isArray(prTimeline)) throw new Error('PR_TIMELINE_RESPONSE_SHAPE_INVALID');
  const ciCreatedAt = Date.parse(ci.createdAt);
  for (const item of prTimeline) {
    if (!CI_INVALIDATING_PR_EVENTS.has(item.event)) continue;
    const eventCreatedAt = Date.parse(item.createdAt);
    if (!Number.isFinite(eventCreatedAt)) throw new Error('PR_TIMELINE_TIMESTAMP_INVALID');
    if (eventCreatedAt >= ciCreatedAt) {
      throw new Error(`CI_INVALIDATED_BY_PR_TIMELINE:${item.event}`);
    }
  }
}

export function evaluateControlSnapshot(snapshot) {
  let details;
  try {
    validateRepository(snapshot.repository);
    if (snapshot.issue?.state !== 'open' || !isOwner(snapshot.issue?.user, 'OWNER')) {
      throw new Error('ISSUE_IDENTITY_OR_STATE_INVALID');
    }
    if (snapshot.issue.isPullRequest !== false || snapshot.issue.number === snapshot.pr?.number) {
      throw new Error('LINKED_ISSUE_IS_PULL_REQUEST');
    }
    const contract = validateContract(extractMarkedJson(snapshot.issue.body, CONTRACT_MARKER));
    const issueBodySha256 = sha256Text(snapshot.issue.body);
    const approval = currentApproval(snapshot.issueComments ?? [], contract, issueBodySha256);
    validatePr(snapshot.pr, snapshot.relatedPullRequests, contract);
    validateLink(snapshot.pr, snapshot.issue, contract, approval, issueBodySha256);
    const pathResult = validateChangedFiles(snapshot.changedFiles, contract);
    const ledgerEntries = validateLedger(snapshot.prComments ?? [], {
      issueNumber: snapshot.issue.number,
      prNumber: snapshot.pr.number,
      approvalCommentId: approval.id,
      issueBodySha256,
      authorizedBaseSha: contract.authorizedBaseSha,
    });
    if (ledgerEntries.length > 0) throw new Error('LEDGER_PRESENT_WHILE_WRITER_DISABLED');
    validateTrigger(snapshot);
    details = {
      issueNumber: snapshot.issue.number,
      issueUrl: `https://github.com/${POLICY.repositoryFullName}/issues/${snapshot.issue.number}`,
      approvalCommentId: approval.id,
      approvalUrl: approval.htmlUrl,
      issueBodySha256,
      authorizedBaseSha: contract.authorizedBaseSha,
      prNumber: snapshot.pr.number,
      prUrl: `https://github.com/${POLICY.repositoryFullName}/pull/${snapshot.pr.number}`,
      headSha: snapshot.pr.head.sha,
      changedFiles: [...new Set(snapshot.changedFiles.flatMap((file) =>
        file.status === 'renamed' ? [file.previousFilename, file.filename] : [file.filename],
      ))].sort(),
      taskClass: contract.taskClass,
      requestedRepairLimit: contract.maxRepairRounds,
      ciStatus: snapshot.ci ? `${snapshot.ci.status}/${snapshot.ci.conclusion}` : 'NOT_FOUND',
      autoFixRoundCount: 0,
    };
    const conclusion = validateCi(snapshot.ci, snapshot.pr, approval.createdAt);
    validatePrTimeline(snapshot.prTimeline, snapshot.ci);
    if (conclusion === 'success') {
      return pass('CI_ACCEPTED_OBSERVER_ONLY', {
        ...details,
        unverifiedItems: [
          'BRANCH_PROTECTION',
          'OWNER_REVIEW_NO_BYPASS',
          'OBSERVER_POST_MERGE_ACTIVATION',
          'APPROVAL_PR_AND_HEAD_REF_BINDING',
          'VISIBLE_ISSUE_FIELDS_MATCH_CONTRACT',
          'P2_SEMANTIC_SCOPE_REVIEW',
          'EXACT_TEST_COMMAND_EXIT_CODES',
        ],
        humanActionRequired: 'HUMAN_REVIEW;DO_NOT_MERGE_BY_AUTOMATION',
      });
    }
    if (pathResult.lifecycleChange) throw new Error('LIFECYCLE_CHANGE_REQUIRES_HUMAN');
    throw new Error('OBSERVER_ONLY_AUTO_FIX_DISABLED');
  } catch (error) {
    return hold([error instanceof Error ? error.message : 'UNKNOWN_GATE_ERROR'], {
      ...details,
      humanActionRequired: 'RESOLVE_HOLD_AND_RUN_EXACT_OWNER_RECONCILE',
    });
  }
}

function normalizeUser(user) {
  return user ? { id: user.id, login: user.login, type: user.type } : null;
}

function parseLinkHeader(value) {
  const links = new Map();
  if (!value) return links;
  for (const part of value.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/u);
    if (match) links.set(match[2], match[1]);
  }
  return links;
}

function createApi(token, baseUrl) {
  if (!token) throw new Error('GITHUB_TOKEN_MISSING');
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  async function request(path) {
    const response = await fetch(`${baseUrl}${path}`, { headers });
    if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${path}`);
    return { data: await response.json(), headers: response.headers };
  }
  async function list(path) {
    const items = [];
    const separator = path.includes('?') ? '&' : '?';
    let next = `${baseUrl}${path}${separator}per_page=100`;
    for (let page = 0; page < 10 && next; page += 1) {
      const response = await fetch(next, { headers });
      if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${path}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error(`GITHUB_API_LIST_SHAPE:${path}`);
      items.push(...data);
      next = parseLinkHeader(response.headers.get('link')).get('next') ?? null;
    }
    if (next) throw new Error(`GITHUB_API_PAGINATION_LIMIT:${path}`);
    return items;
  }
  async function graphql(query, variables) {
    const response = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`GITHUB_GRAPHQL_${response.status}`);
    const payload = await response.json();
    if (!payload || !payload.data || (Array.isArray(payload.errors) && payload.errors.length > 0)) {
      throw new Error('GITHUB_GRAPHQL_SHAPE_OR_ERRORS');
    }
    return payload.data;
  }
  return { graphql, list, request };
}

export async function resolvePrNumber(api, repositoryPath, eventName, event) {
  if (eventName === 'workflow_run') {
    if (
      event.workflow_run?.workflow_id !== POLICY.qualityWorkflowId ||
      event.workflow_run?.name !== POLICY.qualityWorkflowName ||
      event.workflow_run?.event !== 'pull_request' ||
      !isCommitSha(event.workflow_run?.head_sha) ||
      typeof event.workflow_run?.head_branch !== 'string'
    ) {
      throw new Error('TRIGGER_WORKFLOW_SOURCE_INVALID');
    }
    const candidates = await api.list(
      `${repositoryPath}/pulls?state=open&head=${encodeURIComponent(`${POLICY.owner.login}:${event.workflow_run.head_branch}`)}`,
    );
    if (candidates.length !== 1) throw new Error(`TRIGGER_PR_COUNT_${candidates.length}`);
    const candidate = candidates[0];
    if (
      candidate.head?.sha !== event.workflow_run.head_sha ||
      candidate.head?.repo?.id !== POLICY.repositoryId ||
      candidate.base?.repo?.id !== POLICY.repositoryId
    ) {
      throw new Error('TRIGGER_PR_IDENTITY_MISMATCH');
    }
    return candidate.number;
  }
  if (eventName === 'issue_comment') {
    if (!event.issue?.pull_request) throw new Error('COMMENT_NOT_ON_PR');
    return event.issue.number;
  }
  throw new Error(`EVENT_UNSUPPORTED:${eventName}`);
}

function normalizeEvent(eventName, event) {
  if (eventName === 'workflow_run') {
    return {
      type: eventName,
      triggerId: String(event.workflow_run.id),
      workflowId: event.workflow_run.workflow_id,
      workflowName: event.workflow_run.name,
      headSha: event.workflow_run.head_sha,
      actor: normalizeUser(event.sender),
      authorAssociation: null,
    };
  }
  if (eventName === 'issue_comment') {
    return {
      type: eventName,
      triggerId: String(event.comment.id),
      workflowId: null,
      workflowName: null,
      headSha: null,
      actor: normalizeUser(event.sender),
      authorAssociation: event.comment.author_association,
      command: event.comment.body.trim(),
    };
  }
  throw new Error(`EVENT_UNSUPPORTED:${eventName}`);
}

function normalizeSuitePullRequest(candidate) {
  return {
    number: candidate.number,
    base: {
      ref: candidate.base?.ref,
      sha: candidate.base?.sha,
      repoId: candidate.base?.repo?.id,
    },
    head: {
      ref: candidate.head?.ref,
      sha: candidate.head?.sha,
      repoId: candidate.head?.repo?.id,
    },
  };
}

export async function latestCi(api, repositoryPath, pr) {
  const { data } = await api.request(
    `${repositoryPath}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`,
  );
  if (!Array.isArray(data.workflow_runs) || !Number.isInteger(data.total_count)) {
    throw new Error('CI_RUNS_RESPONSE_SHAPE_INVALID');
  }
  if (data.total_count !== data.workflow_runs.length) {
    throw new Error('CI_RUNS_PAGINATION_OR_COUNT_MISMATCH');
  }
  const eligible = data.workflow_runs.filter((run) =>
    run.workflow_id === POLICY.qualityWorkflowId &&
    run.name === POLICY.qualityWorkflowName &&
    run.path === POLICY.qualityWorkflowPath &&
    run.event === 'pull_request' &&
    run.head_sha === pr.head.sha &&
    run.head_branch === pr.head.ref &&
    run.repository?.id === POLICY.repositoryId &&
    run.head_repository?.id === POLICY.repositoryId &&
    Date.parse(run.created_at) >= Date.parse(pr.createdAt),
  );
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => b.id - a.id);
  const run = eligible[0];
  if (!Number.isInteger(run.check_suite_id) || !Number.isInteger(run.run_attempt)) {
    throw new Error('CI_RUN_IDENTITY_SHAPE_INVALID');
  }
  const [{ data: jobsData }, { data: suite }] = await Promise.all([
    api.request(`${repositoryPath}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`),
    api.request(`${repositoryPath}/check-suites/${run.check_suite_id}`),
  ]);
  if (!Array.isArray(jobsData.jobs) || !Number.isInteger(jobsData.total_count)) {
    throw new Error('CI_JOBS_RESPONSE_SHAPE_INVALID');
  }
  if (jobsData.total_count !== jobsData.jobs.length) {
    throw new Error('CI_JOBS_PAGINATION_OR_COUNT_MISMATCH');
  }
  if (!Array.isArray(suite.pull_requests)) throw new Error('CI_CHECK_SUITE_RESPONSE_SHAPE_INVALID');
  return {
    id: run.id,
    workflowId: run.workflow_id,
    workflowName: run.name,
    displayTitle: run.display_title,
    workflowPath: run.path,
    event: run.event,
    headSha: run.head_sha,
    headBranch: run.head_branch,
    repositoryId: run.repository?.id,
    headRepositoryId: run.head_repository?.id,
    createdAt: run.created_at,
    status: run.status,
    conclusion: run.conclusion,
    checkSuiteId: run.check_suite_id,
    runAttempt: run.run_attempt,
    checkSuite: {
      id: suite.id,
      repositoryId: suite.repository?.id,
      appId: suite.app?.id,
      appSlug: suite.app?.slug,
      headSha: suite.head_sha,
      headBranch: suite.head_branch,
      after: suite.after,
      status: suite.status,
      conclusion: suite.conclusion,
      pullRequests: suite.pull_requests.map(normalizeSuitePullRequest),
    },
    jobTotalCount: jobsData.total_count,
    jobs: jobsData.jobs.map((job) => ({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      headSha: job.head_sha,
      runId: job.run_id,
      runAttempt: job.run_attempt,
    })).sort((a, b) => a.id - b.id),
  };
}

function treeMap(commit, tree, expectedCommitSha, label) {
  if (commit.sha !== expectedCommitSha || !isCommitSha(commit.tree?.sha)) {
    throw new Error(`${label}_COMMIT_IDENTITY_INVALID`);
  }
  if (tree.sha !== commit.tree.sha || tree.truncated !== false || !Array.isArray(tree.tree)) {
    throw new Error(`${label}_TREE_SHAPE_INVALID`);
  }
  const map = new Map();
  for (const entry of tree.tree) {
    if (typeof entry.path !== 'string' || map.has(entry.path)) {
      throw new Error(`${label}_TREE_PATH_INVALID_OR_DUPLICATE`);
    }
    map.set(entry.path, { mode: entry.mode, type: entry.type, sha: entry.sha });
  }
  return map;
}

function assertTreeEndpoint(entry, path, label) {
  if (!entry || !FILE_MODES.has(entry.mode)) throw new Error(`${label}_TREE_ENTRY_MISSING:${path}`);
  const expectedType = entry.mode === '160000' ? 'commit' : 'blob';
  if (entry.type !== expectedType || !isCommitSha(entry.sha)) {
    throw new Error(`${label}_TREE_ENTRY_SHAPE_INVALID:${path}`);
  }
}

function normalizeChangedFiles(files, baseMap, headMap, expectedCount) {
  if (!Array.isArray(files) || files.length !== expectedCount) {
    throw new Error('CHANGED_FILES_PAGINATION_OR_COUNT_MISMATCH');
  }
  const normalized = [];
  const seen = new Set();
  for (const file of files) {
    if (seen.has(file.filename)) throw new Error('CHANGED_FILE_DUPLICATE');
    seen.add(file.filename);
    const current = headMap.get(file.filename);
    const previousPath = file.status === 'renamed' ? file.previous_filename : file.filename;
    const previous = baseMap.get(previousPath);
    if (file.status === 'added') {
      assertTreeEndpoint(current, file.filename, 'HEAD');
      if (baseMap.has(file.filename)) throw new Error(`ADDED_PATH_EXISTS_IN_BASE:${file.filename}`);
    } else if (file.status === 'removed') {
      assertTreeEndpoint(previous, previousPath, 'BASE');
      if (headMap.has(file.filename)) throw new Error(`REMOVED_PATH_EXISTS_IN_HEAD:${file.filename}`);
    } else if (file.status === 'modified') {
      assertTreeEndpoint(previous, previousPath, 'BASE');
      assertTreeEndpoint(current, file.filename, 'HEAD');
    } else if (file.status === 'renamed') {
      assertTreeEndpoint(previous, previousPath, 'BASE');
      assertTreeEndpoint(current, file.filename, 'HEAD');
      if (headMap.has(previousPath) || baseMap.has(file.filename)) {
        throw new Error(`RENAMED_PATH_ENDPOINT_AMBIGUOUS:${file.filename}`);
      }
    } else {
      throw new Error(`CHANGED_FILE_STATUS_UNSUPPORTED:${file.status}`);
    }
    normalized.push({
      filename: file.filename,
      previousFilename: file.previous_filename ?? null,
      status: file.status,
      mode: current?.mode ?? null,
      previousMode: previous?.mode ?? null,
    });
  }
  return normalized.sort((a, b) => a.filename.localeCompare(b.filename));
}

function normalizeComment(comment) {
  return {
    id: comment.id,
    body: comment.body ?? '',
    user: normalizeUser(comment.user),
    authorAssociation: comment.author_association,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    htmlUrl: comment.html_url,
  };
}

async function repositoryAutoMerge(api) {
  const [owner, name] = POLICY.repositoryFullName.split('/');
  const data = await api.graphql(
    'query RepositoryAutoMerge($owner:String!,$name:String!){repository(owner:$owner,name:$name){databaseId nameWithOwner autoMergeAllowed}}',
    { owner, name },
  );
  if (
    data.repository?.databaseId !== POLICY.repositoryId ||
    data.repository?.nameWithOwner !== POLICY.repositoryFullName ||
    typeof data.repository?.autoMergeAllowed !== 'boolean'
  ) {
    throw new Error('AUTO_MERGE_GRAPHQL_SHAPE_INVALID');
  }
  return data.repository.autoMergeAllowed;
}

async function loadSnapshotOnce(api, repositoryPath, prNumber, eventName, event) {
  const [{ data: repo }, { data: pr }, allowAutoMerge] = await Promise.all([
    api.request(repositoryPath),
    api.request(`${repositoryPath}/pulls/${prNumber}`),
    repositoryAutoMerge(api),
  ]);
  const link = extractMarkedJson(pr.body ?? '', LINK_MARKER);
  if (!Number.isInteger(link.issueNumber) || link.issueNumber < 1) {
    throw new Error('LINKED_ISSUE_NUMBER_INVALID');
  }
  const normalizedPr = {
    number: pr.number,
    state: pr.state,
    draft: pr.draft,
    merged: pr.merged,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    body: pr.body ?? '',
    changedFilesCount: pr.changed_files,
    base: { ref: pr.base?.ref, sha: pr.base?.sha, repoId: pr.base?.repo?.id },
    head: { ref: pr.head?.ref, sha: pr.head?.sha, repoId: pr.head?.repo?.id },
  };
  const [{ data: baseCommit }, { data: headCommit }] = await Promise.all([
    api.request(`${repositoryPath}/git/commits/${normalizedPr.base.sha}`),
    api.request(`${repositoryPath}/git/commits/${normalizedPr.head.sha}`),
  ]);
  const [
    { data: issue }, issueComments, prComments, prTimelineRaw, changedFilesRaw, relatedRaw,
    { data: baseTree }, { data: headTree }, ci,
  ] = await Promise.all([
    api.request(`${repositoryPath}/issues/${link.issueNumber}`),
    api.list(`${repositoryPath}/issues/${link.issueNumber}/comments`),
    api.list(`${repositoryPath}/issues/${prNumber}/comments`),
    api.list(`${repositoryPath}/issues/${prNumber}/timeline`),
    api.list(`${repositoryPath}/pulls/${prNumber}/files`),
    api.list(`${repositoryPath}/pulls?state=open&head=${encodeURIComponent(`${POLICY.owner.login}:${normalizedPr.head.ref}`)}`),
    api.request(`${repositoryPath}/git/trees/${baseCommit.tree.sha}?recursive=1`),
    api.request(`${repositoryPath}/git/trees/${headCommit.tree.sha}?recursive=1`),
    latestCi(api, repositoryPath, normalizedPr),
  ]);
  const baseMap = treeMap(baseCommit, baseTree, normalizedPr.base.sha, 'BASE');
  const headMap = treeMap(headCommit, headTree, normalizedPr.head.sha, 'HEAD');
  const comments = (items) => items.map(normalizeComment).sort((a, b) => a.id - b.id);
  return {
    repository: {
      id: repo.id,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      owner: normalizeUser(repo.owner),
      allowAutoMerge,
    },
    event: normalizeEvent(eventName, event),
    issue: {
      number: issue.number,
      state: issue.state,
      body: issue.body ?? '',
      updatedAt: issue.updated_at,
      user: normalizeUser(issue.user),
      isPullRequest: Boolean(issue.pull_request),
    },
    issueComments: comments(issueComments),
    pr: normalizedPr,
    prTimeline: prTimelineRaw
      .filter((item) => CI_INVALIDATING_PR_EVENTS.has(item.event))
      .map((item) => ({ event: item.event, createdAt: item.created_at }))
      .sort((a, b) => `${a.createdAt}:${a.event}`.localeCompare(`${b.createdAt}:${b.event}`)),
    relatedPullRequests: relatedRaw.map((related) => ({
      number: related.number,
      baseRef: related.base?.ref,
      baseRepoId: related.base?.repo?.id,
      headRef: related.head?.ref,
      headSha: related.head?.sha,
      headRepoId: related.head?.repo?.id,
    })).sort((a, b) => a.number - b.number),
    changedFiles: normalizeChangedFiles(
      changedFilesRaw,
      baseMap,
      headMap,
      normalizedPr.changedFilesCount,
    ),
    prComments: comments(prComments),
    ci,
  };
}

export async function buildSnapshotFromGitHub({
  eventName,
  event,
  token,
  repositoryFullName,
  apiUrl = 'https://api.github.com',
}) {
  if (repositoryFullName !== POLICY.repositoryFullName) throw new Error('EVENT_REPOSITORY_MISMATCH');
  const api = createApi(token, apiUrl);
  const repositoryPath = `/repos/${repositoryFullName}`;
  const prNumber = await resolvePrNumber(api, repositoryPath, eventName, event);
  const first = await loadSnapshotOnce(api, repositoryPath, prNumber, eventName, event);
  const closing = await loadSnapshotOnce(api, repositoryPath, prNumber, eventName, event);
  if (sha256Text(JSON.stringify(first)) !== sha256Text(JSON.stringify(closing))) {
    throw new Error('SNAPSHOT_CHANGED_DURING_READ');
  }
  const { data: finalPr } = await api.request(`${repositoryPath}/pulls/${prNumber}`);
  const finalPrIdentity = {
    number: finalPr.number,
    state: finalPr.state,
    draft: finalPr.draft,
    merged: finalPr.merged,
    createdAt: finalPr.created_at,
    updatedAt: finalPr.updated_at,
    body: finalPr.body ?? '',
    changedFilesCount: finalPr.changed_files,
    base: { ref: finalPr.base?.ref, sha: finalPr.base?.sha, repoId: finalPr.base?.repo?.id },
    head: { ref: finalPr.head?.ref, sha: finalPr.head?.sha, repoId: finalPr.head?.repo?.id },
  };
  if (JSON.stringify(finalPrIdentity) !== JSON.stringify(first.pr)) {
    throw new Error('FINAL_PR_CHANGED_DURING_READ');
  }
  return first;
}

export function formatResultLines(result) {
  const values = {
    RESULT: result.result,
    CONTROL_STATE: result.controlState,
    DECISION: result.decision,
    CONTROL_MODE: result.controlMode,
    ISSUE_URL: result.issueUrl ?? 'UNKNOWN',
    ISSUE_APPROVAL_URL: result.approvalUrl ?? 'UNKNOWN',
    ISSUE_BODY_SHA256: result.issueBodySha256 ?? 'UNKNOWN',
    DRAFT_PR_URL: result.prUrl ?? 'UNKNOWN',
    BASE_SHA: result.authorizedBaseSha ?? 'UNKNOWN',
    HEAD_SHA: result.headSha ?? 'UNKNOWN',
    CHANGED_FILES: result.changedFiles?.join(',') ?? 'UNKNOWN',
    TEST_COMMANDS_AND_EXIT_CODES: 'UNVERIFIED_FROM_READ_ONLY_GITHUB_METADATA;SEE_EXACT_CI_RUN_LOGS',
    CI_STATUS: result.ciStatus ?? 'UNKNOWN',
    AUTO_FIX_ROUND_COUNT: result.autoFixRoundCount ?? 0,
    AUTO_FIX_WRITE: result.autoFixWrite,
    AUTO_MERGE: result.autoMerge,
    P2_STATUS: result.p2Status,
    UNVERIFIED_ITEMS: result.unverifiedItems?.join(',') ?? 'NONE',
    HUMAN_ACTION_REQUIRED: result.humanActionRequired ?? 'REVIEW_RESULT',
    REASONS: result.reasons.join(',') || 'NONE',
  };
  return [...Object.entries(values).map(([key, value]) => `${key}=${value}`), JSON.stringify(result)];
}

async function main() {
  if (process.argv[2] !== 'observe') {
    throw new Error('USAGE: node autonomous-control-gate-v2.mjs observe');
  }
  if (!process.env.GITHUB_EVENT_PATH) throw new Error('GITHUB_EVENT_PATH_MISSING');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const snapshot = await buildSnapshotFromGitHub({
    eventName: process.env.GITHUB_EVENT_NAME,
    event,
    token: process.env.GITHUB_TOKEN,
    repositoryFullName: process.env.GITHUB_REPOSITORY,
    apiUrl: process.env.GITHUB_API_URL,
  });
  const result = evaluateControlSnapshot(snapshot);
  for (const line of formatResultLines(result)) console.log(line);
  if (result.result !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const result = hold([
      `GATE_INFRASTRUCTURE:${error instanceof Error ? error.message : 'UNKNOWN'}`,
    ], { humanActionRequired: 'INSPECT_INFRASTRUCTURE_AND_RECONCILE' });
    for (const line of formatResultLines(result)) console.log(line);
    process.exitCode = 1;
  });
}
