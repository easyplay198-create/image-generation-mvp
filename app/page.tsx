"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ProjectSummary = {
  id: string;
  name: string;
  productName: string;
  category: string;
  updatedAt: string;
};

const initialForm = {
  name: "",
  productName: "",
  category: "",
  sellingPoints: "",
  targetAudience: "",
  forbiddenClaims: "",
};

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState("正在加载项目…");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void fetchProjects()
      .then((nextProjects) => {
        if (cancelled) return;
        setProjects(nextProjects);
        setStatus(nextProjects.length ? "项目已加载。" : "还没有商品项目。");
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(getErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("正在创建商品项目…");

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
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
      const payload = await readApiResponse<{ project: ProjectSummary }>(
        response,
      );
      router.push(`/projects/${payload.project.id}`);
    } catch (error) {
      setStatus(getErrorMessage(error));
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">T-02 · 商品项目与资产</p>
          <h1>商品图片工作台</h1>
          <p className="summary">
            创建商品项目，维护商品信息，并上传一张主商品图与最多六张视觉参考图。
          </p>
        </div>
        <div className="warning" role="note">
          本地 Demo 用户模式，禁止公开部署。
        </div>
      </header>

      <div className="two-column">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">新项目</p>
              <h2>填写商品信息</h2>
            </div>
          </div>

          <form className="form-grid" onSubmit={createProject}>
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
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "正在创建…" : "创建并进入工作台"}
            </button>
          </form>
          <p className="status" aria-live="polite">
            {status}
          </p>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">已有项目</p>
              <h2>继续编辑</h2>
            </div>
            <span className="count-badge">{projects.length}</span>
          </div>
          <div className="project-list">
            {projects.map((project) => (
              <Link
                className="project-card"
                href={`/projects/${project.id}`}
                key={project.id}
              >
                <strong>{project.name}</strong>
                <span>{project.productName}</span>
                <small>
                  {project.category} · {formatDate(project.updatedAt)}
                </small>
              </Link>
            ))}
            {!projects.length && (
              <p className="empty-state">创建第一个商品项目后会显示在这里。</p>
            )}
          </div>
        </section>
      </div>
    </main>
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

function toLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function fetchProjects(): Promise<ProjectSummary[]> {
  const response = await fetch("/api/projects", { cache: "no-store" });
  const payload = await readApiResponse<{ projects: ProjectSummary[] }>(
    response,
  );

  return payload.projects;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
