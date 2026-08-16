import type {
  QaOverallStatus,
  ReleaseGuardState,
} from "@/src/vision/contracts/release-guard";
import { deriveReleaseGuard } from "@/src/vision/contracts/release-guard";

export type VisionPage =
  | "dashboard"
  | "evidence"
  | "strategy"
  | "generation"
  | "qa";

export type ProofRegion =
  | "identity"
  | "claim"
  | "accessory"
  | "hierarchy"
  | "screen";

export type ProofNode = {
  id: string;
  index: string;
  label: string;
  summary: string;
  region: ProofRegion;
  title: string;
  reason: string;
  source: string;
  impact: string;
  check: string;
  tech: string;
};

export type QaCandidate = {
  id: "candidate-a" | "candidate-b" | "candidate-c";
  label: string;
  qa_overall_status: QaOverallStatus;
  region: ProofRegion;
  reason: string;
  source: string;
};

export const QA_CANDIDATES: readonly QaCandidate[] = Object.freeze([
  {
    id: "candidate-a",
    label: "候选 A · QA 通过",
    qa_overall_status: "PASS",
    region: "identity",
    reason: "QA 模拟 PASS 不代表发布资格；平台规则尚未核验。",
    source: "演示状态 + 待核验的平台规则",
  },
  {
    id: "candidate-b",
    label: "候选 B · QA 需修复",
    qa_overall_status: "REPAIRABLE_FAIL",
    region: "screen",
    reason: "候选仍需修复；平台规则也尚未核验。",
    source: "演示状态 + 待核验的平台规则",
  },
  {
    id: "candidate-c",
    label: "候选 C · QA 硬失败",
    qa_overall_status: "HARD_FAIL",
    region: "accessory",
    reason: "候选存在 QA 硬失败；平台规则也尚未核验。",
    source: "演示状态 + 待核验的平台规则",
  },
]);

export function getReleaseState(candidate: QaCandidate): ReleaseGuardState {
  return deriveReleaseGuard({
    demo_only: true,
    qa_overall_status: candidate.qa_overall_status,
    platform_rule_status: "NOT_LOADED",
  });
}

export const PAGE_ROUTES: Record<VisionPage, string> = {
  dashboard: "dashboard",
  evidence: "evidence",
  strategy: "strategy",
  generation: "generation",
  qa: "qa",
};
