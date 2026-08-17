"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  getCandidateImages,
  getProductAsset,
  loadVisionWorkspaceData,
  type VisionWorkspaceData,
} from "../../_lib/v4/api-client";
import {
  PAGE_CONFIGS,
  QA_PROOF_NODES,
  type PageConfig,
} from "../../_lib/v4/page-configs";
import {
  PAGE_ROUTES,
  QA_CANDIDATES,
  getReleaseState,
  type ProofNode,
  type VisionPage,
} from "../../_lib/v4/view-models";
import {
  AssetCanvas,
  AuditSpine,
  ProofDetails,
  ProofNodePanel,
} from "./proofline";
import { ReleaseDecisionPanel } from "./release-decision-panel";
import styles from "./v4-ui.module.css";

const NAV_ITEMS: Array<{ page: VisionPage; label: string }> = [
  { page: "dashboard", label: "决策总览" },
  { page: "evidence", label: "证据档案" },
  { page: "strategy", label: "视觉策略" },
  { page: "generation", label: "生成工作台" },
  { page: "qa", label: "QA 评审" },
];

export default function VisionWorkspace({
  projectId,
  page,
}: {
  projectId: string;
  page: VisionPage;
}) {
  const config = getPageConfig(page);
  const [data, setData] = useState<VisionWorkspaceData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState(
    config.initialNodeId,
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState(
    QA_CANDIDATES[0].id,
  );
  const [auditOpen, setAuditOpen] = useState(page === "dashboard");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void loadVisionWorkspaceData(projectId, controller.signal).then((next) => {
      if (!controller.signal.aborted) setData(next);
    });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    if (!sheetOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sheetOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2_500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const nodes = config.nodes;
  const selectedNode =
    nodes.find((node) => node.id === selectedNodeId) ?? nodes[0]!;
  const selectedCandidate =
    QA_CANDIDATES.find((item) => item.id === selectedCandidateId) ??
    QA_CANDIDATES[0];
  const releaseState = getReleaseState(selectedCandidate);
  const auditNode =
    page === "qa"
      ? {
          ...selectedNode,
          reason: selectedCandidate.reason,
          source: selectedCandidate.source,
        }
      : selectedNode;

  function selectNode(node: ProofNode) {
    setSelectedNodeId(node.id);
    setAuditOpen(true);
  }

  function selectCandidate(candidateId: (typeof QA_CANDIDATES)[number]["id"]) {
    const candidate = QA_CANDIDATES.find((item) => item.id === candidateId);
    if (!candidate) return;
    setSelectedCandidateId(candidate.id);
    const relatedNode = QA_PROOF_NODES.find(
      (node) => node.region === candidate.region,
    );
    if (relatedNode) setSelectedNodeId(relatedNode.id);
    setAuditOpen(candidate.qa_overall_status !== "PASS");
  }

  if (!data) {
    return (
      <div className={styles.v4Root}>
        <div className={styles.loadingState} role="status">
          <span className={styles.eyebrow}>AI VISION V4 / LOADING</span>
          <strong>正在读取项目事实与视觉资产…</strong>
          <span>若正式数据源不可用，将明确进入 DEMO_ONLY 参考态。</span>
        </div>
      </div>
    );
  }

  const productAsset = getProductAsset(data);
  const candidateImages = getCandidateImages(data);
  const imageUrl =
    page === "qa"
      ? candidateImages[QA_CANDIDATES.indexOf(selectedCandidate)]!
      : productAsset.previewUrl;
  const stage = page === "qa" ? 3 : config.stage;
  const next = page === "qa" ? "等待平台规则核验" : config.next;

  return (
    <div className={styles.v4Root} data-page={page}>
      <header className={styles.globalHeader}>
        <Link
          className={styles.brandLockup}
          href={`/projects/${projectId}/dashboard`}
          aria-label="返回决策总览"
        >
          <span className={styles.traceMark} aria-hidden="true">
            <span />
            <i />
          </span>
          <span className={styles.brandName}>AI电商视觉系统</span>
          <span className={styles.conceptTag}>P0 REACT</span>
        </Link>
        <nav className={styles.globalNav} aria-label="P0 核心页面">
          {NAV_ITEMS.map((item) => (
            <Link
              href={`/projects/${projectId}/${PAGE_ROUTES[item.page]}`}
              aria-current={item.page === page ? "page" : undefined}
              key={item.page}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <button
            className={styles.headerIconButton}
            type="button"
            aria-label="查看数据接入状态"
            onClick={() =>
              setToast(`数据接入：${data.dataSourceStatus} · 发布合同仍受阻`)
            }
          >
            ◦
          </button>
          <Link
            className={styles.headerIconButton}
            href={`/projects/${projectId}`}
            aria-label="返回原商品工作台"
          >
            MU
          </Link>
        </div>
      </header>

      <Runbar
        productName={data.project.productName}
        stage={stage}
        next={next}
      />

      <main
        className={`${styles.workspace} ${auditOpen ? styles.auditOpen : ""}`}
      >
        <section className={styles.decisionCanvas}>
          {page !== "qa" && (
            <PageHeading
              config={config}
              dataStatus={data.dataSourceStatus}
              projectId={projectId}
            />
          )}
          {page === "dashboard" && (
            <DashboardPage
              config={config}
              imageUrl={imageUrl}
              selectedNode={selectedNode}
              onSelect={selectNode}
              projectId={projectId}
            />
          )}
          {page === "evidence" && (
            <EvidencePage
              data={data}
              config={config}
              imageUrl={imageUrl}
              selectedNode={selectedNode}
              onSelect={selectNode}
              projectId={projectId}
            />
          )}
          {page === "strategy" && (
            <StrategyPage
              data={data}
              config={config}
              imageUrl={imageUrl}
              selectedNode={selectedNode}
              onSelect={selectNode}
              projectId={projectId}
              onOpenSheet={() => setSheetOpen(true)}
            />
          )}
          {page === "generation" && (
            <GenerationPage
              data={data}
              config={config}
              imageUrl={imageUrl}
              selectedNode={selectedNode}
              onSelect={selectNode}
              projectId={projectId}
            />
          )}
          {page === "qa" && (
            <QaPage
              imageUrl={imageUrl}
              selectedNode={selectedNode}
              onSelect={selectNode}
              selectedCandidateId={selectedCandidate.id}
              onSelectCandidate={selectCandidate}
              releaseState={releaseState}
            />
          )}
        </section>

        <AuditSpine
          node={auditNode}
          open={auditOpen}
          onToggle={() => setAuditOpen((current) => !current)}
          onOpenSheet={() => setSheetOpen(true)}
          exceptional={page === "dashboard" || page === "qa"}
        />
      </main>

      <AdvancedSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        node={auditNode}
        data={data}
        releaseState={page === "qa" ? releaseState : null}
      />
      <div
        className={`${styles.toast} ${toast ? styles.toastVisible : ""}`}
        role="status"
        aria-live="polite"
      >
        {toast}
      </div>
    </div>
  );
}

function Runbar({
  productName,
  stage,
  next,
}: {
  productName: string;
  stage: number;
  next: string;
}) {
  const steps = [
    ["确认商品事实", "SOURCE"],
    ["明确视觉重点", "DECISION"],
    ["准备候选图", "PACKAGE"],
    ["检查与放行", "REVIEW"],
  ] as const;

  return (
    <section className={styles.runbar} aria-label="当前工作上下文">
      <div className={styles.runContext}>
        <span className={styles.monoLabel}>SKU / OUTPUT</span>
        <strong>{productName} · Ozon 主图 · 800×800</strong>
      </div>
      <div className={styles.evidenceTrace}>
        {steps.map(([label, code], index) => (
          <div
            className={`${styles.traceStep} ${index < stage ? styles.done : ""} ${index === stage ? styles.active : ""}`}
            key={label}
          >
            <strong>{label}</strong>
            <span>
              {code} / {index < stage ? "READY" : index === stage ? "ACTIVE" : "WAIT"}
            </span>
          </div>
        ))}
      </div>
      <div className={styles.runNext}>
        <span className={styles.monoLabel}>唯一下一步</span>
        <strong>{next}</strong>
      </div>
    </section>
  );
}

function PageHeading({
  config,
  dataStatus,
  projectId,
}: {
  config: PageConfig;
  dataStatus: VisionWorkspaceData["dataSourceStatus"];
  projectId: string;
}) {
  let action: React.ReactNode = null;
  if (config.page === "dashboard") {
    action = (
      <Link
        className={styles.primaryButton}
        href={`/projects/${projectId}/evidence`}
      >
        打开证据档案 →
      </Link>
    );
  } else if (config.page === "evidence") {
    action = (
      <Link className={styles.primaryButton} href={`/projects/${projectId}`}>
        补充来源资料 →
      </Link>
    );
  } else if (config.page === "strategy") {
    action = (
      <Link
        className={styles.primaryButton}
        href={`/projects/${projectId}/generation`}
      >
        查看生成准备结果 →
      </Link>
    );
  }

  return (
    <div className={styles.pageHeading}>
      <div className={styles.pageTitleGroup}>
        <span className={styles.eyebrow}>{config.eyebrow}</span>
        <h1>{config.title}</h1>
        <p>{config.description}</p>
      </div>
      <div className={styles.headingActions}>
        <span className={styles.demoNotice}>{dataStatus}</span>
        {action}
      </div>
    </div>
  );
}

function DashboardPage({
  config,
  imageUrl,
  selectedNode,
  onSelect,
}: PageBodyProps & { projectId: string }) {
  return (
    <div className={styles.canvasLayout}>
      <AssetCanvas
        imageUrl={imageUrl}
        imageAlt="来源商品图，图片内文字、数值和随附对象仍待核验"
        label="来源商业资产 · 未进入生产事实"
        labelCode="DEMO_ONLY / USER SOURCE"
        nodes={config.nodes}
        selected={selectedNode}
        onSelect={onSelect}
        caption="图片是待核验商业资产，不是页面装饰"
        status="事实确认未完成"
      />
      <ProofNodePanel
        nodes={config.nodes}
        selected={selectedNode}
        onSelect={onSelect}
      />
    </div>
  );
}

function EvidencePage({
  data,
  config,
  imageUrl,
  selectedNode,
  onSelect,
}: PageBodyProps & { data: VisionWorkspaceData; projectId: string }) {
  const references = data.project.assets.filter(
    (asset) => asset.kind === "REFERENCE",
  );
  return (
    <>
      <div className={styles.archiveLayout}>
        <div>
          <AssetCanvas
            imageUrl={imageUrl}
            imageAlt="用户来源商品图；文字、数值和随附对象关系仍待核验"
            label="来源商业资产 · 待核验"
            labelCode="DEMO_ONLY / USER SOURCE"
            nodes={config.nodes}
            selected={selectedNode}
            onSelect={onSelect}
            compact
            caption="文件来源：项目资产 API 或明确标记的演示素材"
            status="档案未完成"
          />
          <ProofDetails node={selectedNode} />
        </div>
        <section className={styles.flatPanel} aria-label="商品事实档案">
          <PanelHeading
            title="商品事实档案"
            copy="状态同时使用文字、符号与结构表达"
            badge="1 项阻断"
          />
          <FactRow index="01" title="主体轮廓、屏幕与按键可见" status="已观察" />
          <FactRow index="02" title="俄文与数值的真实性未知" status="硬阻断" />
          <FactRow index="03" title="随附对象的业务关系未知" status="待确认" />
          <FactRow
            index="04"
            title={`项目已有 ${references.length} 张通用 Reference`}
            status="角色待核验"
          />
        </section>
      </div>
      <section className={styles.referenceArchive} aria-label="Reference 档案">
        <div className={styles.referenceHeader}>
          <strong>A · 当前与历史结果</strong>
          <span>角色不会由普通 REFERENCE 资产自动推断</span>
        </div>
        <div className={styles.referenceGrid}>
          <ReferenceItem letter="A" title="当前来源资产" status="BOUND / SOURCE" />
          <ReferenceItem
            letter="B"
            title="市场竞品 Reference"
            status={references.length ? "UNCLASSIFIED" : "MISSING"}
          />
          <ReferenceItem letter="C" title="品牌视觉 Reference" status="MISSING" />
        </div>
      </section>
    </>
  );
}

function StrategyPage({
  data,
  config,
  imageUrl,
  selectedNode,
  onSelect,
  onOpenSheet,
}: PageBodyProps & {
  data: VisionWorkspaceData;
  projectId: string;
  onOpenSheet: () => void;
}) {
  return (
    <div className={styles.strategyLayout}>
      <aside className={styles.decisionRail}>
        <section>
          <h2>这张图只解决什么</h2>
          <strong>让买家先识别商品主体，再理解随附对象关系</strong>
          <p>演示任务草案，不代表真实用户研究结论。</p>
        </section>
        <section>
          <h3>前三视觉重点</h3>
          <div className={styles.decisionChipList}>
            {config.nodes.map((node) => (
              <button
                className={`${styles.decisionChip} ${selectedNode.id === node.id ? styles.selected : ""}`}
                type="button"
                aria-pressed={selectedNode.id === node.id}
                onClick={() => onSelect(node)}
                key={node.id}
              >
                <b>{node.index}</b>
                <span>{node.label}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>必须保留</h3>
          <p>主体轮廓、屏幕区域、按键关系和已出现的随附对象。</p>
        </section>
        <section>
          <button className={styles.textButton} type="button" onClick={onOpenSheet}>
            查看高级信息
          </button>
          <p>
            {data.styleSpec
              ? `已读取 StyleSpec revision ${data.styleSpec.revisionNumber}`
              : "StyleSpec 未加载；当前展示冻结参考态。"}
          </p>
        </section>
      </aside>
      <div>
        <AssetCanvas
          imageUrl={imageUrl}
          imageAlt="视觉方案覆盖层，展示商品主体、表达和随附对象关系"
          label="视觉方案覆盖层 · 非真实生成"
          labelCode="DEMO_ONLY / STRATEGY OVERLAY"
          nodes={config.nodes}
          selected={selectedNode}
          onSelect={onSelect}
          crop
          caption="点击标记查看 Proofline 关系"
          status="等待 Gate B 权威记录"
        />
        <ProofDetails node={selectedNode} />
      </div>
    </div>
  );
}

function GenerationPage({
  data,
  config,
  imageUrl,
  selectedNode,
  onSelect,
  projectId,
}: PageBodyProps & { data: VisionWorkspaceData; projectId: string }) {
  return (
    <>
      <section className={styles.readinessSummary} aria-label="生成准备摘要">
        <Metric label="MUST 覆盖率" value="4 / 4 · 100%" note="DEMO_ONLY 映射" />
        <Metric label="硬冲突" value="未知" note="Compile Guard 未接入" />
        <Metric label="静默降级" value="未知" note="ExecutionPackage 未创建" />
        <Metric
          label="已有候选"
          value={`${data.generations.length} 张`}
          note="来自现有 generations API"
        />
      </section>
      <div className={styles.generationLayout}>
        <AssetCanvas
          imageUrl={imageUrl}
          imageAlt="生成准备画布，展示策略要求进入候选图的区域关系"
          label="生成准备画布 · 非候选图"
          labelCode="GUARDED / PACKAGE PREVIEW"
          nodes={config.nodes}
          selected={selectedNode}
          onSelect={onSelect}
          crop
          compact
          caption="点击标记查看来源、影响和后续检查"
          status="UI 映射完成 · 编译守卫待接入"
        />
        <section className={styles.flatPanel} aria-label="视觉要求覆盖">
          <PanelHeading
            title="视觉要求覆盖"
            copy="每条 MUST 在 UI 中有明确去向"
            badge="4 / 4"
          />
          {config.nodes.map((node) => (
            <button
              className={`${styles.coverageRow} ${selectedNode.id === node.id ? styles.selected : ""}`}
              type="button"
              aria-pressed={selectedNode.id === node.id}
              onClick={() => onSelect(node)}
              key={node.id}
            >
              <span className={styles.coverageIndex}>{node.index}</span>
              <span className={styles.coverageCopy}>
                <strong>{node.label}</strong>
                <span>{node.summary}</span>
              </span>
              <span className={styles.coverageState}>MAPPED</span>
            </button>
          ))}
          <div className={styles.referenceBindings}>
            <ReferenceBinding code="A / BOUND" copy="来源素材作为身份与关系锚点" />
            <ReferenceBinding code="B / MISSING" copy="不推断市场规律" />
            <ReferenceBinding code="C / MISSING" copy="不声明品牌规则" />
          </div>
          <div className={styles.generationControl}>
            <div>
              <strong>执行前仍需权威 Compile Guard</strong>
              <span>本页不创建任务，也不会触发付费模型调用。</span>
            </div>
            <Link className={styles.primaryButton} href={`/projects/${projectId}`}>
              打开现有生成工作台 →
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

function QaPage({
  imageUrl,
  selectedNode,
  onSelect,
  selectedCandidateId,
  onSelectCandidate,
  releaseState,
}: {
  imageUrl: string;
  selectedNode: ProofNode;
  onSelect: (node: ProofNode) => void;
  selectedCandidateId: (typeof QA_CANDIDATES)[number]["id"];
  onSelectCandidate: (
    candidateId: (typeof QA_CANDIDATES)[number]["id"],
  ) => void;
  releaseState: ReturnType<typeof getReleaseState>;
}) {
  return (
    <>
      <div className={styles.qaHeading}>
        <div>
          <span className={styles.eyebrow}>QA REVIEW STUDIO / DEMO_ONLY</span>
          <h1>从候选图的问题位置，一路看到 QA 结果与发布资格</h1>
          <p>QA 模拟通过不代表生产发布资格；平台规则未加载时始终禁止生产导出。</p>
        </div>
        <span className={styles.demoNotice}>内部验证模式 · DEMO_ONLY</span>
      </div>
      <div className={styles.candidateSwitcher} aria-label="候选图切换">
        {QA_CANDIDATES.map((candidate) => (
          <button
            className={`${styles.candidateSwitch} ${candidate.id === selectedCandidateId ? styles.selected : ""}`}
            type="button"
            aria-pressed={candidate.id === selectedCandidateId}
            onClick={() => onSelectCandidate(candidate.id)}
            key={candidate.id}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <div className={styles.qaLayout}>
        <AssetCanvas
          imageUrl={imageUrl}
          imageAlt="概念候选图；QA 状态为演示，不代表真实生成或真实检查"
          label="概念候选 · 非真实 QA 结论"
          labelCode="DEMO_ONLY / GUARDED REVIEW"
          nodes={QA_PROOF_NODES}
          selected={selectedNode}
          onSelect={onSelect}
          crop
          compact
          caption="点击图中区域查看来源与检查关系"
          status={`${releaseState.qa_overall_status} · 演示状态`}
        />
        <ReleaseDecisionPanel
          state={releaseState}
          classes={{
            chain: styles.releaseChain,
            head: styles.releaseHead,
            step: styles.releaseStep,
            stepIndex: styles.releaseStepIndex,
            notice: styles.releaseNotice,
          }}
        />
      </div>
    </>
  );
}

function AdvancedSheet({
  open,
  onClose,
  node,
  data,
  releaseState,
}: {
  open: boolean;
  onClose: () => void;
  node: ProofNode;
  data: VisionWorkspaceData;
  releaseState: ReturnType<typeof getReleaseState> | null;
}) {
  const payload = useMemo(
    () => ({
      proofline: node.tech,
      data_source_status: data.dataSourceStatus,
      style_spec_revision: data.styleSpec?.revisionNumber ?? "not_loaded",
      generation_count: data.generations.length,
      release_guard: releaseState,
      unavailable_contracts: data.unavailableContracts,
    }),
    [data, node.tech, releaseState],
  );
  return (
    <aside
      className={`${styles.advancedSheet} ${open ? styles.sheetOpen : ""}`}
      aria-hidden={!open}
      aria-labelledby="advanced-title"
    >
      <div className={styles.sheetHead}>
        <div>
          <span className={styles.eyebrow}>ADVANCED INFORMATION</span>
          <h2 id="advanced-title">技术映射</h2>
        </div>
        <button
          className={styles.iconButton}
          type="button"
          aria-label="关闭高级信息"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className={styles.sheetBody}>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
        <p>只读显示现有合同；不会创建 Gate、批准、导出或平台合规记录。</p>
      </div>
    </aside>
  );
}

function PanelHeading({
  title,
  copy,
  badge,
}: {
  title: string;
  copy: string;
  badge: string;
}) {
  return (
    <div className={styles.panelHeading}>
      <div>
        <strong>{title}</strong>
        <span>{copy}</span>
      </div>
      <span className={styles.status}>{badge}</span>
    </div>
  );
}

function FactRow({
  index,
  title,
  status,
}: {
  index: string;
  title: string;
  status: string;
}) {
  return (
    <div className={styles.factRow}>
      <span className={styles.factIndex}>{index}</span>
      <strong>{title}</strong>
      <span>{status}</span>
    </div>
  );
}

function ReferenceItem({
  letter,
  title,
  status,
}: {
  letter: string;
  title: string;
  status: string;
}) {
  return (
    <div className={styles.referenceItem}>
      <span className={styles.referenceLetter}>{letter}</span>
      <span>
        <strong>{title}</strong>
        <small>{status}</small>
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function ReferenceBinding({ code, copy }: { code: string; copy: string }) {
  return (
    <div className={styles.referenceBinding}>
      <strong>{code}</strong>
      <span>{copy}</span>
    </div>
  );
}

type PageBodyProps = {
  config: PageConfig;
  imageUrl: string;
  selectedNode: ProofNode;
  onSelect: (node: ProofNode) => void;
};

function getPageConfig(page: VisionPage): PageConfig {
  if (page !== "qa") return PAGE_CONFIGS[page];
  return {
    page: "qa",
    eyebrow: "QA REVIEW STUDIO / DEMO_ONLY",
    title: "从候选图的问题位置，一路看到 QA 结果与发布资格",
    description: "QA 模拟通过不代表生产发布资格。",
    stage: 3,
    next: "等待平台规则核验",
    nodes: QA_PROOF_NODES,
    initialNodeId: "q-identity",
  };
}
