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
const PROGRAM_BINDING_MARKER = 'PROGRAM_CHILD_BINDING_JSON';
const PROGRAM_LINK_MARKER = 'PROGRAM_CHILD_LINK_JSON';
const PROGRAM_REVIEW_MARKER = 'PROGRAM_INDEPENDENT_REVIEW_JSON';
const PROGRAM_ID = 'AI_VISION_V5_S1I_AUTONOMOUS_DELIVERY_V1';
const PROGRAM_CONTRACT_SHA256 = 'c195546426c3804adaad2056b9f59a63decdec79ca88a20e7e47ee680f652f2a';
const PROGRAM_SCHEMA = 'autonomous-delivery-program-v1';
const PROGRAM_CHILD_SCHEMA = 'autonomous-delivery-child-v1';
const PROGRAM_REVIEW_SCHEMA = 'autonomous-delivery-review-v1';
const PROGRAM_ALLOWED_RISKS = new Set(['GREEN', 'YELLOW_BOUNDED']);
const PROGRAM_PROHIBITED_ACTIONS = new Set([
  'credential_or_permission_change',
  'destructive_operation',
  'force_push',
  'force_with_lease',
  'paid_action',
  'production_deploy',
  'protection_bypass',
  'real_provider',
  'security_check_disable',
  'shared_or_persistent_database',
]);
const PROGRAM_PERMITTED_ACTIONS = new Set([
  'branch',
  'draft_pr',
  'independent_ai_review',
  'isolated_worktree',
  'isolated_validation',
  'issue',
  'local_patch',
  'normal_commit',
  'normal_push',
  'ready',
  'safe_squash_merge',
]);
const PROGRAM_MAX_PR_COUNT = 3;
const PROGRAM_LOCAL_CORRECTION_LIMIT = 3;
const PROGRAM_PUBLISHED_CORRECTION_LIMIT = 2;
const PROGRAM_CI_RERUN_LIMIT = 1;
const PROGRAM_CHILD_2_PATHS = Object.freeze([
  'AGENTS.md',
  'docs/governance/GITHUB_AUTONOMOUS_DEVELOPMENT_CONTROL_PLANE_V2.md',
  'docs/governance/V5_P2_ENTRY_GOVERNANCE.md',
]);
const PROGRAM_CHILD_3_FIXED_PATHS = Object.freeze([
  'app/api/p2/projects/[projectId]/asset-tasks/[assetTaskId]/artifacts/[artifactId]/revisions/[artifactRevisionId]/content/route.ts',
  'app/api/p2/projects/[projectId]/asset-tasks/[assetTaskId]/execute-internal-test/route.ts',
  'prisma/schema.prisma',
  'src/http/p2-asset-task-api.ts',
  'src/tasks/asset-task.ts',
  'src/tasks/internal-asset-task-execution.ts',
  'tests/integration/p2-s1i-internal-attempt-artifact-lineage.test.ts',
  'tests/unit/p2-internal-attempt-artifact-api.test.ts',
]);
const PROGRAM_CHILD_3_MIGRATION =
  /^prisma\/migrations\/[0-9]{14}_p2_internal_attempt_artifact_lineage\/migration\.sql$/u;
const TASK_PHASES = Object.freeze({
  ORDINARY_TASK: 'P2_LOCKED',
  CONTROL_PLANE_CHANGE: 'P2_LOCKED',
  P2_IMPLEMENTATION: 'P2_DRAFT_ONLY',
  P2_AUTH_IMPLEMENTATION: 'P2_AUTH_DRAFT_ONLY',
});
const TERMINAL_CI_CONCLUSIONS = new Set(['success', 'failure']);
const FILE_MODES = new Set(['100644', '100755', '120000', '160000']);
const PROTECTED_PATHS = ['AGENTS.md', 'CODEOWNERS', '.github/', 'docs/governance/'];
const LIFECYCLE_PATHS = new Set([
  'bun.lock',
  'bun.lockb',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);
const PERMANENT_PR_LIFECYCLE_HOLD_EVENTS = new Set([
  'convert_to_draft',
  'ready_for_review',
]);

function isP2TaskClass(taskClass) {
  return taskClass === 'P2_IMPLEMENTATION' || taskClass === 'P2_AUTH_IMPLEMENTATION';
}
const CI_INVALIDATING_PR_EVENTS = new Set([
  ...PERMANENT_PR_LIFECYCLE_HOLD_EVENTS,
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
      'CONTROL_REVISION_POST_MERGE_ACTIVATION_IF_CHANGED',
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

function extractOptionalMarkedJson(text, marker) {
  if (!mentionsMarker(text, marker)) return null;
  return extractMarkedJson(text, marker);
}

export function canonicalProgramIssueContract(text) {
  if (typeof text !== 'string' || text.startsWith('\uFEFF') || text.includes('\r')) {
    throw new Error('PROGRAM_ISSUE_BODY_NOT_CANONICAL_UTF8_LF');
  }
  if (!text.endsWith('\n') || text.endsWith('\n\n')) {
    throw new Error('PROGRAM_ISSUE_BODY_FINAL_LF_INVALID');
  }
  const begin = `<!-- ${PROGRAM_BINDING_MARKER}_BEGIN\n`;
  const end = `\n${PROGRAM_BINDING_MARKER}_END -->\n`;
  const start = text.indexOf(begin);
  if (start < 0 || text.indexOf(begin, start + begin.length) >= 0) {
    throw new Error('PROGRAM_BINDING_BLOCK_COUNT_INVALID');
  }
  const finish = text.indexOf(end, start + begin.length);
  if (finish < 0 || text.indexOf(end, finish + end.length) >= 0) {
    throw new Error('PROGRAM_BINDING_BLOCK_END_INVALID');
  }
  const canonical = `${text.slice(0, start)}${text.slice(finish + end.length)}`;
  if (!canonical.endsWith('\n') || canonical.endsWith('\n\n') || canonical.includes('\r')) {
    throw new Error('PROGRAM_ISSUE_CONTRACT_CANONICALIZATION_INVALID');
  }
  return canonical;
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

function expectedCiRunName(pr) {
  return `${POLICY.qualityWorkflowName} pull_request PR-${pr.number} ` +
    `base-${pr.base.sha} head-${pr.head.sha}`;
}

export function isCanonicalRepositoryPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return false;
  if (value !== value.normalize('NFC')) return false;
  if (value.startsWith('/') || value.endsWith('/') || value.includes('\\')) return false;
  if (/[\u0000-\u001f\u007f*?{}!]/u.test(value)) return false;
  const segments = value.split('/');
  return !segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..');
}

export function isCanonicalHeadRef(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) return false;
  if (value !== value.trim() || value.startsWith('/') || value.endsWith('/')) return false;
  if (value.endsWith('.') || value === '@') return false;
  if (value.includes('..') || value.includes('//') || value.includes('@{') || value.includes('\\')) {
    return false;
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment.startsWith('.') || segment.endsWith('.lock'))) return false;
  return !/[\u0000-\u0020\u007f~^:?*\[\]]/u.test(value);
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function isIsoInstant(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isProgramIdentifier(value, prefix) {
  return typeof value === 'string' && new RegExp(`^${prefix}[a-z0-9-]{16,128}$`, 'u').test(value);
}

function exactStringSet(actual, expected, label) {
  if (
    !Array.isArray(actual) ||
    actual.some((item) => typeof item !== 'string') ||
    new Set(actual).size !== actual.length ||
    JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())
  ) {
    throw new Error(`${label}_INVALID`);
  }
}

function validateProgramRootBinding(binding, issueBody) {
  exactKeys(binding, [
    'activatedAt', 'authorizedBaseSha', 'authorizedHeadRef', 'bindingType', 'childOrdinal',
    'contractSha256', 'delegationActivationSha', 'exactAllowedPaths', 'expectedBaseSha',
    'expiresAt', 'grantId', 'issueContractSha256', 'maxPrCount', 'nonce',
    'permittedActions', 'permittedRiskClasses', 'previousMergeSha', 'programId',
    'prohibitedActions', 'remainingChildIssueCount', 'repositoryId', 'riskClass', 'schema',
  ], 'PROGRAM_ROOT_BINDING');
  if (
    binding.schema !== PROGRAM_SCHEMA ||
    binding.bindingType !== 'PROGRAM_ROOT' ||
    binding.programId !== PROGRAM_ID ||
    binding.repositoryId !== POLICY.repositoryId ||
    binding.childOrdinal !== 1 ||
    binding.maxPrCount !== PROGRAM_MAX_PR_COUNT ||
    binding.remainingChildIssueCount !== 2 ||
    binding.riskClass !== 'YELLOW_BOUNDED' ||
    binding.delegationActivationSha !== 'PENDING_PR1_MERGE_AND_EXACT_MAIN_CI_SUCCESS' ||
    !isCommitSha(binding.authorizedBaseSha) ||
    binding.authorizedBaseSha !== binding.expectedBaseSha ||
    binding.authorizedBaseSha !== binding.previousMergeSha ||
    !isCanonicalHeadRef(binding.authorizedHeadRef) ||
    binding.contractSha256 !== PROGRAM_CONTRACT_SHA256 ||
    !isSha256(binding.issueContractSha256) ||
    !isProgramIdentifier(binding.grantId, 'grant-') ||
    !/^[0-9a-f]{32}$/u.test(binding.nonce) ||
    !isIsoInstant(binding.activatedAt) ||
    !isIsoInstant(binding.expiresAt) ||
    Date.parse(binding.activatedAt) >= Date.parse(binding.expiresAt)
  ) {
    throw new Error('PROGRAM_ROOT_BINDING_SHAPE_INVALID');
  }
  if (
    !Array.isArray(binding.exactAllowedPaths) ||
    binding.exactAllowedPaths.length === 0 ||
    binding.exactAllowedPaths.some((path) => !isCanonicalRepositoryPath(path)) ||
    new Set(binding.exactAllowedPaths).size !== binding.exactAllowedPaths.length
  ) {
    throw new Error('PROGRAM_ROOT_ALLOWLIST_INVALID');
  }
  exactStringSet(binding.permittedRiskClasses, PROGRAM_ALLOWED_RISKS, 'PROGRAM_ROOT_RISKS');
  exactStringSet(binding.permittedActions, PROGRAM_PERMITTED_ACTIONS, 'PROGRAM_ROOT_ACTIONS');
  exactStringSet(binding.prohibitedActions, PROGRAM_PROHIBITED_ACTIONS, 'PROGRAM_ROOT_PROHIBITIONS');
  if (sha256Text(canonicalProgramIssueContract(issueBody)) !== binding.issueContractSha256) {
    throw new Error('PROGRAM_ROOT_ISSUE_CONTRACT_SHA_MISMATCH');
  }
  return binding;
}

function validateProgramResourceRequest(resource) {
  exactKeys(
    resource,
    resource.action === 'REGISTER'
      ? ['action', 'contractSha256', 'name']
      : ['action', 'name', 'registrationMergeSha'],
    'PROGRAM_RESOURCE',
  );
  if (!/^[A-Z][A-Z0-9_]{2,127}$/u.test(resource.name)) {
    throw new Error('PROGRAM_RESOURCE_NAME_INVALID');
  }
  if (resource.action === 'REGISTER') {
    if (!isSha256(resource.contractSha256)) throw new Error('PROGRAM_RESOURCE_CONTRACT_SHA_INVALID');
  } else if (resource.action === 'CONSUME') {
    if (!isCommitSha(resource.registrationMergeSha)) {
      throw new Error('PROGRAM_RESOURCE_REGISTRATION_MERGE_INVALID');
    }
  } else {
    throw new Error('PROGRAM_RESOURCE_ACTION_INVALID');
  }
  return resource;
}

function validateProgramChildBinding(binding, issueBody) {
  exactKeys(binding, [
    'activatedAt', 'authorizedBaseSha', 'authorizedHeadRef', 'childOrdinal', 'contractSha256',
    'delegationActivationSha', 'exactAllowedPaths', 'expectedBaseSha', 'expiresAt', 'grantId',
    'issueContractSha256', 'localCorrectionLimit', 'nonce', 'orchestratorSessionId',
    'previousMergeSha', 'programId', 'publishedCorrectionLimit', 'repositoryId',
    'requiredChecks', 'resources', 'riskClass', 'rootIssueNumber', 'schema', 'taskClass',
  ], 'PROGRAM_CHILD_BINDING');
  if (
    binding.schema !== PROGRAM_CHILD_SCHEMA ||
    binding.programId !== PROGRAM_ID ||
    binding.repositoryId !== POLICY.repositoryId ||
    ![2, 3].includes(binding.childOrdinal) ||
    !isCommitSha(binding.delegationActivationSha) ||
    !isCommitSha(binding.authorizedBaseSha) ||
    binding.authorizedBaseSha !== binding.expectedBaseSha ||
    binding.authorizedBaseSha !== binding.previousMergeSha ||
    !isCanonicalHeadRef(binding.authorizedHeadRef) ||
    !isSha256(binding.contractSha256) ||
    !isSha256(binding.issueContractSha256) ||
    !isProgramIdentifier(binding.grantId, 'grant-') ||
    !/^[0-9a-f]{32}$/u.test(binding.nonce) ||
    !/^orchestrator-[a-z0-9-]{16,128}$/u.test(binding.orchestratorSessionId) ||
    !isIsoInstant(binding.activatedAt) ||
    !isIsoInstant(binding.expiresAt) ||
    Date.parse(binding.activatedAt) >= Date.parse(binding.expiresAt) ||
    binding.localCorrectionLimit !== PROGRAM_LOCAL_CORRECTION_LIMIT ||
    binding.publishedCorrectionLimit !== PROGRAM_PUBLISHED_CORRECTION_LIMIT ||
    binding.rootIssueNumber < 1 ||
    !Number.isInteger(binding.rootIssueNumber) ||
    !PROGRAM_ALLOWED_RISKS.has(binding.riskClass) ||
    !['CONTROL_PLANE_CHANGE', 'P2_IMPLEMENTATION'].includes(binding.taskClass) ||
    (binding.childOrdinal === 2 && binding.taskClass !== 'CONTROL_PLANE_CHANGE') ||
    (binding.childOrdinal === 3 && binding.taskClass !== 'P2_IMPLEMENTATION')
  ) {
    throw new Error('PROGRAM_CHILD_BINDING_SHAPE_INVALID');
  }
  if (
    !Array.isArray(binding.exactAllowedPaths) ||
    binding.exactAllowedPaths.length === 0 ||
    binding.exactAllowedPaths.some((path) => !isCanonicalRepositoryPath(path)) ||
    new Set(binding.exactAllowedPaths).size !== binding.exactAllowedPaths.length
  ) {
    throw new Error('PROGRAM_CHILD_ALLOWLIST_INVALID');
  }
  if (
    binding.taskClass === 'CONTROL_PLANE_CHANGE' &&
    binding.exactAllowedPaths.some((path) => !pathIsProtected(path))
  ) {
    throw new Error('PROGRAM_CHILD_CONTROL_PATH_INVALID');
  }
  if (
    binding.taskClass !== 'CONTROL_PLANE_CHANGE' &&
    binding.exactAllowedPaths.some((path) => pathIsProtected(path))
  ) {
    throw new Error('PROGRAM_CHILD_PROTECTED_PATH_INVALID');
  }
  if (binding.childOrdinal === 2) {
    if (
      JSON.stringify([...binding.exactAllowedPaths].sort()) !==
      JSON.stringify([...PROGRAM_CHILD_2_PATHS].sort())
    ) {
      throw new Error('PROGRAM_CHILD_2_ALLOWLIST_NOT_FROZEN');
    }
  } else {
    const migrationPaths = binding.exactAllowedPaths.filter((path) =>
      path.startsWith('prisma/migrations/')
    );
    const nonMigrationPaths = binding.exactAllowedPaths.filter((path) =>
      !path.startsWith('prisma/migrations/')
    );
    if (
      migrationPaths.length !== 1 || !PROGRAM_CHILD_3_MIGRATION.test(migrationPaths[0]) ||
      JSON.stringify(nonMigrationPaths.sort()) !== JSON.stringify([...PROGRAM_CHILD_3_FIXED_PATHS].sort())
    ) {
      throw new Error('PROGRAM_CHILD_3_ALLOWLIST_NOT_FROZEN');
    }
  }
  exactStringSet(binding.requiredChecks, [POLICY.qualityJobName], 'PROGRAM_CHILD_REQUIRED_CHECKS');
  if (!Array.isArray(binding.resources) || binding.resources.length > 1) {
    throw new Error('PROGRAM_CHILD_RESOURCE_COUNT_INVALID');
  }
  binding.resources.forEach(validateProgramResourceRequest);
  if (
    (binding.childOrdinal === 2 && binding.resources[0]?.action !== 'REGISTER') ||
    (binding.childOrdinal === 3 && binding.resources[0]?.action !== 'CONSUME')
  ) {
    throw new Error('PROGRAM_CHILD_RESOURCE_STAGE_INVALID');
  }
  if (sha256Text(canonicalProgramIssueContract(issueBody)) !== binding.issueContractSha256) {
    throw new Error('PROGRAM_CHILD_ISSUE_CONTRACT_SHA_MISMATCH');
  }
  return binding;
}

function validateProgramLink(link, binding, issue, issueBodySha256, pr) {
  exactKeys(link, [
    'authorizedBaseSha', 'authorizedHeadRef', 'childOrdinal', 'ciRerunCount',
    'delegationActivationSha', 'grantId', 'issueBodyReadbackSha256', 'issueContractSha256',
    'issueNumber', 'localCorrectionCount', 'nonce', 'programId', 'publishedCorrectionCount',
    'processRetryCount', 'schema',
  ], 'PROGRAM_CHILD_LINK');
  if (
    link.schema !== PROGRAM_CHILD_SCHEMA ||
    link.programId !== binding.programId ||
    link.issueNumber !== issue.number ||
    link.issueBodyReadbackSha256 !== issueBodySha256 ||
    link.issueContractSha256 !== binding.issueContractSha256 ||
    link.grantId !== binding.grantId ||
    link.nonce !== binding.nonce ||
    link.childOrdinal !== binding.childOrdinal ||
    link.authorizedBaseSha !== binding.authorizedBaseSha ||
    link.authorizedHeadRef !== binding.authorizedHeadRef ||
    link.delegationActivationSha !== binding.delegationActivationSha ||
    pr.head.ref !== binding.authorizedHeadRef ||
    !Number.isInteger(link.localCorrectionCount) ||
    link.localCorrectionCount < 0 ||
    link.localCorrectionCount > binding.localCorrectionLimit ||
    !Number.isInteger(link.publishedCorrectionCount) ||
    link.publishedCorrectionCount < 0 ||
    link.publishedCorrectionCount > binding.publishedCorrectionLimit ||
    !Number.isInteger(link.ciRerunCount) ||
    link.ciRerunCount < 0 ||
    link.ciRerunCount > PROGRAM_CI_RERUN_LIMIT ||
    !Number.isInteger(link.processRetryCount) ||
    link.processRetryCount < 0 ||
    link.processRetryCount > 2
  ) {
    throw new Error('PROGRAM_CHILD_LINK_BINDING_INVALID');
  }
  return link;
}

function validateProgramReview(comments, binding, pr) {
  const current = [];
  for (const comment of comments) {
    if (!mentionsMarker(comment.body, PROGRAM_REVIEW_MARKER)) continue;
    if (!isOwner(comment.user, comment.authorAssociation)) continue;
    if (!comment.createdAt || comment.createdAt !== comment.updatedAt) {
      throw new Error('PROGRAM_REVIEW_EDITED_OR_TIME_MISSING');
    }
    const review = extractMarkedJson(comment.body, PROGRAM_REVIEW_MARKER);
    exactKeys(review, [
      'findings', 'headSha', 'prNumber', 'programId', 'reviewedAt', 'reviewerSessionId',
      'schema', 'verdict',
    ], 'PROGRAM_REVIEW');
    if (
      review.schema !== PROGRAM_REVIEW_SCHEMA ||
      review.programId !== binding.programId ||
      review.prNumber !== pr.number ||
      review.headSha !== pr.head.sha ||
      review.verdict !== 'PASS' ||
      !Array.isArray(review.findings) ||
      review.findings.length !== 0 ||
      !isIsoInstant(review.reviewedAt) ||
      !/^reviewer-[a-z0-9-]{16,128}$/u.test(review.reviewerSessionId) ||
      review.reviewerSessionId === binding.orchestratorSessionId
    ) {
      continue;
    }
    current.push(review);
  }
  const expectedCount = binding.childOrdinal === 3 ? 2 : 1;
  if (
    current.length !== expectedCount ||
    new Set(current.map((review) => review.reviewerSessionId)).size !== current.length
  ) {
    throw new Error(`PROGRAM_CURRENT_REVIEW_COUNT_${current.length}_EXPECTED_${expectedCount}`);
  }
  return current;
}

export function evaluateNamedSingleUseResource({ bindings, currentBinding }) {
  const requests = currentBinding.resources;
  if (requests.length === 0) return 'NOT_APPLICABLE';
  const request = requests[0];
  const prior = bindings.filter((entry) =>
    entry.pr?.merged === true && entry.mergeParentValid === true
  );
  const registrations = prior.filter((entry) =>
    entry.binding.resources?.some((resource) =>
      resource.action === 'REGISTER' && resource.name === request.name
    )
  );
  const consumptions = prior.filter((entry) =>
    entry.binding.resources?.some((resource) =>
      resource.action === 'CONSUME' && resource.name === request.name
    )
  );
  if (request.action === 'REGISTER') {
    if (registrations.length !== 0 || consumptions.length !== 0) {
      throw new Error('PROGRAM_RESOURCE_REPLAYED_REGISTRATION');
    }
    return 'REGISTER_ON_CURRENT_MERGE';
  }
  if (registrations.length !== 1 || consumptions.length !== 0) {
    throw new Error('PROGRAM_RESOURCE_NOT_AVAILABLE');
  }
  if (registrations[0].pr.mergeCommitSha !== request.registrationMergeSha) {
    throw new Error('PROGRAM_RESOURCE_REGISTRATION_BINDING_MISMATCH');
  }
  return 'CONSUME_ON_CURRENT_MERGE';
}

function isOwnerIdentity(user) {
  return (
    user?.id === POLICY.owner.id &&
    user?.login === POLICY.owner.login &&
    user?.type === POLICY.owner.type
  );
}

function isOwner(user, association) {
  return isOwnerIdentity(user) && association === 'OWNER';
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
  const p2Task = isP2TaskClass(contract?.taskClass);
  exactKeys(
    contract,
    [
      'allowedPaths',
      'authorizedBaseSha',
      ...(p2Task ? ['authorizedHeadRef'] : []),
      'maxRepairRounds',
      'phase',
      'requiredChecks',
      'schema',
      'taskClass',
    ],
    'CONTRACT',
  );
  if (contract.schema !== POLICY.schema) throw new Error('CONTRACT_SCHEMA_INVALID');
  const expectedPhase = TASK_PHASES[contract.taskClass];
  if (!expectedPhase) throw new Error('TASK_CLASS_INVALID');
  if (contract.phase !== expectedPhase) throw new Error('TASK_CLASS_PHASE_MISMATCH');
  if (p2Task && !isCanonicalHeadRef(contract.authorizedHeadRef)) {
    throw new Error('AUTHORIZED_HEAD_REF_INVALID');
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
  if (p2Task && contract.maxRepairRounds !== 0) {
    throw new Error('P2_TASK_REPAIR_LIMIT_NOT_ZERO');
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
  if (
    contract.taskClass === 'CONTROL_PLANE_CHANGE' &&
    contract.allowedPaths.some((path) => !pathIsProtected(path))
  ) {
    throw new Error('CONTROL_PLANE_CHANGE_NON_CONTROL_PATH');
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
  const p2Approval = Object.hasOwn(approval, 'authorizedHeadRef');
  exactKeys(
    approval,
    [
      'authorizedBaseSha',
      ...(p2Approval ? ['authorizedHeadRef'] : []),
      'issueBodySha256',
      'maxRepairRounds',
      'phase',
      'schema',
    ],
    'APPROVAL',
  );
  if (
    approval.schema !== POLICY.schema ||
    (
      p2Approval &&
      approval.phase !== 'P2_DRAFT_ONLY' &&
      approval.phase !== 'P2_AUTH_DRAFT_ONLY'
    ) ||
    (!p2Approval && approval.phase !== 'P2_LOCKED') ||
    !/^[0-9a-f]{64}$/u.test(approval.issueBodySha256) ||
    !isCommitSha(approval.authorizedBaseSha) ||
    !Number.isInteger(approval.maxRepairRounds) ||
    approval.maxRepairRounds < 0 ||
    approval.maxRepairRounds > POLICY.hardRepairLimit
  ) {
    throw new Error('APPROVAL_SHAPE_INVALID');
  }
  if (p2Approval && !isCanonicalHeadRef(approval.authorizedHeadRef)) {
    throw new Error('APPROVAL_HEAD_REF_INVALID');
  }
  return approval;
}

function approvalBindsContract(approval, contract, issueBodySha256) {
  return (
    approval.issueBodySha256 === issueBodySha256 &&
    approval.authorizedBaseSha === contract.authorizedBaseSha &&
    approval.maxRepairRounds === contract.maxRepairRounds &&
    approval.phase === contract.phase &&
    Object.hasOwn(approval, 'authorizedHeadRef') === isP2TaskClass(contract.taskClass) &&
    (
      !isP2TaskClass(contract.taskClass) ||
      approval.authorizedHeadRef === contract.authorizedHeadRef
    )
  );
}

function currentApproval(comments, linkedApprovalCommentId, contract, issueBodySha256) {
  const linked = comments.filter((comment) => comment.id === linkedApprovalCommentId);
  if (linked.length !== 1) throw new Error(`LINKED_APPROVAL_COMMENT_COUNT_${linked.length}`);
  const comment = linked[0];
  if (!isOwner(comment.user, comment.authorAssociation)) {
    throw new Error('LINKED_APPROVAL_NOT_TRUSTED_OWNER');
  }
  const approval = parseTrustedApproval(comment);
  if (!approvalBindsContract(approval, contract, issueBodySha256)) {
    throw new Error('APPROVAL_BINDING_MISMATCH');
  }

  let duplicateCurrentApprovalCount = 0;
  for (const historical of comments) {
    if (historical.id === linkedApprovalCommentId) continue;
    if (!mentionsMarker(historical.body, APPROVAL_MARKER)) continue;
    if (!isOwner(historical.user, historical.authorAssociation)) continue;
    try {
      const candidate = parseTrustedApproval(historical);
      if (approvalBindsContract(candidate, contract, issueBodySha256)) {
        duplicateCurrentApprovalCount += 1;
      }
    } catch {
      // Only the exact PR-linked approval is authoritative. An unlinked malformed
      // historical marker remains audit evidence but cannot permanently poison a
      // later valid approval. If the PR links it, parsing above still fails closed.
    }
  }
  if (duplicateCurrentApprovalCount > 0) {
    throw new Error(`VALID_APPROVAL_COUNT_${duplicateCurrentApprovalCount + 1}`);
  }
  return comment;
}

function validateLink(pr, issue, contract, issueBodySha256) {
  const link = extractMarkedJson(pr.body, LINK_MARKER);
  exactKeys(
    link,
    ['approvalCommentId', 'authorizedBaseSha', 'issueBodySha256', 'issueNumber', 'schema'],
    'PR_LINK',
  );
  if (
    link.schema !== POLICY.schema ||
    !Number.isInteger(link.approvalCommentId) ||
    link.approvalCommentId < 1 ||
    link.issueNumber !== issue.number ||
    link.issueBodySha256 !== issueBodySha256 ||
    link.authorizedBaseSha !== contract.authorizedBaseSha
  ) {
    throw new Error('PR_LINK_BINDING_MISMATCH');
  }
  return link;
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

function validateP2DatabaseChangeShape(changedFiles, contract) {
  if (!isP2TaskClass(contract.taskClass)) return 'NOT_APPLICABLE';
  const schemaFiles = changedFiles.filter((file) =>
    file.filename === 'prisma/schema.prisma' || file.previousFilename === 'prisma/schema.prisma',
  );
  const migrationFiles = changedFiles.filter((file) =>
    file.filename.startsWith('prisma/migrations/') ||
    file.previousFilename?.startsWith('prisma/migrations/'),
  );
  const prismaFiles = changedFiles.filter((file) =>
    file.filename.startsWith('prisma/') || file.previousFilename?.startsWith('prisma/'),
  );
  if (prismaFiles.length === 0) return 'NONE';
  if (
    schemaFiles.length !== 1 ||
    schemaFiles[0].filename !== 'prisma/schema.prisma' ||
    schemaFiles[0].status !== 'modified' ||
    schemaFiles[0].mode !== '100644' ||
    schemaFiles[0].previousMode !== '100644'
  ) {
    throw new Error('P2_DATABASE_SCHEMA_CHANGE_SHAPE_INVALID');
  }
  if (migrationFiles.length !== 1) {
    throw new Error('P2_DATABASE_MIGRATION_COUNT_INVALID');
  }
  const migration = migrationFiles[0];
  if (
    migration.status !== 'added' ||
    migration.previousFilename !== null ||
    migration.previousMode !== null ||
    migration.mode !== '100644' ||
    !(
      contract.taskClass === 'P2_AUTH_IMPLEMENTATION'
        ? /^prisma\/migrations\/[0-9]{14}_p2_auth_[a-z0-9][a-z0-9_-]*\/migration\.sql$/u
        : /^prisma\/migrations\/[0-9]{14}_p2_[a-z0-9][a-z0-9_-]*\/migration\.sql$/u
    ).test(
      migration.filename,
    )
  ) {
    throw new Error('P2_DATABASE_MIGRATION_SHAPE_INVALID');
  }
  if (prismaFiles.length !== 2) {
    throw new Error('P2_DATABASE_EXTRA_PRISMA_PATH');
  }
  if (!changedFiles.some((file) =>
    file.status !== 'removed' &&
    file.filename.startsWith('tests/integration/') &&
    file.filename.endsWith('.test.ts')
  )) {
    throw new Error('P2_DATABASE_TEST_PATH_REQUIRED');
  }
  return 'SINGLE_MIGRATION_METADATA_SHAPE_ONLY';
}

function validateP2AuthChangeShape(changedFiles, contract) {
  if (contract.taskClass !== 'P2_AUTH_IMPLEMENTATION') return 'NOT_APPLICABLE';
  const lifecycleFiles = changedFiles.filter((file) =>
    LIFECYCLE_PATHS.has(file.filename.split('/').at(-1)) ||
    (file.previousFilename && LIFECYCLE_PATHS.has(file.previousFilename.split('/').at(-1))),
  );
  const lifecycleNames = lifecycleFiles.map((file) => file.filename).sort();
  if (JSON.stringify(lifecycleNames) !== JSON.stringify(['package-lock.json', 'package.json'])) {
    throw new Error('P2_AUTH_LIFECYCLE_PAIR_REQUIRED');
  }
  if (lifecycleFiles.some((file) =>
    file.previousFilename !== null ||
    file.status !== 'modified' ||
    file.mode !== '100644' ||
    file.previousMode !== '100644'
  )) {
    throw new Error('P2_AUTH_LIFECYCLE_SHAPE_INVALID');
  }
  if (!changedFiles.some((file) =>
    file.status !== 'removed' &&
    file.filename.startsWith('tests/integration/') &&
    file.filename.endsWith('.test.ts')
  )) {
    throw new Error('P2_AUTH_INTEGRATION_TEST_REQUIRED');
  }
  return 'ROOT_NPM_PAIR_AND_SINGLE_AUTH_MIGRATION_REQUIRED';
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
      if (LIFECYCLE_PATHS.has(path.split('/').at(-1))) lifecycleChange = true;
      if (contract.taskClass !== 'CONTROL_PLANE_CHANGE' && pathIsProtected(path)) {
        throw new Error(`NON_CONTROL_PLANE_PROTECTED_PATH:${path}`);
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
  const databaseChange = validateP2DatabaseChangeShape(changedFiles, contract);
  const authChange = validateP2AuthChangeShape(changedFiles, contract);
  if (
    contract.taskClass === 'P2_AUTH_IMPLEMENTATION' &&
    databaseChange !== 'SINGLE_MIGRATION_METADATA_SHAPE_ONLY'
  ) {
    throw new Error('P2_AUTH_SINGLE_MIGRATION_REQUIRED');
  }
  return { authChange, databaseChange, lifecycleChange };
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
  if (isP2TaskClass(contract.taskClass)) {
    if (!isOwnerIdentity(pr.user)) throw new Error('P2_PR_CREATOR_NOT_OWNER');
    if (pr.head.ref !== contract.authorizedHeadRef) throw new Error('P2_PR_HEAD_REF_NOT_AUTHORIZED');
  }
  if (pr.base.sha !== contract.authorizedBaseSha) throw new Error('PR_BASE_SHA_NOT_AUTHORIZED_BASE');
}

function validateTrigger(snapshot) {
  const event = snapshot.event;
  if (event.type === 'workflow_run') {
    if (
      event.workflowId !== POLICY.qualityWorkflowId ||
      event.workflowPath !== POLICY.qualityWorkflowPath ||
      event.workflowEvent !== 'pull_request'
    ) {
      throw new Error('TRIGGER_WORKFLOW_IDENTITY_INVALID');
    }
    const expectedRunName = expectedCiRunName(snapshot.pr);
    if (event.runName !== expectedRunName || event.displayTitle !== expectedRunName) {
      throw new Error('TRIGGER_RUN_NAME_BINDING_INVALID');
    }
    if (
      event.headSha !== snapshot.pr.head.sha ||
      event.headBranch !== snapshot.pr.head.ref
    ) {
      throw new Error('TRIGGER_HEAD_STALE');
    }
    if (String(snapshot.ci?.id) !== event.triggerId) throw new Error('TRIGGER_CI_RUN_MISMATCH');
    if (
      snapshot.ci?.workflowId !== event.workflowId ||
      snapshot.ci?.runPath !== event.workflowPath ||
      snapshot.ci?.event !== event.workflowEvent ||
      snapshot.ci?.runName !== event.runName ||
      snapshot.ci?.displayTitle !== event.displayTitle ||
      snapshot.ci?.headBranch !== event.headBranch
    ) {
      throw new Error('TRIGGER_CI_IDENTITY_MISMATCH');
    }
    if (!Number.isInteger(event.runAttempt) || event.runAttempt < 1) {
      throw new Error('TRIGGER_RUN_ATTEMPT_INVALID');
    }
    if (snapshot.ci?.runAttempt !== event.runAttempt) {
      throw new Error('TRIGGER_CI_RUN_ATTEMPT_MISMATCH');
    }
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
  if (
    !ci ||
    ci.workflowId !== POLICY.qualityWorkflowId ||
    ci.workflowName !== POLICY.qualityWorkflowName ||
    ci.workflowPath !== POLICY.qualityWorkflowPath ||
    ci.workflowState !== 'active'
  ) {
    throw new Error('CI_WORKFLOW_IDENTITY_INVALID');
  }
  if (!Number.isInteger(ci.runAttempt) || ci.runAttempt < 1) {
    throw new Error('CI_RUN_ATTEMPT_INVALID');
  }
  if (ci.runPath !== POLICY.qualityWorkflowPath || ci.event !== 'pull_request') {
    throw new Error('CI_WORKFLOW_SOURCE_INVALID');
  }
  const expectedRunName = expectedCiRunName(pr);
  if (ci.runName !== expectedRunName || ci.displayTitle !== expectedRunName) {
    throw new Error('CI_RUN_NAME_BINDING_INVALID');
  }
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
  if (ciCreatedAt === approvalCreatedAtMs) {
    throw new Error('CI_APPROVAL_TIMESTAMP_ORDER_AMBIGUOUS');
  }
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
    if (PERMANENT_PR_LIFECYCLE_HOLD_EVENTS.has(item.event)) {
      throw new Error(`PR_DRAFT_LIFECYCLE_HISTORY_INVALID:${item.event}`);
    }
    if (eventCreatedAt >= ciCreatedAt) {
      throw new Error(`CI_INVALIDATED_BY_PR_TIMELINE:${item.event}`);
    }
  }
}

function validateProgramHistory(program, currentBinding) {
  if (!Array.isArray(program.bindings)) throw new Error('PROGRAM_HISTORY_MISSING');
  const relevant = program.bindings.filter((entry) => entry.binding?.programId === PROGRAM_ID);
  const grantIds = new Set();
  const nonces = new Set();
  const ordinals = new Set();
  for (const entry of relevant) {
    const binding = entry.binding;
    const nonceKey = `${binding.grantId}:${binding.nonce}`;
    if (grantIds.has(binding.grantId)) throw new Error('PROGRAM_GRANT_ID_REPLAY');
    if (nonces.has(nonceKey)) throw new Error('PROGRAM_NONCE_REPLAY');
    if (ordinals.has(binding.childOrdinal)) throw new Error('PROGRAM_ORDINAL_REPLAY');
    grantIds.add(binding.grantId);
    nonces.add(nonceKey);
    ordinals.add(binding.childOrdinal);
  }
  const expectedOrdinals = Array.from({ length: currentBinding.childOrdinal }, (_, index) => index + 1);
  if (JSON.stringify([...ordinals].sort((a, b) => a - b)) !== JSON.stringify(expectedOrdinals)) {
    throw new Error('PROGRAM_ORDINAL_SEQUENCE_INVALID');
  }
  const priorChildren = relevant
    .filter((entry) => entry.binding.childOrdinal > 1 && entry.binding.childOrdinal < currentBinding.childOrdinal)
    .sort((a, b) => a.binding.childOrdinal - b.binding.childOrdinal);
  if (priorChildren.some((entry) => entry.pr?.merged !== true || entry.mergeParentValid !== true)) {
    throw new Error('PROGRAM_PRIOR_CHILD_NOT_EXACTLY_CONSUMED');
  }
  const expectedPreviousMerge = currentBinding.childOrdinal === 2
    ? program.root.pr.mergeCommitSha
    : priorChildren.at(-1)?.pr?.mergeCommitSha;
  if (
    !isCommitSha(expectedPreviousMerge) ||
    currentBinding.previousMergeSha !== expectedPreviousMerge ||
    currentBinding.expectedBaseSha !== expectedPreviousMerge
  ) {
    throw new Error('PROGRAM_CHILD_PREVIOUS_MERGE_BINDING_INVALID');
  }
  return relevant;
}

function validateProgramTimeline(snapshot) {
  const timeline = snapshot.prTimeline ?? [];
  const ready = timeline.filter((item) => item.event === 'ready_for_review');
  const converted = timeline.filter((item) => item.event === 'convert_to_draft');
  if (converted.length > 0 || ready.length > 1) {
    throw new Error('PROGRAM_PR_LIFECYCLE_HISTORY_INVALID');
  }
  if (snapshot.pr.draft === true) {
    if (ready.length !== 0) throw new Error('PROGRAM_DRAFT_READY_HISTORY_INVALID');
  } else {
    if (ready.length !== 1 || !isOwnerIdentity(ready[0].actor)) {
      throw new Error('PROGRAM_READY_EVENT_NOT_EXACT_ORCHESTRATOR_OWNER');
    }
  }
  const ciCreatedAt = Date.parse(snapshot.ci.createdAt);
  for (const item of timeline) {
    if (item.event === 'ready_for_review' || item.event === 'convert_to_draft') continue;
    if (!CI_INVALIDATING_PR_EVENTS.has(item.event)) continue;
    const createdAt = Date.parse(item.createdAt);
    if (!Number.isFinite(createdAt) || createdAt >= ciCreatedAt) {
      throw new Error(`PROGRAM_CI_INVALIDATED_BY_PR_TIMELINE:${item.event}`);
    }
  }
}

export function evaluateProgramChildSnapshot(snapshot) {
  let details;
  try {
    validateRepository(snapshot.repository);
    if (snapshot.repository.allowSquashMerge !== true) {
      throw new Error('PROGRAM_SQUASH_MERGE_NOT_AVAILABLE');
    }
    if (
      snapshot.issue?.state !== 'open' ||
      !isOwner(snapshot.issue?.user, 'OWNER') ||
      snapshot.issue.isPullRequest !== false
    ) {
      throw new Error('PROGRAM_ISSUE_IDENTITY_OR_STATE_INVALID');
    }
    const binding = validateProgramChildBinding(
      snapshot.program.binding ?? extractMarkedJson(snapshot.issue.body, PROGRAM_BINDING_MARKER),
      snapshot.issue.body,
    );
    const issueBodySha256 = sha256Text(snapshot.issue.body);
    if (
      snapshot.pr?.state !== 'open' || snapshot.pr.merged === true ||
      snapshot.pr.base?.ref !== POLICY.defaultBranch ||
      snapshot.pr.base?.repoId !== POLICY.repositoryId ||
      snapshot.pr.head?.repoId !== POLICY.repositoryId ||
      snapshot.pr.base?.sha !== binding.authorizedBaseSha ||
      snapshot.pr.head?.ref !== binding.authorizedHeadRef ||
      !isCommitSha(snapshot.pr.head?.sha) ||
      !isOwnerIdentity(snapshot.pr.user)
    ) {
      throw new Error('PROGRAM_PR_IDENTITY_OR_STATE_INVALID');
    }
    if (
      !Array.isArray(snapshot.relatedPullRequests) || snapshot.relatedPullRequests.length !== 1 ||
      snapshot.relatedPullRequests[0].number !== snapshot.pr.number
    ) {
      throw new Error('PROGRAM_PR_NOT_UNIQUE_FOR_BRANCH');
    }
    const link = validateProgramLink(
      snapshot.program.link ?? extractMarkedJson(snapshot.pr.body, PROGRAM_LINK_MARKER),
      binding,
      snapshot.issue,
      issueBodySha256,
      snapshot.pr,
    );
    const rootBinding = validateProgramRootBinding(
      snapshot.program.root.binding,
      snapshot.program.root.issue.body,
    );
    if (
      snapshot.program.root.issue.number !== binding.rootIssueNumber ||
      snapshot.program.root.issue.user?.id !== POLICY.owner.id ||
      snapshot.program.root.legacyApprovalValid !== true ||
      snapshot.program.root.diffValid !== true ||
      snapshot.program.root.pr?.merged !== true ||
      snapshot.program.root.mergeParentValid !== true ||
      snapshot.program.root.pr.mergeCommitSha !== binding.delegationActivationSha ||
      snapshot.program.root.pr.head.ref !== rootBinding.authorizedHeadRef ||
      snapshot.program.root.pr.base.sha !== rootBinding.authorizedBaseSha ||
      snapshot.program.root.activationCi?.status !== 'completed' ||
      snapshot.program.root.activationCi?.conclusion !== 'success' ||
      snapshot.program.root.activationCi?.headSha !== binding.delegationActivationSha
    ) {
      throw new Error('PROGRAM_DELEGATION_NOT_EXACTLY_ACTIVATED');
    }
    const now = Date.parse(snapshot.program.now);
    if (
      !Number.isFinite(now) ||
      now < Date.parse(binding.activatedAt) || now >= Date.parse(binding.expiresAt) ||
      now >= Date.parse(rootBinding.expiresAt)
    ) {
      throw new Error('PROGRAM_DELEGATION_EXPIRED_OR_NOT_YET_ACTIVE');
    }
    if (snapshot.program.mainSha !== binding.expectedBaseSha) {
      throw new Error('PROGRAM_MAIN_BASE_DRIFT');
    }
    const history = validateProgramHistory(snapshot.program, binding);
    const shapeContract = {
      allowedPaths: binding.exactAllowedPaths,
      taskClass: binding.taskClass,
    };
    const pathResult = validateChangedFiles(snapshot.changedFiles, shapeContract);
    if (pathResult.lifecycleChange) throw new Error('PROGRAM_LIFECYCLE_CHANGE_NOT_AUTHORIZED');
    validateTrigger(snapshot);
    const conclusion = validateCi(snapshot.ci, snapshot.pr, binding.activatedAt);
    if (conclusion !== 'success') throw new Error('PROGRAM_CI_NOT_SUCCESS');
    validateProgramTimeline(snapshot);
    const reviews = validateProgramReview(snapshot.prComments ?? [], binding, snapshot.pr);
    const resourceState = evaluateNamedSingleUseResource({
      bindings: history,
      currentBinding: binding,
    });
    const ready = snapshot.pr.draft === true;
    if (ready && snapshot.event.type !== 'workflow_run') {
      throw new Error('PROGRAM_READY_GATE_REQUIRES_EXACT_CI_TRIGGER');
    }
    if (!ready && snapshot.event.type !== 'issue_comment') {
      throw new Error('PROGRAM_MERGE_GATE_REQUIRES_RECONCILE_TRIGGER');
    }
    details = {
      issueNumber: snapshot.issue.number,
      issueUrl: `https://github.com/${POLICY.repositoryFullName}/issues/${snapshot.issue.number}`,
      issueBodySha256,
      authorizedBaseSha: binding.authorizedBaseSha,
      prNumber: snapshot.pr.number,
      prUrl: `https://github.com/${POLICY.repositoryFullName}/pull/${snapshot.pr.number}`,
      headSha: snapshot.pr.head.sha,
      operationPath: `https://github.com/${POLICY.repositoryFullName}/tree/${snapshot.pr.head.sha}`,
      outputPath: `https://github.com/${POLICY.repositoryFullName}/pull/${snapshot.pr.number}`,
      changedFiles: binding.exactAllowedPaths.slice().sort(),
      taskClass: binding.taskClass,
      phase: ready ? 'PROGRAM_CHILD_DRAFT_GATE' : 'PROGRAM_CHILD_MERGE_GATE',
      requestedRepairLimit: 0,
      localCorrectionRoundCount: link.localCorrectionCount,
      publishedCorrectionRoundCount: link.publishedCorrectionCount,
      processRetryCount: link.processRetryCount,
      ciRerunCount: link.ciRerunCount,
      resourceState,
      reviewSessionIds: reviews.map((review) => review.reviewerSessionId).sort(),
      ciStatus: `${snapshot.ci.status}/${snapshot.ci.conclusion}`,
      autoFixRoundCount: 0,
      controlState: 'PROGRAM_DELEGATION_ACTIVE',
      p2Status: 'PROGRAM_CHILD',
      p2SemanticEnforcement: 'FROZEN_PROGRAM_CONTRACT_AND_INDEPENDENT_REVIEW',
      autoMerge: 'ONE_SAFE_SQUASH_BY_ORCHESTRATOR_ONLY',
      unverifiedItems: [],
      humanActionRequired: 'NONE_WITHIN_DELEGATED_SCOPE',
    };
    return pass(
      ready ? 'PROGRAM_CHILD_SAFE_TO_READY' : 'PROGRAM_CHILD_SAFE_TO_SQUASH_MERGE',
      details,
    );
  } catch (error) {
    return hold([error instanceof Error ? error.message : 'UNKNOWN_PROGRAM_GATE_ERROR'], {
      ...details,
      humanActionRequired: 'STOP_PROGRAM_AND_REVIEW_HOLD',
    });
  }
}

export function evaluateControlSnapshot(snapshot) {
  if (snapshot.program) return evaluateProgramChildSnapshot(snapshot);
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
    validatePr(snapshot.pr, snapshot.relatedPullRequests, contract);
    const link = validateLink(snapshot.pr, snapshot.issue, contract, issueBodySha256);
    const approval = currentApproval(
      snapshot.issueComments ?? [],
      link.approvalCommentId,
      contract,
      issueBodySha256,
    );
    const pathResult = validateChangedFiles(snapshot.changedFiles, contract);
    if (pathResult.lifecycleChange && contract.taskClass !== 'P2_AUTH_IMPLEMENTATION') {
      throw new Error('LIFECYCLE_CHANGE_REQUIRES_HUMAN');
    }
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
      operationPath: `https://github.com/${POLICY.repositoryFullName}/tree/${snapshot.pr.head.sha}`,
      outputPath: `https://github.com/${POLICY.repositoryFullName}/pull/${snapshot.pr.number}`,
      changedFiles: [...new Set(snapshot.changedFiles.flatMap((file) =>
        file.status === 'renamed' ? [file.previousFilename, file.filename] : [file.filename],
      ))].sort(),
      taskClass: contract.taskClass,
      phase: contract.phase,
      requestedRepairLimit: contract.maxRepairRounds,
      databaseChange: pathResult.databaseChange,
      authChange: pathResult.authChange,
      ciStatus: snapshot.ci ? `${snapshot.ci.status}/${snapshot.ci.conclusion}` : 'NOT_FOUND',
      autoFixRoundCount: 0,
    };
    const conclusion = validateCi(snapshot.ci, snapshot.pr, approval.createdAt);
    validatePrTimeline(snapshot.prTimeline, snapshot.ci);
    if (conclusion === 'success') {
      const p2DraftOnly = isP2TaskClass(contract.taskClass);
      return pass(
        p2DraftOnly
          ? (
              contract.taskClass === 'P2_AUTH_IMPLEMENTATION'
                ? 'P2_AUTH_DRAFT_ONLY_CI_ACCEPTED_OBSERVER_ONLY'
                : 'P2_DRAFT_ONLY_CI_ACCEPTED_OBSERVER_ONLY'
            )
          : 'CI_ACCEPTED_OBSERVER_ONLY',
        {
        ...details,
        ...(p2DraftOnly ? { p2Status: 'DRAFT_ONLY' } : {}),
        unverifiedItems: [
          'BRANCH_PROTECTION',
          'OWNER_REVIEW_NO_BYPASS',
          ...(
            contract.taskClass === 'CONTROL_PLANE_CHANGE'
              ? ['PROPOSED_CONTROL_REVISION_POST_MERGE_ACTIVATION']
              : []
          ),
          ...(p2DraftOnly ? [] : ['APPROVAL_PR_AND_HEAD_REF_BINDING']),
          ...(p2DraftOnly ? ['BOUNDED_CORRECTION_COUNTS'] : []),
          ...(
            p2DraftOnly && pathResult.databaseChange === 'SINGLE_MIGRATION_METADATA_SHAPE_ONLY'
              ? ['P2_DATABASE_MIGRATION_SEMANTICS']
              : []
          ),
          'VISIBLE_ISSUE_FIELDS_MATCH_CONTRACT',
          'P2_SEMANTIC_SCOPE_REVIEW',
          'EXACT_TEST_COMMAND_EXIT_CODES',
        ],
        humanActionRequired: p2DraftOnly
          ? 'KEEP_DRAFT;HUMAN_SEMANTIC_REVIEW;DO_NOT_MERGE_BY_AUTOMATION'
          : 'HUMAN_REVIEW;DO_NOT_MERGE_BY_AUTOMATION',
        },
      );
    }
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
      !Number.isInteger(event.workflow_run?.id) ||
      event.workflow_run.id < 1 ||
      event.workflow_run?.workflow_id !== POLICY.qualityWorkflowId ||
      event.workflow_run?.path !== POLICY.qualityWorkflowPath ||
      event.workflow_run?.event !== 'pull_request' ||
      !isCommitSha(event.workflow_run?.head_sha) ||
      typeof event.workflow_run?.head_branch !== 'string' ||
      event.workflow_run.head_branch.length === 0 ||
      !Number.isInteger(event.workflow_run?.run_attempt) ||
      event.workflow_run.run_attempt < 1
    ) {
      throw new Error('TRIGGER_WORKFLOW_SOURCE_INVALID');
    }
    const candidates = await api.list(
      `${repositoryPath}/pulls?state=open&head=${encodeURIComponent(`${POLICY.owner.login}:${event.workflow_run.head_branch}`)}`,
    );
    if (candidates.length !== 1) throw new Error(`TRIGGER_PR_COUNT_${candidates.length}`);
    const candidate = candidates[0];
    if (
      !Number.isInteger(candidate.number) ||
      candidate.number < 1 ||
      candidate.head?.sha !== event.workflow_run.head_sha ||
      candidate.head?.ref !== event.workflow_run.head_branch ||
      candidate.head?.repo?.id !== POLICY.repositoryId ||
      candidate.base?.repo?.id !== POLICY.repositoryId ||
      candidate.base?.ref !== POLICY.defaultBranch ||
      !isCommitSha(candidate.base?.sha)
    ) {
      throw new Error('TRIGGER_PR_IDENTITY_MISMATCH');
    }
    const expectedRunName = expectedCiRunName(candidate);
    if (
      event.workflow_run.name !== expectedRunName ||
      event.workflow_run.display_title !== expectedRunName
    ) {
      throw new Error('TRIGGER_RUN_NAME_BINDING_INVALID');
    }
    return candidate.number;
  }
  if (eventName === 'issue_comment') {
    if (!event.issue?.pull_request) throw new Error('COMMENT_NOT_ON_PR');
    return event.issue.number;
  }
  throw new Error(`EVENT_UNSUPPORTED:${eventName}`);
}

export function normalizeEvent(eventName, event) {
  if (eventName === 'workflow_run') {
    return {
      type: eventName,
      triggerId: String(event.workflow_run.id),
      workflowId: event.workflow_run.workflow_id,
      workflowPath: event.workflow_run.path,
      workflowEvent: event.workflow_run.event,
      runName: event.workflow_run.name,
      displayTitle: event.workflow_run.display_title,
      headSha: event.workflow_run.head_sha,
      headBranch: event.workflow_run.head_branch,
      runAttempt: event.workflow_run.run_attempt,
      actor: normalizeUser(event.sender),
      authorAssociation: null,
    };
  }
  if (eventName === 'issue_comment') {
    return {
      type: eventName,
      triggerId: String(event.comment.id),
      workflowId: null,
      workflowPath: null,
      workflowEvent: null,
      runName: null,
      displayTitle: null,
      headSha: null,
      headBranch: null,
      runAttempt: null,
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
  const [{ data }, { data: workflow }] = await Promise.all([
    api.request(
      `${repositoryPath}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`,
    ),
    api.request(`${repositoryPath}/actions/workflows/${POLICY.qualityWorkflowId}`),
  ]);
  if (
    workflow?.id !== POLICY.qualityWorkflowId ||
    workflow?.name !== POLICY.qualityWorkflowName ||
    workflow?.path !== POLICY.qualityWorkflowPath ||
    workflow?.state !== 'active'
  ) {
    throw new Error('CI_WORKFLOW_DEFINITION_INVALID');
  }
  if (!Array.isArray(data.workflow_runs) || !Number.isInteger(data.total_count)) {
    throw new Error('CI_RUNS_RESPONSE_SHAPE_INVALID');
  }
  if (data.total_count !== data.workflow_runs.length) {
    throw new Error('CI_RUNS_PAGINATION_OR_COUNT_MISMATCH');
  }
  const eligible = data.workflow_runs.filter((run) =>
    run.workflow_id === POLICY.qualityWorkflowId &&
    run.path === POLICY.qualityWorkflowPath &&
    run.event === 'pull_request' &&
    run.head_sha === pr.head.sha &&
    run.head_branch === pr.head.ref &&
    run.repository?.id === POLICY.repositoryId &&
    run.head_repository?.id === POLICY.repositoryId &&
    Date.parse(run.created_at) >= Date.parse(pr.createdAt),
  );
  if (eligible.length === 0) return null;
  const expectedRunName = expectedCiRunName(pr);
  if (eligible.some((run) =>
    run.name !== expectedRunName || run.display_title !== expectedRunName
  )) {
    throw new Error('CI_RUN_NAME_BINDING_INVALID');
  }
  eligible.sort((a, b) => b.id - a.id);
  const run = eligible[0];
  if (
    !Number.isInteger(run.check_suite_id) ||
    !Number.isInteger(run.run_attempt) || run.run_attempt < 1
  ) {
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
    workflowName: workflow.name,
    workflowPath: workflow.path,
    workflowState: workflow.state,
    runName: run.name,
    runPath: run.path,
    displayTitle: run.display_title,
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

async function exactMainPushCi(api, repositoryPath, headSha) {
  const [{ data }, { data: workflow }] = await Promise.all([
    api.request(
      `${repositoryPath}/actions/workflows/ci.yml/runs?event=push&branch=${POLICY.defaultBranch}` +
      `&head_sha=${headSha}&per_page=100`,
    ),
    api.request(`${repositoryPath}/actions/workflows/${POLICY.qualityWorkflowId}`),
  ]);
  if (
    workflow?.id !== POLICY.qualityWorkflowId || workflow?.name !== POLICY.qualityWorkflowName ||
    workflow?.path !== POLICY.qualityWorkflowPath || workflow?.state !== 'active'
  ) {
    throw new Error('PROGRAM_ACTIVATION_CI_WORKFLOW_INVALID');
  }
  if (
    !Array.isArray(data.workflow_runs) || !Number.isInteger(data.total_count) ||
    data.total_count !== data.workflow_runs.length
  ) {
    throw new Error('PROGRAM_ACTIVATION_CI_RUNS_AMBIGUOUS');
  }
  const expectedName = `${POLICY.qualityWorkflowName} push PR-none base-${headSha} head-${headSha}`;
  const eligible = data.workflow_runs.filter((run) =>
    run.workflow_id === POLICY.qualityWorkflowId && run.path === POLICY.qualityWorkflowPath &&
    run.event === 'push' && run.head_sha === headSha && run.head_branch === POLICY.defaultBranch &&
    run.repository?.id === POLICY.repositoryId && run.head_repository?.id === POLICY.repositoryId &&
    run.name === expectedName && run.display_title === expectedName
  );
  if (eligible.length !== 1) throw new Error(`PROGRAM_ACTIVATION_CI_COUNT_${eligible.length}`);
  const run = eligible[0];
  if (
    run.status !== 'completed' || run.conclusion !== 'success' ||
    !Number.isInteger(run.check_suite_id) || !Number.isInteger(run.run_attempt) || run.run_attempt < 1
  ) {
    throw new Error('PROGRAM_ACTIVATION_CI_NOT_SUCCESS');
  }
  const [{ data: jobs }, { data: suite }] = await Promise.all([
    api.request(`${repositoryPath}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`),
    api.request(`${repositoryPath}/check-suites/${run.check_suite_id}`),
  ]);
  if (
    jobs.total_count !== 1 || !Array.isArray(jobs.jobs) || jobs.jobs.length !== 1 ||
    jobs.jobs[0].name !== POLICY.qualityJobName || jobs.jobs[0].status !== 'completed' ||
    jobs.jobs[0].conclusion !== 'success' || jobs.jobs[0].head_sha !== headSha ||
    jobs.jobs[0].run_id !== run.id || jobs.jobs[0].run_attempt !== run.run_attempt ||
    suite.id !== run.check_suite_id || suite.repository?.id !== POLICY.repositoryId ||
    suite.app?.id !== POLICY.actionsApp.id || suite.app?.slug !== POLICY.actionsApp.slug ||
    suite.head_sha !== headSha || suite.after !== headSha ||
    suite.status !== 'completed' || suite.conclusion !== 'success'
  ) {
    throw new Error('PROGRAM_ACTIVATION_CI_EVIDENCE_INVALID');
  }
  return { status: run.status, conclusion: run.conclusion, headSha, id: run.id };
}

function normalizeHistoricalPull(pr) {
  return {
    number: pr.number,
    state: pr.state,
    draft: pr.draft,
    merged: pr.merged === true || Boolean(pr.merged_at),
    mergeCommitSha: pr.merge_commit_sha ?? null,
    body: pr.body ?? '',
    changedFilesCount: pr.changed_files,
    user: normalizeUser(pr.user),
    base: { ref: pr.base?.ref, sha: pr.base?.sha, repoId: pr.base?.repo?.id },
    head: { ref: pr.head?.ref, sha: pr.head?.sha, repoId: pr.head?.repo?.id },
  };
}

async function mergeParentIsExact(api, repositoryPath, pr) {
  if (!pr.merged || !isCommitSha(pr.mergeCommitSha)) return false;
  const { data: commit } = await api.request(`${repositoryPath}/git/commits/${pr.mergeCommitSha}`);
  return (
    commit.sha === pr.mergeCommitSha && Array.isArray(commit.parents) && commit.parents.length === 1 &&
    commit.parents[0].sha === pr.base.sha
  );
}

async function validateProgramRootPull(api, repositoryPath, rootPr, rootBinding) {
  if (
    rootPr.state !== 'closed' || rootPr.merged !== true || !isOwnerIdentity(rootPr.user) ||
    rootPr.base.ref !== POLICY.defaultBranch || rootPr.base.repoId !== POLICY.repositoryId ||
    rootPr.head.repoId !== POLICY.repositoryId || rootPr.base.sha !== rootBinding.authorizedBaseSha ||
    rootPr.head.ref !== rootBinding.authorizedHeadRef || !isCommitSha(rootPr.head.sha) ||
    !Number.isInteger(rootPr.changedFilesCount)
  ) {
    throw new Error('PROGRAM_ROOT_PR_IDENTITY_INVALID');
  }
  const [files, { data: baseCommit }, { data: headCommit }] = await Promise.all([
    api.list(`${repositoryPath}/pulls/${rootPr.number}/files`),
    api.request(`${repositoryPath}/git/commits/${rootPr.base.sha}`),
    api.request(`${repositoryPath}/git/commits/${rootPr.head.sha}`),
  ]);
  const [{ data: baseTree }, { data: headTree }] = await Promise.all([
    api.request(`${repositoryPath}/git/trees/${baseCommit.tree.sha}?recursive=1`),
    api.request(`${repositoryPath}/git/trees/${headCommit.tree.sha}?recursive=1`),
  ]);
  const changedFiles = normalizeChangedFiles(
    files,
    treeMap(baseCommit, baseTree, rootPr.base.sha, 'PROGRAM_ROOT_BASE'),
    treeMap(headCommit, headTree, rootPr.head.sha, 'PROGRAM_ROOT_HEAD'),
    rootPr.changedFilesCount,
  );
  const result = validateChangedFiles(changedFiles, {
    allowedPaths: rootBinding.exactAllowedPaths,
    taskClass: 'CONTROL_PLANE_CHANGE',
  });
  if (result.lifecycleChange) throw new Error('PROGRAM_ROOT_LIFECYCLE_CHANGE_INVALID');
  return true;
}

async function loadProgramContext(api, repositoryPath, currentIssue, normalizedPr, programLink, observedAt) {
  const binding = validateProgramChildBinding(
    extractMarkedJson(currentIssue.body ?? '', PROGRAM_BINDING_MARKER),
    currentIssue.body ?? '',
  );
  if (programLink.issueNumber !== currentIssue.number) throw new Error('PROGRAM_LINKED_ISSUE_MISMATCH');
  const [{ data: rootIssue }, rootCommentsRaw, allIssues, { data: mainCommit }] = await Promise.all([
    api.request(`${repositoryPath}/issues/${binding.rootIssueNumber}`),
    api.list(`${repositoryPath}/issues/${binding.rootIssueNumber}/comments`),
    api.list(`${repositoryPath}/issues?state=all`),
    api.request(`${repositoryPath}/commits/${POLICY.defaultBranch}`),
  ]);
  const rootBinding = validateProgramRootBinding(
    extractMarkedJson(rootIssue.body ?? '', PROGRAM_BINDING_MARKER),
    rootIssue.body ?? '',
  );
  const rootPullsRaw = await api.list(
    `${repositoryPath}/pulls?state=all&head=${encodeURIComponent(`${POLICY.owner.login}:${rootBinding.authorizedHeadRef}`)}`,
  );
  if (rootPullsRaw.length !== 1) throw new Error(`PROGRAM_ROOT_PR_COUNT_${rootPullsRaw.length}`);
  const { data: rootPullDetail } = await api.request(
    `${repositoryPath}/pulls/${rootPullsRaw[0].number}`,
  );
  const rootPr = normalizeHistoricalPull(rootPullDetail);
  const rootIssueNormalized = {
    number: rootIssue.number,
    body: rootIssue.body ?? '',
  };
  const rootContract = validateContract(
    extractMarkedJson(rootIssue.body ?? '', CONTRACT_MARKER),
  );
  const rootIssueBodySha256 = sha256Text(rootIssue.body ?? '');
  const rootLegacyLink = validateLink(rootPr, rootIssueNormalized, rootContract, rootIssueBodySha256);
  currentApproval(
    rootCommentsRaw.map(normalizeComment).sort((a, b) => a.id - b.id),
    rootLegacyLink.approvalCommentId,
    rootContract,
    rootIssueBodySha256,
  );
  const [rootMergeParentValid, activationCi, rootDiffValid] = await Promise.all([
    mergeParentIsExact(api, repositoryPath, rootPr),
    exactMainPushCi(api, repositoryPath, rootPr.mergeCommitSha),
    validateProgramRootPull(api, repositoryPath, rootPr, rootBinding),
  ]);
  const bindingIssues = [];
  for (const issue of allIssues) {
    if (!mentionsMarker(issue.body ?? '', PROGRAM_BINDING_MARKER)) continue;
    if (!isOwnerIdentity(issue.user) || issue.pull_request) continue;
    const candidate = extractMarkedJson(issue.body ?? '', PROGRAM_BINDING_MARKER);
    if (candidate.programId !== PROGRAM_ID) continue;
    const validated = candidate.childOrdinal === 1
      ? validateProgramRootBinding(candidate, issue.body ?? '')
      : validateProgramChildBinding(candidate, issue.body ?? '');
    bindingIssues.push({ issue, binding: validated });
  }
  const history = [];
  for (const entry of bindingIssues) {
    if (entry.binding.childOrdinal === 1) {
      history.push({ binding: entry.binding, issueNumber: entry.issue.number, pr: rootPr, mergeParentValid: rootMergeParentValid });
      continue;
    }
    if (entry.issue.number === currentIssue.number) {
      history.push({
        binding: entry.binding,
        issueNumber: entry.issue.number,
        pr: { ...normalizedPr, mergeCommitSha: null },
        mergeParentValid: false,
      });
      continue;
    }
    const pulls = await api.list(
      `${repositoryPath}/pulls?state=all&head=${encodeURIComponent(`${POLICY.owner.login}:${entry.binding.authorizedHeadRef}`)}`,
    );
    if (pulls.length !== 1) throw new Error(`PROGRAM_HISTORY_PR_COUNT_${pulls.length}`);
    const historicalPr = normalizeHistoricalPull(pulls[0]);
    history.push({
      binding: entry.binding,
      issueNumber: entry.issue.number,
      pr: historicalPr,
      mergeParentValid: await mergeParentIsExact(api, repositoryPath, historicalPr),
    });
  }
  return {
    binding,
    link: programLink,
    now: observedAt,
    mainSha: mainCommit.sha,
    root: {
      issue: {
        number: rootIssue.number,
        state: rootIssue.state,
        body: rootIssue.body ?? '',
        user: normalizeUser(rootIssue.user),
      },
      binding: rootBinding,
      pr: rootPr,
      mergeParentValid: rootMergeParentValid,
      legacyApprovalValid: true,
      diffValid: rootDiffValid,
      activationCi,
    },
    bindings: history,
  };
}

async function loadSnapshotOnce(api, repositoryPath, prNumber, eventName, event, observedAt) {
  const [{ data: repo }, { data: pr }, allowAutoMerge] = await Promise.all([
    api.request(repositoryPath),
    api.request(`${repositoryPath}/pulls/${prNumber}`),
    repositoryAutoMerge(api),
  ]);
  const programLink = extractOptionalMarkedJson(pr.body ?? '', PROGRAM_LINK_MARKER);
  const link = programLink ?? extractMarkedJson(pr.body ?? '', LINK_MARKER);
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
    user: normalizeUser(pr.user),
    mergeCommitSha: pr.merge_commit_sha ?? null,
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
    api.list(`${repositoryPath}/pulls?state=all&head=${encodeURIComponent(`${POLICY.owner.login}:${normalizedPr.head.ref}`)}`),
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
      allowSquashMerge: repo.allow_squash_merge,
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
      .map((item) => ({ event: item.event, createdAt: item.created_at, actor: normalizeUser(item.actor) }))
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
    program: programLink
      ? await loadProgramContext(api, repositoryPath, issue, normalizedPr, programLink, observedAt)
      : null,
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
  const observedAt = new Date().toISOString();
  const first = await loadSnapshotOnce(api, repositoryPath, prNumber, eventName, event, observedAt);
  const closing = await loadSnapshotOnce(api, repositoryPath, prNumber, eventName, event, observedAt);
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
    user: normalizeUser(finalPr.user),
    mergeCommitSha: finalPr.merge_commit_sha ?? null,
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
    REQUESTED_AUTOMATED_REPAIR_LIMIT: result.requestedRepairLimit ?? 0,
    HUMAN_CORRECTION_ROUND_COUNT: 'UNVERIFIED_FROM_READ_ONLY_GITHUB_METADATA',
    LOCAL_CORRECTION_ROUND_COUNT:
      result.localCorrectionRoundCount ?? 'UNVERIFIED_FROM_READ_ONLY_GITHUB_METADATA',
    PUBLISHED_CORRECTION_ROUND_COUNT:
      result.publishedCorrectionRoundCount ?? 'UNVERIFIED_FROM_READ_ONLY_GITHUB_METADATA',
    FAILURE_CLASS: result.result === 'PASS' ? 'NONE' : 'UNVERIFIED_FROM_READ_ONLY_GITHUB_METADATA',
    AUTO_FIX_ROUND_COUNT: result.autoFixRoundCount ?? 0,
    AUTO_FIX_WRITE: result.autoFixWrite,
    AUTO_MERGE: result.autoMerge,
    P2_STATUS: result.p2Status,
    OPERATION_PATH: result.operationPath ?? 'UNKNOWN',
    OUTPUT_PATH: result.outputPath ?? 'UNKNOWN',
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
