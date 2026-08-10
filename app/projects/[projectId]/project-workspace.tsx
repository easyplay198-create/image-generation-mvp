"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

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

export default function ProjectWorkspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [form, setForm] = useState<EditableProject | null>(null);
  const [status, setStatus] = useState("正在加载项目…");
  const [busy, setBusy] = useState(false);

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
        <span className="count-badge">参考图 {references.length}/6</span>
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
