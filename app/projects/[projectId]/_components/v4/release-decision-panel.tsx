import type { ReleaseGuardState } from "@/src/vision/contracts/release-guard";

export type ReleasePanelClasses = {
  chain: string;
  head: string;
  step: string;
  stepIndex: string;
  notice: string;
};

export function ReleaseDecisionPanel({
  state,
  classes,
}: {
  state: ReleaseGuardState;
  classes: ReleasePanelClasses;
}) {
  return (
    <section
      className={classes.chain}
      aria-labelledby="release-chain-title"
      data-release-eligibility={state.release_eligibility}
      data-production-export-enabled={String(
        state.production_export_enabled,
      )}
    >
      <div className={classes.head}>
        <strong id="release-chain-title">发布资格决策链</strong>
        <span>候选图 → QA → 平台规则 → 发布资格</span>
      </div>
      <ReleaseStep
        classes={classes}
        index="01"
        label="QA 总体状态"
        value={`${state.qa_overall_status} · 演示状态`}
      />
      <ReleaseStep
        classes={classes}
        index="02"
        label="平台规则状态"
        value={`${state.platform_rule_status} · 待平台规则核验`}
      />
      <ReleaseStep
        classes={classes}
        index="03"
        label="发布资格"
        value={`${state.release_eligibility} · 待平台规则核验`}
      />
      <ReleaseStep
        classes={classes}
        index="04"
        label="当前允许"
        value="查看候选图、QA 检查、Benchmark"
      />
      <ReleaseStep
        classes={classes}
        index="05"
        label="生产导出"
        value="false · 禁止生产导出"
      />
      <div className={classes.notice} role="status">
        <strong>等待平台规则核验</strong>
        <span>内部验证模式 · DEMO_ONLY · 禁止生产导出</span>
      </div>
    </section>
  );
}

function ReleaseStep({
  classes,
  index,
  label,
  value,
}: {
  classes: ReleasePanelClasses;
  index: string;
  label: string;
  value: string;
}) {
  return (
    <div className={classes.step}>
      <span className={classes.stepIndex}>{index}</span>
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
    </div>
  );
}
