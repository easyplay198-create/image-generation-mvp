import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReleaseDecisionPanel } from "@/app/projects/[projectId]/_components/v4/release-decision-panel";
import {
  QA_CANDIDATES,
  getReleaseState,
} from "@/app/projects/[projectId]/_lib/v4/view-models";
import {
  REVIEW_ACTIONS,
  deriveReleaseGuard,
} from "@/src/vision/contracts/release-guard";

const forbiddenProductionLabel = "批准" + "导出 800×800";

describe("V4 QA release guard", () => {
  it("keeps QA PASS pending when platform rules are not loaded", () => {
    const state = deriveReleaseGuard({
      demo_only: false,
      qa_overall_status: "PASS",
      platform_rule_status: "NOT_LOADED",
    });

    expect(state.release_eligibility).toBe("PENDING_RULE_VERIFICATION");
    expect(state.production_export_enabled).toBe(false);
  });

  it("only exposes non-production review actions", () => {
    expect(REVIEW_ACTIONS).toEqual([
      "VIEW_CANDIDATES",
      "RUN_QA_CHECKS",
      "OPEN_BENCHMARK",
    ]);
    for (const candidate of QA_CANDIDATES) {
      expect(Object.keys(candidate)).not.toContain("action");
      expect(Object.keys(candidate)).not.toContain("handler");
      expect(getReleaseState(candidate).production_export_enabled).toBe(false);
    }
  });

  it("renders release status without a production action element", () => {
    const html = renderToStaticMarkup(
      createElement(ReleaseDecisionPanel, {
        state: getReleaseState(QA_CANDIDATES[0]),
        classes: {
          chain: "chain",
          head: "head",
          step: "step",
          stepIndex: "step-index",
          notice: "notice",
        },
      }),
    );

    expect(html).toContain(
      'data-release-eligibility="PENDING_RULE_VERIFICATION"',
    );
    expect(html).toContain('data-production-export-enabled="false"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain(forbiddenProductionLabel);
    expect(html).not.toMatch(/on(?:click|Click)=/);
  });

  it("keeps the removed label and legacy handler assignments out of production sources", () => {
    const productionFiles = [
      "../../app/projects/[projectId]/_components/v4/release-decision-panel.tsx",
      "../../app/projects/[projectId]/_components/v4/vision-workspace.tsx",
      "../../app/projects/[projectId]/_lib/v4/view-models.ts",
      "../../src/vision/contracts/release-guard.ts",
    ];

    for (const relativePath of productionFiles) {
      const source = readFileSync(
        fileURLToPath(new URL(relativePath, import.meta.url)),
        "utf8",
      );
      expect(source).not.toContain(forbiddenProductionLabel);
      expect(source).not.toContain("data-release-action");
      expect(source).not.toContain("action.onclick");
    }
  });
});
