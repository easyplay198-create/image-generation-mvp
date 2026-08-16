"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState, type FormEvent } from "react";

import BenchmarkPanel from "./benchmark-panel";

const DesignEditor = dynamic(() => import("./design-editor"), {
  ssr: false,
  loading: () => (
    <section className="panel design-editor-panel">
      <p className="status">正在加载 Fabric.js 编辑器…</p>
    </section>
  ),
});

type Asset = {
  id: string;
  kind: "PRODUCT" | "REFERENCE";
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  previewUrl: string;
};

type Project = {
  id: string;
  name: string;
  productName: string;
  category: string;
  sellingPoints: string[];
  targetAudience: string | null;
  forbiddenClaims: string[];
  assets: Asset[];
};

type EditableProject = {
  name: string;
  productName: string;
  category: string;
  sellingPoints: string;
  targetAudience: string;
  forbiddenClaims: string;
};

type StyleAnalysisJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  attemptCount: number;
  maxAttempts: number;
  styleSpecRevisionId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type StyleSpecRevision = {
  id: string;
  revisionNumber: number;
  schemaVersion: "1.0";
  spec: Record<string, unknown>;
  createdAt: string;
};

type StyleSpecState = {
  latestRevision: StyleSpecRevision | null;
  latestJob: StyleAnalysisJob | null;
};

export default function ProjectWorkspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [form, setForm] = useState<EditableProject | null>(null);
  const [styleSpecState, setStyleSpecState] = useState<StyleSpecState | null>(
    null,
  );
  const [styleSpecJson, setStyleSpecJson] = useState("");
  const [status, setStatus] = useState("正在加载项目…");
  const [busy, setBusy] = useState(false);
  const [styleBusy, setStyleBusy] = useState(false);
  const polledJobId = styleSpecState?.latestJob?.id;
  const polledJobStatus = styleSpecState?.latestJob?.status;

  useEffect(() => {
    let cancelled = false;

    void fetchProject(projectId)
      .then((nextProject) => {
        if (cancelled) return;
        setProject(nextProject);
        setForm(toEditableProject(nextProject));
        setStatus("项目与图片已恢复。完成上传后刷新页面仍可查看。");
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(getErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    void fetchStyleSpecState(projectId)
      .then((nextState) => {
        if (!cancelled) applyStyleSpecState(nextState);
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(getErrorMessage(error));
      });

    function applyStyleSpecState(nextState: StyleSpecState) {
      setStyleSpecState(nextState);
      setStyleSpecJson(
        nextState.latestRevision
          ? JSON.stringify(nextState.latestRevision.spec, null, 2)
          : "",
      );
    }

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!polledJobId || !isActiveJobStatus(polledJobStatus)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const job = await fetchStyleAnalysisJob(polledJobId);
        if (cancelled) return;

        if (isActiveJob(job)) {
          setStyleSpecState((current) =>
            current ? { ...current, latestJob: job } : current,
          );
          timer = setTimeout(poll, 1_200);
          return;
        }

        if (job.status === "SUCCEEDED") {
          const nextState = await fetchStyleSpecState(projectId);
          if (cancelled) return;
          setStyleSpecState({
            latestJob: job,
            latestRevision: nextState.latestRevision,
          });
          setStyleSpecJson(
            nextState.latestRevision
              ? JSON.stringify(nextState.latestRevision.spec, null, 2)
              : "",
          );
          setStatus("风格分析完成，StyleSpec revision 已保存。 ");
        } else {
          setStyleSpecState((current) =>
            current ? { ...current, latestJob: job } : current,
          );
          setStatus(job.errorMessage ?? "风格分析任务失败。 ");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(getErrorMessage(error));
          timer = setTimeout(poll, 2_500);
        }
      }
    };

    timer = setTimeout(poll, 500);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [polledJobId, polledJobStatus, projectId]);

  async function refreshProject() {
    const nextProject = await fetchProject(projectId);
    setProject(nextProject);
    setForm(toEditableProject(nextProject));
  }

  async function updateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setStatus("正在保存商品信息…");

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          productName: form.productName,
          category: form.category,
          sellingPoints: toLines(form.sellingPoints),
          targetAudience: form.targetAudience,
          forbiddenClaims: toLines(form.forbiddenClaims),
        }),
      });
      const payload = await readApiResponse<{ project: Project }>(response);
      setProject(payload.project);
      setForm(toEditableProject(payload.project));
      setStatus("商品信息已保存。 ");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(kind: Asset["kind"], files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setStatus(
      kind === "PRODUCT" ? "正在上传主商品图…" : "正在上传参考图…",
    );

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("kind", kind);
        formData.set("file", file);
        const response = await fetch(`/api/projects/${projectId}/assets`, {
          method: "POST",
          body: formData,
        });
        await readApiResponse<{ asset: Asset }>(response);
      }

      await refreshProject();
      setStatus(`${files.length} 张图片已安全保存。`);
    } catch (error) {
      const uploadError = getErrorMessage(error);

      try {
        await refreshProject();
        setStatus(uploadError);
      } catch {
        setStatus(`${uploadError} 项目刷新也失败，请手动刷新页面。`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function startStyleAnalysis() {
    setStyleBusy(true);
    setStatus("正在创建风格分析任务…");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/style-analysis-jobs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: `${projectId}:${crypto.randomUUID()}`,
          }),
        },
      );
      const payload = await readApiResponse<{ job: StyleAnalysisJob }>(response);
      setStyleSpecState((current) => ({
        latestRevision: current?.latestRevision ?? null,
        latestJob: payload.job,
      }));
      setStatus("风格分析任务已排队，请保持 Worker 运行。 ");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setStyleBusy(false);
    }
  }

  async function saveStyleSpec(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStyleBusy(true);
    setStatus("正在校验并保存新的 StyleSpec revision…");

    try {
      let spec: unknown;
      try {
        spec = JSON.parse(styleSpecJson) as unknown;
      } catch {
        throw new Error("StyleSpec 编辑内容不是有效的 JSON。");
      }

      const response = await fetch(`/api/projects/${projectId}/style-spec`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec }),
      });
      const payload = await readApiResponse<{ revision: StyleSpecRevision }>(
        response,
      );
      setStyleSpecState((current) => ({
        latestRevision: payload.revision,
        latestJob: current?.latestJob ?? null,
      }));
      setStyleSpecJson(JSON.stringify(payload.revision.spec, null, 2));
      setStatus(
        `StyleSpec revision ${payload.revision.revisionNumber} 已保存。`,
      );
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setStyleBusy(false);
    }
  }

  if (!project || !form) {
    return (
      <main className="app-shell compact-shell">
        <Link className="back-link" href="/">
          ← 返回项目列表
        </Link>
        <section className="panel">
          <p className="status" aria-live="polite">
            {status}
          </p>
        </section>
      </main>
    );
  }

  const productAsset = project.assets.find((asset) => asset.kind === "PRODUCT");
  const references = project.assets.filter((asset) => asset.kind === "REFERENCE");
  const remainingReferences = Math.max(0, 6 - references.length);
  const styleJob = styleSpecState?.latestJob ?? null;
  const styleRevision = styleSpecState?.latestRevision ?? null;
  const analysisActive = Boolean(styleJob && isActiveJob(styleJob));

  return (
    <main className="app-shell compact-shell">
      <Link className="back-link" href="/">
        ← 返回项目列表
      </Link>
      <header className="hero workspace-hero">
        <div>
          <p className="eyebrow">商品工作台</p>
          <h1>{project.name}</h1>
          <p className="summary">维护商品信息与原始视觉资产。</p>
        </div>
        <div className="workspace-shortcuts">
          <Link
            className="primary-button inline-button"
            href={`/projects/${projectId}/dashboard`}
          >
            进入 AI 视觉 V4
          </Link>
          <span className="count-badge">参考图 {references.length}/6</span>
        </div>
      </header>

      <div className="two-column">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">商品信息</p>
              <h2>编辑并保存</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={updateProject}>
            <Field
              label="项目名称"
              value={form.name}
              onChange={(value) => setForm({ ...form, name: value })}
              required
            />
            <Field
              label="商品名称"
              value={form.productName}
              onChange={(value) => setForm({ ...form, productName: value })}
              required
            />
            <Field
              label="商品类目"
              value={form.category}
              onChange={(value) => setForm({ ...form, category: value })}
              required
            />
            <TextAreaField
              label="商品卖点（每行一条，1–5 条）"
              value={form.sellingPoints}
              onChange={(value) => setForm({ ...form, sellingPoints: value })}
              required
            />
            <Field
              label="目标受众（可选）"
              value={form.targetAudience}
              onChange={(value) => setForm({ ...form, targetAudience: value })}
            />
            <TextAreaField
              label="禁用宣传语（可选，每行一条）"
              value={form.forbiddenClaims}
              onChange={(value) => setForm({ ...form, forbiddenClaims: value })}
            />
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "处理中…" : "保存商品信息"}
            </button>
          </form>
        </section>

        <section className="panel asset-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">原始资产</p>
              <h2>商品图与参考图</h2>
            </div>
          </div>

          <div className="upload-block">
            <div>
              <strong>主商品图</strong>
              <p>仅 1 张，支持 PNG/JPEG/WebP，最大 20 MiB。</p>
            </div>
            <label className={`upload-button ${productAsset ? "disabled" : ""}`}>
              {productAsset ? "已上传" : "选择商品图"}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                disabled={busy || Boolean(productAsset)}
                onChange={(event) => {
                  const input = event.currentTarget;
                  const files = Array.from(input.files ?? []);
                  void uploadFiles("PRODUCT", files).finally(() => {
                    input.value = "";
                  });
                }}
              />
            </label>
          </div>

          {productAsset && <AssetCard asset={productAsset} label="主商品图" />}

          <div className="upload-block reference-upload">
            <div>
              <strong>视觉参考图</strong>
              <p>最多 6 张，还可上传 {remainingReferences} 张。</p>
            </div>
            <label
              className={`upload-button ${remainingReferences === 0 ? "disabled" : ""}`}
            >
              {remainingReferences ? "选择参考图" : "已达上限"}
              <input
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                disabled={busy || remainingReferences === 0}
                onChange={(event) => {
                  const input = event.currentTarget;
                  const files = Array.from(input.files ?? []);
                  if (files.length > remainingReferences) {
                    setStatus(`本项目还可上传 ${remainingReferences} 张参考图。`);
                    input.value = "";
                    return;
                  }
                  void uploadFiles("REFERENCE", files).finally(() => {
                    input.value = "";
                  });
                }}
              />
            </label>
          </div>

          <div className="asset-grid">
            {references.map((asset, index) => (
              <AssetCard
                asset={asset}
                label={`参考图 ${index + 1}`}
                key={asset.id}
              />
            ))}
          </div>
        </section>
      </div>

      <section className="panel style-spec-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">StyleSpec V1</p>
            <h2>风格分析与可编辑 revision</h2>
          </div>
          {styleJob && (
            <span className={`job-badge job-${styleJob.status.toLowerCase()}`}>
              {formatJobStatus(styleJob.status)}
            </span>
          )}
        </div>

        <div className="analysis-actions">
          <div>
            <strong>从参考图分析结构化风格</strong>
            <p>
              当前使用确定性 Mock Provider。任务由独立 Worker 原子领取，完成后自动保存新 revision。
            </p>
            {references.length === 0 && (
              <small>请先上传至少 1 张参考图。</small>
            )}
            {styleJob?.errorCode && styleJob.status === "FAILED" && (
              <small className="job-error">
                {styleJob.errorCode}：{styleJob.errorMessage}
              </small>
            )}
          </div>
          <button
            className="primary-button inline-button"
            type="button"
            disabled={styleBusy || analysisActive || references.length === 0}
            onClick={() => void startStyleAnalysis()}
          >
            {analysisActive
              ? `分析中（${styleJob?.attemptCount ?? 0}/${styleJob?.maxAttempts ?? 2}）`
              : styleJob?.status === "FAILED"
                ? "重新分析"
                : "开始风格分析"}
          </button>
        </div>

        {styleRevision ? (
          <form className="style-editor" onSubmit={saveStyleSpec}>
            <div className="revision-meta">
              <strong>当前 revision {styleRevision.revisionNumber}</strong>
              <span>
                Schema {styleRevision.schemaVersion} · {formatDate(styleRevision.createdAt)}
              </span>
            </div>
            <label>
              <span>StyleSpec JSON（修改后保存会创建新 revision）</span>
              <textarea
                className="style-json"
                rows={24}
                spellCheck={false}
                value={styleSpecJson}
                onChange={(event) => setStyleSpecJson(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={styleBusy || analysisActive}
            >
              {styleBusy ? "处理中…" : "校验并保存新 revision"}
            </button>
          </form>
        ) : (
          <div className="empty-state style-empty">
            分析成功后会在这里显示完整 StyleSpec；无效 Provider JSON 不会写入数据库。
          </div>
        )}
      </section>

      <BenchmarkPanel
        projectId={projectId}
        revision={
          styleRevision
            ? { id: styleRevision.id, revisionNumber: styleRevision.revisionNumber }
            : null
        }
      />

      <DesignEditor projectId={projectId} />

      <p className="status floating-status" aria-live="polite">
        {status}
      </p>
    </main>
  );
}

function AssetCard({ asset, label }: { asset: Asset; label: string }) {
  return (
    <article className="asset-card">
      <Image
        src={asset.previewUrl}
        alt={label}
        width={asset.width}
        height={asset.height}
        sizes="(max-width: 760px) 100vw, 260px"
        unoptimized
      />
      <div>
        <strong>{label}</strong>
        <small>
          {asset.width} × {asset.height} · {formatBytes(asset.byteSize)}
        </small>
      </div>
    </article>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      <span>{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        required={props.required}
      />
    </label>
  );
}

function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      <span>{props.label}</span>
      <textarea
        rows={3}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        required={props.required}
      />
    </label>
  );
}

function toEditableProject(project: Project): EditableProject {
  return {
    name: project.name,
    productName: project.productName,
    category: project.category,
    sellingPoints: project.sellingPoints.join("\n"),
    targetAudience: project.targetAudience ?? "",
    forbiddenClaims: project.forbiddenClaims.join("\n"),
  };
}

async function fetchProject(projectId: string): Promise<Project> {
  const response = await fetch(`/api/projects/${projectId}`, {
    cache: "no-store",
  });
  const payload = await readApiResponse<{ project: Project }>(response);

  return payload.project;
}

async function fetchStyleSpecState(projectId: string): Promise<StyleSpecState> {
  const response = await fetch(`/api/projects/${projectId}/style-spec`, {
    cache: "no-store",
  });
  const payload = await readApiResponse<{ styleSpec: StyleSpecState }>(response);

  return payload.styleSpec;
}

async function fetchStyleAnalysisJob(jobId: string) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  const payload = await readApiResponse<{ job: StyleAnalysisJob }>(response);

  return payload.job;
}

function toLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function readApiResponse<Payload>(response: Response): Promise<Payload> {
  const payload = (await response.json()) as Payload & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "请求失败，请稍后重试。");
  }

  return payload;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

function formatBytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

function isActiveJob(job: StyleAnalysisJob) {
  return isActiveJobStatus(job.status);
}

function isActiveJobStatus(status: StyleAnalysisJob["status"] | undefined) {
  return status === "QUEUED" || status === "RUNNING";
}

function formatJobStatus(status: StyleAnalysisJob["status"]) {
  const labels: Record<StyleAnalysisJob["status"], string> = {
    QUEUED: "已排队",
    RUNNING: "分析中",
    SUCCEEDED: "已完成",
    FAILED: "失败",
    CANCELED: "已取消",
  };

  return labels[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
