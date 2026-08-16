"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

type BenchmarkResult = {
  id: string;
  providerRequestId: string;
  durationMs: number;
  costMetadata: { amount: string; currency: string; estimated: boolean };
  createdAt: string;
  resultUrl: string;
  asset: {
    id: string;
    width: number;
    height: number;
    byteSize: number;
    sha256: string;
  };
};

type BenchmarkJob = {
  id: string;
  variant: "PLAIN_PROMPT" | "STYLE_SPEC";
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  input:
    | { variant: "PLAIN_PROMPT"; prompt: string }
    | {
        variant: "STYLE_SPEC";
        styleSpecRevisionId: string;
        styleSpecRevisionNumber: 2;
        generationContext: unknown;
      };
  providerName: string;
  providerRequestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  result: BenchmarkResult | null;
};

type BenchmarkRun = {
  id: string;
  sku: string;
  providerName: string;
  modelName: string;
  outputWidth: number;
  outputHeight: number;
  productAssetId: string;
  referenceAssetIds: string[];
  styleSpecRevisionId: string;
  generationContext: unknown;
  createdAt: string;
  jobs: BenchmarkJob[];
};

const DEFAULT_PROMPT =
  "基于输入的商品图生成一张简洁、专业的俄罗斯电商平台商品主图。完整保留商品外观、颜色、结构、屏幕与按钮，移除原背景和手，只展示一个商品主体。使用干净的浅色棚拍背景、自然接触阴影和适度留白，不添加文字、价格、促销标、品牌、商标、水印、人物或额外配件。输出 800×800 像素。";

export default function BenchmarkPanel({
  projectId,
  revision,
}: {
  projectId: string;
  revision: { id: string; revisionNumber: number } | null;
}) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("正在读取 Benchmark 记录…");

  const fetchRuns = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/benchmarks`, {
      cache: "no-store",
    });
    const payload = await readApiResponse<{ benchmarks: BenchmarkRun[] }>(response);
    return payload.benchmarks;
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    void fetchRuns()
      .then((benchmarks) => {
        if (cancelled) return;
        setRuns(benchmarks);
        setStatus(
          benchmarks.length
            ? "已恢复生成对照实验记录。"
            : "尚未创建生成对照实验。",
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(getErrorMessage(error));
      });
    return () => { cancelled = true; };
  }, [fetchRuns]);

  const activeRunId = runs.find((run) =>
    run.jobs.some((job) => job.status === "QUEUED" || job.status === "RUNNING"),
  )?.id;
  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/benchmarks/${activeRunId}`,
          { cache: "no-store" },
        );
        const { benchmark } = await readApiResponse<{ benchmark: BenchmarkRun }>(response);
        if (cancelled) return;
        setRuns((current) => [
          benchmark,
          ...current.filter((run) => run.id !== benchmark.id),
        ]);
        const active = benchmark.jobs.some(
          (job) => job.status === "QUEUED" || job.status === "RUNNING",
        );
        setStatus(
          active
            ? "A/B 生成正在处理；页面会自动刷新。"
            : benchmark.jobs.every((job) => job.status === "SUCCEEDED")
              ? "A/B 两组结果已保存，可直接比较证据。"
              : "Benchmark 已结束；至少一组失败，请查看 Job 记录。",
        );
        if (active) timer = setTimeout(() => void poll(), 1_200);
      } catch (error) {
        if (!cancelled) {
          setStatus(`Benchmark 状态读取失败，将继续轮询：${getErrorMessage(error)}`);
          timer = setTimeout(() => void poll(), 2_500);
        }
      }
    };
    timer = setTimeout(() => void poll(), 400);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeRunId, projectId]);

  async function createRun() {
    if (!revision || revision.revisionNumber !== 2) {
      setStatus("必须明确选择 StyleSpec revision 2 才能创建 Benchmark。");
      return;
    }
    setBusy(true);
    setStatus("正在固化同 SKU、同模型和 800×800 的 A/B 输入快照…");
    try {
      const response = await fetch(`/api/projects/${projectId}/benchmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `${projectId}:benchmark:${crypto.randomUUID()}`,
          plainPrompt: prompt,
          styleSpecRevisionId: revision.id,
        }),
      });
      const { benchmark } = await readApiResponse<{ benchmark: BenchmarkRun }>(response);
      setRuns((current) => [benchmark, ...current]);
      setStatus("Benchmark Run 已创建；启动 benchmark worker 后将顺序生成 A/B 两组。 ");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel benchmark-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">生成对照实验</p>
          <h2>普通 Prompt vs StyleSpec</h2>
          <p className="summary">
            只生成可比较证据，不对结果优劣做判断。A/B 固定同一 SKU、Qwen 模型和 800×800。
          </p>
        </div>
        <span className="count-badge">{runs.length} Runs</span>
      </div>

      <div className="benchmark-create">
        <label>
          <span>A 组普通电商主图 Prompt</span>
          <textarea
            rows={6}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <div className="benchmark-invariants">
          <span>StyleSpec：revision {revision?.revisionNumber ?? "未就绪"}</span>
          <span>Model：QWEN_MODEL</span>
          <span>Output：800 × 800</span>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={busy || Boolean(activeRunId) || revision?.revisionNumber !== 2}
          onClick={() => void createRun()}
        >
          {busy ? "正在创建…" : activeRunId ? "实验处理中…" : "创建 A/B 对照实验"}
        </button>
      </div>

      <p className="status" aria-live="polite">{status}</p>

      <div className="benchmark-runs">
        {runs.map((run) => (
          <article className="benchmark-run" key={run.id}>
            <header>
              <div>
                <strong>Run {run.id}</strong>
                <small>{formatDate(run.createdAt)}</small>
              </div>
              <div className="benchmark-invariants">
                <span>SKU：{run.sku}</span>
                <span>{run.providerName} / {run.modelName}</span>
                <span>{run.outputWidth} × {run.outputHeight}</span>
              </div>
            </header>
            <div className="benchmark-compare">
              {(["PLAIN_PROMPT", "STYLE_SPEC"] as const).map((variant) => (
                <BenchmarkCard
                  key={variant}
                  job={run.jobs.find((job) => job.variant === variant) ?? null}
                  run={run}
                />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function BenchmarkCard({ job, run }: { job: BenchmarkJob | null; run: BenchmarkRun }) {
  const isPlain = job?.variant === "PLAIN_PROMPT";
  return (
    <section className="benchmark-card">
      <div className="benchmark-card-title">
        <strong>{isPlain ? "A 组 · 普通 Prompt" : "B 组 · StyleSpec"}</strong>
        <span className={`job-badge ${job?.status === "SUCCEEDED" ? "job-succeeded" : job?.status === "FAILED" ? "job-failed" : ""}`}>
          {job?.status ?? "缺失"}
        </span>
      </div>
      {job?.result ? (
        <Image
          src={job.result.resultUrl}
          alt={isPlain ? "普通 Prompt 生成结果" : "StyleSpec 生成结果"}
          width={800}
          height={800}
          sizes="(max-width: 900px) 100vw, 50vw"
          unoptimized
        />
      ) : (
        <div className="benchmark-placeholder">等待生成结果</div>
      )}
      <dl>
        <div><dt>Job ID</dt><dd>{job?.id ?? "—"}</dd></div>
        <div><dt>Result ID</dt><dd>{job?.result?.id ?? "—"}</dd></div>
        <div><dt>Provider Request</dt><dd>{job?.providerRequestId ?? "—"}</dd></div>
        <div><dt>生成时间</dt><dd>{job?.result ? `${job.result.durationMs} ms` : job?.startedAt ? "生成中" : "—"}</dd></div>
        <div><dt>开始时间</dt><dd>{job?.startedAt ? formatDate(job.startedAt) : "—"}</dd></div>
        <div><dt>完成时间</dt><dd>{job?.finishedAt ? formatDate(job.finishedAt) : "—"}</dd></div>
        <div><dt>成本</dt><dd>{formatCost(job?.result)}</dd></div>
        <div><dt>商品 Asset</dt><dd>{run.productAssetId}</dd></div>
        {isPlain ? (
          <div className="benchmark-wide"><dt>Prompt</dt><dd>{job?.input.variant === "PLAIN_PROMPT" ? job.input.prompt : "—"}</dd></div>
        ) : (
          <>
            <div><dt>StyleSpec revision ID</dt><dd>{run.styleSpecRevisionId}</dd></div>
            <div><dt>Reference Assets</dt><dd>{run.referenceAssetIds.join(", ")}</dd></div>
            <div className="benchmark-wide"><dt>Generation Context</dt><dd><pre>{JSON.stringify(run.generationContext, null, 2)}</pre></dd></div>
          </>
        )}
        {job?.errorMessage && (
          <div className="benchmark-wide job-error"><dt>错误</dt><dd>{job.errorCode}: {job.errorMessage}</dd></div>
        )}
      </dl>
    </section>
  );
}

function formatCost(result: BenchmarkResult | null | undefined) {
  if (!result) return "—";
  const cost = result.costMetadata;
  return `${cost.amount} ${cost.currency}${cost.estimated ? "（估算）" : ""}`;
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "Benchmark 请求失败。");
  return payload;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Benchmark 请求失败。";
}
