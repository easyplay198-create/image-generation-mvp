"use client";

import Image from "next/image";

import type { ProofNode, ProofRegion } from "../../_lib/v4/view-models";
import styles from "./v4-ui.module.css";

export function AssetCanvas({
  imageUrl,
  imageAlt,
  label,
  labelCode,
  nodes,
  selected,
  onSelect,
  crop = false,
  compact = false,
  caption,
  status,
}: {
  imageUrl: string;
  imageAlt: string;
  label: string;
  labelCode: string;
  nodes: readonly ProofNode[];
  selected: ProofNode;
  onSelect: (node: ProofNode) => void;
  crop?: boolean;
  compact?: boolean;
  caption: string;
  status: string;
}) {
  return (
    <section className={styles.assetCanvas} aria-label={caption}>
      <div
        className={`${styles.imageStage} ${crop ? styles.crop : ""} ${compact ? styles.compactImage : ""}`}
        data-focus={selected.region}
      >
        <Image
          className={styles.productImage}
          src={imageUrl}
          alt={imageAlt}
          fill
          priority
          sizes="(max-width: 1320px) 62vw, 820px"
          unoptimized
        />
        <div className={styles.assetLabel}>
          <strong>{label}</strong>
          <span>{labelCode}</span>
        </div>
        {renderRegions(nodes)}
        {nodes.map((node) => (
          <button
            className={`${styles.hotspot} ${styles[`hotspot${capitalize(node.region)}`]} ${selected.id === node.id ? styles.selected : ""}`}
            type="button"
            aria-label={`查看${node.label}`}
            aria-pressed={selected.id === node.id}
            onClick={() => onSelect(node)}
            key={node.id}
          >
            {node.index}
          </button>
        ))}
      </div>
      <div className={styles.assetCaption}>
        <div>
          <strong>{selected.title}</strong>
          <span>{caption}</span>
        </div>
        <span className={styles.status}>{status}</span>
      </div>
    </section>
  );
}

export function ProofNodePanel({
  nodes,
  selected,
  onSelect,
}: {
  nodes: readonly ProofNode[];
  selected: ProofNode;
  onSelect: (node: ProofNode) => void;
}) {
  return (
    <section className={styles.proofPanel} aria-labelledby="proof-panel-title">
      <div className={styles.proofPanelHead}>
        <span>PROOFLINE / CURRENT RELATION</span>
        <strong id="proof-panel-title">{selected.title}</strong>
      </div>
      <div className={styles.proofNodeList}>
        {nodes.map((node) => (
          <button
            className={`${styles.proofNode} ${selected.id === node.id ? styles.selected : ""}`}
            type="button"
            aria-pressed={selected.id === node.id}
            onClick={() => onSelect(node)}
            key={node.id}
          >
            <span className={styles.proofNodeIndex}>{node.index}</span>
            <span className={styles.proofNodeCopy}>
              <strong>{node.label}</strong>
              <span>{node.summary}</span>
            </span>
            <span className={styles.proofNodeArrow}>→</span>
          </button>
        ))}
      </div>
      <ProofDetails node={selected} stacked />
    </section>
  );
}

export function ProofDetails({
  node,
  stacked = false,
}: {
  node: ProofNode;
  stacked?: boolean;
}) {
  const details = [
    ["对应原因", node.reason],
    ["来源", node.source],
    ["影响范围", node.impact],
    ["后续检查", node.check],
  ] as const;

  return (
    <div
      className={stacked ? styles.proofDetailsStacked : styles.proofDetails}
      aria-live="polite"
    >
      {details.map(([label, value]) => (
        <div className={styles.proofDetail} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function AuditSpine({
  node,
  open,
  onToggle,
  onOpenSheet,
  exceptional = false,
}: {
  node: ProofNode;
  open: boolean;
  onToggle: () => void;
  onOpenSheet: () => void;
  exceptional?: boolean;
}) {
  return (
    <aside className={styles.auditSpine} aria-labelledby="audit-title">
      <div className={styles.auditHeader}>
        <div>
          <span className={styles.eyebrow}>AUDIT SPINE</span>
          <h2 id="audit-title">当前关键原因</h2>
        </div>
        <button
          className={styles.auditToggle}
          type="button"
          aria-expanded={open}
          aria-label={open ? "收起完整审计" : "展开完整审计"}
          onClick={onToggle}
        >
          {open ? "→" : "←"}
        </button>
      </div>
      <div className={styles.auditReason}>
        <strong>{node.reason}</strong>
        <span>
          {exceptional
            ? "异常状态自动展开完整审计。"
            : "正常状态默认只显示当前原因。"}
        </span>
      </div>
      <div className={styles.auditSource}>
        <span>来源</span>
        <strong>{node.source}</strong>
      </div>
      {!open && (
        <button
          className={styles.auditExpand}
          type="button"
          onClick={onToggle}
        >
          展开完整审计
        </button>
      )}
      {open && (
        <div className={styles.auditDetails}>
          <section>
            <h3>这会影响什么</h3>
            <p>{node.impact}</p>
          </section>
          <section>
            <h3>需要检查什么</h3>
            <p>{node.check}</p>
          </section>
          <section>
            <h3>高级信息</h3>
            <div className={styles.auditTech}>{node.tech}</div>
            <button
              className={styles.textButton}
              type="button"
              onClick={onOpenSheet}
            >
              查看完整映射
            </button>
          </section>
        </div>
      )}
    </aside>
  );
}

function renderRegions(nodes: readonly ProofNode[]) {
  const regions = [...new Set(nodes.map((node) => node.region))];
  return regions.map((region) => (
    <div
      className={`${styles.proofRegion} ${styles[`region${capitalize(region)}`]}`}
      data-region={region}
      key={region}
    >
      <span>{regionLabel(region)}</span>
    </div>
  ));
}

function regionLabel(region: ProofRegion) {
  const labels: Record<ProofRegion, string> = {
    identity: "商品主体",
    claim: "图片内表达",
    accessory: "随附对象",
    hierarchy: "视觉焦点",
    screen: "屏幕文字",
  };
  return labels[region];
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
