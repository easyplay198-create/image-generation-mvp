export const QA_OVERALL_STATUSES = [
  "PASS",
  "REPAIRABLE_FAIL",
  "HARD_FAIL",
] as const;

export const PLATFORM_RULE_STATUSES = [
  "NOT_LOADED",
  "PENDING",
  "VERIFIED",
  "FAILED",
] as const;

export const RELEASE_ELIGIBILITIES = [
  "PENDING_RULE_VERIFICATION",
  "DEMO_ONLY",
  "QA_REPAIR_REQUIRED",
  "QA_REJECTED",
  "PENDING_PRODUCTION_APPROVAL",
] as const;

export const REVIEW_ACTIONS = [
  "VIEW_CANDIDATES",
  "RUN_QA_CHECKS",
  "OPEN_BENCHMARK",
] as const;

export type QaOverallStatus = (typeof QA_OVERALL_STATUSES)[number];
export type PlatformRuleStatus = (typeof PLATFORM_RULE_STATUSES)[number];
export type ReleaseEligibility = (typeof RELEASE_ELIGIBILITIES)[number];
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export type ReleaseGuardInput = {
  demo_only: boolean;
  qa_overall_status: QaOverallStatus;
  platform_rule_status: PlatformRuleStatus;
};

/**
 * UI-only release state. This contract intentionally has no production action
 * and can never authorize a file export or approval record.
 */
export type ReleaseGuardState = ReleaseGuardInput & {
  release_eligibility: ReleaseEligibility;
  production_export_enabled: false;
  allowed_actions: readonly ReviewAction[];
};

export function deriveReleaseGuard(
  input: ReleaseGuardInput,
): ReleaseGuardState {
  let releaseEligibility: ReleaseEligibility;

  if (input.platform_rule_status !== "VERIFIED") {
    releaseEligibility = "PENDING_RULE_VERIFICATION";
  } else if (input.demo_only) {
    releaseEligibility = "DEMO_ONLY";
  } else if (input.qa_overall_status === "HARD_FAIL") {
    releaseEligibility = "QA_REJECTED";
  } else if (input.qa_overall_status === "REPAIRABLE_FAIL") {
    releaseEligibility = "QA_REPAIR_REQUIRED";
  } else {
    releaseEligibility = "PENDING_PRODUCTION_APPROVAL";
  }

  return Object.freeze({
    ...input,
    release_eligibility: releaseEligibility,
    production_export_enabled: false,
    allowed_actions: REVIEW_ACTIONS,
  });
}
