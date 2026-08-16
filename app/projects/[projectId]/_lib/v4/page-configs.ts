import type { ProofNode, VisionPage } from "./view-models";

export type PageConfig = {
  page: VisionPage;
  eyebrow: string;
  title: string;
  description: string;
  stage: 0 | 1 | 2 | 3;
  next: string;
  nodes: readonly ProofNode[];
  initialNodeId: string;
};

const dashboardNodes: readonly ProofNode[] = [
  {
    id: "e-identity",
    index: "01",
    label: "商品主体",
    summary: "已观察 · 仅确认可见性",
    region: "identity",
    title: "商品主体可见",
    reason: "商品主体轮廓、屏幕与按键区域在来源图中可见。",
    source: "用户提供的来源商品图",
    impact: "可形成商品身份的保留锚点，但不能推断型号与性能。",
    check: "后续检查主体轮廓、屏幕和按键关系是否保持。",
    tech: "Evidence E01 → ProductTruth → QA Identity",
  },
  {
    id: "e-claim",
    index: "02",
    label: "图片内表达",
    summary: "待验证 · 当前关键原因",
    region: "claim",
    title: "图片内表达待核验",
    reason: "图片内俄文与数值尚未关联可核验来源。",
    source: "来源商品图中的文字与数值区域",
    impact: "阻止这些表达进入视觉方案与候选图。",
    check: "人工核对每条表达的来源、允许范围与禁止范围。",
    tech: "Evidence E02 → Claim Ledger → Hard Stop",
  },
  {
    id: "e-accessory",
    index: "03",
    label: "随附对象",
    summary: "未知 · 需要人工确认",
    region: "accessory",
    title: "随附对象关系未知",
    reason: "图中可见多件随附对象，但名称、数量与包装关系尚未确认。",
    source: "来源商品图下方对象区域",
    impact: "可以保留可见关系，不得新增、删除或命名对象。",
    check: "检查对象数量、形态与相对位置是否发生变化。",
    tech: "Evidence E03 → Unknowns → QA Accessories",
  },
];

const evidenceNodes: readonly ProofNode[] = [
  {
    ...dashboardNodes[0]!,
    id: "a-identity",
    reason: "来源图中可以观察到主体轮廓、屏幕和按键区域。",
    source: "用户提供的商品来源图",
    impact: "形成必须保留的商品身份锚点，但不支持型号或性能结论。",
  },
  {
    ...dashboardNodes[1]!,
    id: "a-claim",
    title: "图片内表达待验证",
    reason: "俄文与数值尚未连接到可核验文件或人工确认。",
    source: "来源图上方文字与数值区域",
    impact: "相关表达不得进入视觉方案与候选图。",
  },
  {
    ...dashboardNodes[2]!,
    id: "a-accessory",
    reason: "图中可见对象，但名称、数量与包装关系尚未确认。",
    source: "来源图下方对象区域",
    impact: "只能保持可见关系，不得新增、删除或命名对象。",
  },
];

const strategyNodes: readonly ProofNode[] = [
  {
    id: "s-hierarchy",
    index: "01",
    label: "商品主体优先",
    summary: "第一视觉焦点",
    region: "hierarchy",
    title: "商品主体必须成为第一焦点",
    reason: "视觉任务要求先建立商品身份，再处理文字与随附对象。",
    source: "人工确认的 Primary Job 草案",
    impact: "控制主体、文字和附件三者的视觉权重。",
    check: "检查商品主体是否比文字与装饰更先被看见。",
    tech: "任务 S01 → 视觉规则 C004 → 检查 Q04",
  },
  {
    id: "s-identity",
    index: "02",
    label: "保持主体关系",
    summary: "轮廓、屏幕与按键",
    region: "identity",
    title: "商品身份关系必须保持",
    reason: "来源图中已观察到主体轮廓、屏幕和按键关系。",
    source: "商品事实档案 E01",
    impact: "禁止改变主体结构或关键部件关系。",
    check: "逐项比对主体轮廓、屏幕与按键位置。",
    tech: "Evidence E01 → Strategy S02 → QA Q01",
  },
  {
    id: "s-accessory",
    index: "03",
    label: "保留随附对象",
    summary: "只保持可见关系",
    region: "accessory",
    title: "随附对象关系必须保留",
    reason: "对象名称与数量未确认，只能保持来源图中的可见关系。",
    source: "来源图下方随附对象区域",
    impact: "禁止新增、删除、复制或重新命名对象。",
    check: "检查对象数量、形态和相对位置。",
    tech: "Evidence E03 → Strategy S03 → QA Accessories",
  },
];

const generationNodes: readonly ProofNode[] = [
  {
    id: "g-hierarchy",
    index: "01",
    label: "商品主体优先",
    summary: "构图优先级 → 视觉层级检查",
    region: "hierarchy",
    title: "第一视觉焦点已映射",
    reason: "视觉方案要求商品主体先于文字与装饰被看见。",
    source: "待 Gate B 权威记录的视觉方案草案",
    impact: "进入构图优先级，并映射至视觉层级检查。",
    check: "检查商品主体是否保持第一视觉焦点。",
    tech: "Strategy S01 → MUST C004 → UI_GUARD_COMPILE pending → QA Q04",
  },
  {
    id: "g-identity",
    index: "02",
    label: "保持商品身份",
    summary: "区域保护 → 商品身份检查",
    region: "identity",
    title: "商品身份已映射",
    reason: "主体轮廓、屏幕和按键关系必须保持。",
    source: "来源图的已观察商品身份区域",
    impact: "进入必须保留项与商品身份检查。",
    check: "逐项比对轮廓、屏幕、按键与部件关系。",
    tech: "Evidence E01 → MUST C001 → Protected Region → QA Q01",
  },
  {
    id: "g-claim",
    index: "03",
    label: "排除未验证表达",
    summary: "禁止项 → Claim 安全检查",
    region: "claim",
    title: "未验证表达已排除",
    reason: "图片内俄文与数值没有可核验来源。",
    source: "商品事实档案中的待验证表达",
    impact: "进入禁止表达项，不进入可生成内容。",
    check: "检查候选图是否新增或强化未验证表达。",
    tech: "Evidence E02 → PROHIBITED C002 → QA Claim",
  },
  {
    id: "g-accessory",
    index: "04",
    label: "保护随附对象关系",
    summary: "关系保护 → 对象一致性检查",
    region: "accessory",
    title: "随附对象关系已保护",
    reason: "对象关系未知，因此只能保持来源图中的可见关系。",
    source: "来源图下方随附对象区域",
    impact: "禁止新增、删除、复制或重新命名对象。",
    check: "核对对象数量、形态与相对位置。",
    tech: "Evidence E03 → MUST C003 → Protected Relation → QA Q03",
  },
];

export const QA_PROOF_NODES: readonly ProofNode[] = [
  {
    id: "q-identity",
    index: "01",
    label: "商品身份检查",
    summary: "主体结构与部件关系",
    region: "identity",
    title: "商品身份检查",
    reason: "当前演示状态未显示商品主体结构变化。",
    source: "来源商品图中的主体轮廓、屏幕与按键关系",
    impact: "决定候选是否具备基本 QA 条件，不授予发布资格。",
    check: "检查主体轮廓、屏幕、按键和部件关系。",
    tech: "Evidence E01 → Strategy S02 → QA Q01",
  },
  {
    id: "q-screen",
    index: "02",
    label: "屏幕文字检查",
    summary: "低置信度区域",
    region: "screen",
    title: "屏幕文字检查",
    reason: "低置信度文字区域必须进入人工复核。",
    source: "来源商品图中的屏幕区域",
    impact: "可能触发局部返修，禁止改变主体结构。",
    check: "复核屏幕文字清晰度、字符形态与位置。",
    tech: "Evidence E01 → Protected Region → QA Q02",
  },
  {
    id: "q-accessory",
    index: "03",
    label: "随附对象检查",
    summary: "结构性风险",
    region: "accessory",
    title: "随附对象检查",
    reason: "对象名称与数量未确认，任何增删都构成放行风险。",
    source: "来源商品图下方随附对象区域",
    impact: "发现结构性变化时停止自动路径。",
    check: "人工核对对象数量、形态和相对位置。",
    tech: "Evidence E03 → Strategy S03 → QA Q03",
  },
];

export const PAGE_CONFIGS: Record<
  Exclude<VisionPage, "qa">,
  PageConfig
> = {
  dashboard: {
    page: "dashboard",
    eyebrow: "DECISION OVERVIEW / DEMO_ONLY",
    title: "从商品图上直接确认：知道什么，为什么还不能继续",
    description:
      "点击图片标记或右侧证明节点，查看对应区域、原因、来源、影响范围与后续检查项。",
    stage: 0,
    next: "确认图片内表达的来源",
    nodes: dashboardNodes,
    initialNodeId: "e-claim",
  },
  evidence: {
    page: "evidence",
    eyebrow: "EVIDENCE ARCHIVE / DEMO_ONLY",
    title: "商品事实不是一张表，而是可定位、可追溯的视觉档案",
    description:
      "点击事实条目，定位来源图中的对应区域，并查看它会如何限制视觉方案与后续检查。",
    stage: 0,
    next: "关联图片内表达的来源",
    nodes: evidenceNodes,
    initialNodeId: "a-identity",
  },
  strategy: {
    page: "strategy",
    eyebrow: "VISUAL STRATEGY / DEMO_ONLY",
    title: "在商品图上确认视觉方案，而不是阅读一页策略文字",
    description:
      "点击图中覆盖层或左侧重点，查看策略的原因、来源、影响范围与检查方式。",
    stage: 1,
    next: "查看生成准备结果",
    nodes: strategyNodes,
    initialNodeId: "s-hierarchy",
  },
  generation: {
    page: "generation",
    eyebrow: "GENERATION STUDIO / GUARDED_PREVIEW",
    title: "先确认每条视觉要求进入哪里，再决定是否生成",
    description:
      "这里展示准备结果、Reference 绑定和真实已有候选；执行仍由现有生成工作台承载。",
    stage: 2,
    next: "核对准备结果与现有候选",
    nodes: generationNodes,
    initialNodeId: "g-hierarchy",
  },
};
