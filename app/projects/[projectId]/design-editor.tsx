"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Canvas } from "fabric";

import {
  findGenerationForJob,
  isGenerationJobActive,
  type GenerationJobView,
  type GenerationResultView,
} from "@/src/domain/generation-flow";
import {
  createInitialDesignDocument,
  deserializeDesignDocument,
  parseDesignDocument,
  replaceBackgroundAsset,
  serializeDesignDocument,
  type DesignDocument,
  type DesignLayer,
  type TextLayer,
} from "@/src/editor/design-document";
import { DesignHistory } from "@/src/editor/design-history";
import {
  canvasToDesignDocument,
  findFabricObjectByLayerId,
  getFabricLayerId,
  loadDesignDocumentIntoCanvas,
  updateFabricObjectFromLayer,
} from "@/src/editor/fabric-adapter";

type ProjectAsset = {
  id: string;
  kind: "PRODUCT" | "REFERENCE" | "GENERATED_BACKGROUND" | "EXPORT";
  width: number;
  height: number;
  previewUrl: string;
};

type ProjectData = {
  id: string;
  sellingPoints: string[];
  assets: ProjectAsset[];
};

type StyleSpecState = {
  latestRevision: { id: string } | null;
};

type EditorData = {
  project: ProjectData;
  generations: GenerationResultView[];
  styleSpec: StyleSpecState;
};

type SavedVersion = {
  id: string;
  versionNumber: number;
  createdAt: string;
};

const CANVAS_SIZE = 1080;

export default function DesignEditor({ projectId }: { projectId: string }) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const documentRef = useRef<DesignDocument | null>(null);
  const historyRef = useRef<DesignHistory | null>(null);
  const assetUrlsRef = useRef(new Map<string, string>());
  const renderingRef = useRef(false);
  const renderAbortRef = useRef<AbortController | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [data, setData] = useState<EditorData | null>(null);
  const [document, setDocument] = useState<DesignDocument | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [jsonDraft, setJsonDraft] = useState("");
  const [status, setStatus] = useState("正在准备 Fabric.js 编辑器…");
  const [busy, setBusy] = useState(false);
  const [generationSubmitting, setGenerationSubmitting] = useState(false);
  const [generationJob, setGenerationJob] = useState<GenerationJobView | null>(
    null,
  );
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });

  const syncHistoryState = useCallback(() => {
    setHistoryState({
      canUndo: historyRef.current?.canUndo ?? false,
      canRedo: historyRef.current?.canRedo ?? false,
    });
  }, []);

  const renderOnCanvas = useCallback(async (next: DesignDocument) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) throw new Error("Fabric.js 画布尚未就绪。");

    renderAbortRef.current?.abort();
    const controller = new AbortController();
    renderAbortRef.current = controller;
    renderingRef.current = true;
    try {
      await loadDesignDocumentIntoCanvas({
        canvas,
        document: next,
        signal: controller.signal,
        resolveAssetUrl: (layer) => {
          if (!layer.sourceAssetId) {
            throw new Error("非图片图层不需要资产 URL。");
          }
          const url = assetUrlsRef.current.get(layer.sourceAssetId);
          if (!url) {
            throw new Error(
              `${formatLayerType(layer.type)}引用的资产不可用或不属于当前项目。`,
            );
          }
          return url;
        },
      });
      setSelectedLayerId(null);
    } finally {
      if (renderAbortRef.current === controller) {
        renderingRef.current = false;
      }
    }
  }, []);

  const commitCanvasChange = useCallback(
    (canvas: Canvas) => {
      if (renderingRef.current || !documentRef.current) return;

      try {
        const next = canvasToDesignDocument(canvas, documentRef.current);
        const committed = historyRef.current?.push(next) ?? next;
        documentRef.current = committed;
        setDocument(committed);
        setJsonDraft(serializeDesignDocument(committed));
        syncHistoryState();
        setStatus("画布修改已记录，可撤销或重做。");
      } catch (error) {
        setStatus(getErrorMessage(error));
        const current = documentRef.current;
        if (current) void renderOnCanvas(current);
      }
    },
    [renderOnCanvas, syncHistoryState],
  );

  useEffect(() => {
    let cancelled = false;
    let instance: Canvas | null = null;

    void import("fabric")
      .then(({ Canvas: FabricCanvas }) => {
        if (cancelled || !canvasElementRef.current) return;
        instance = new FabricCanvas(canvasElementRef.current, {
          width: CANVAS_SIZE,
          height: CANVAS_SIZE,
          backgroundColor: "#F5F6F8",
          preserveObjectStacking: true,
          enableRetinaScaling: false,
          fireMiddleClick: false,
          fireRightClick: false,
          stopContextMenu: true,
        });
        fabricCanvasRef.current = instance;

        const syncSelection = () => {
          setSelectedLayerId(
            getFabricLayerId(instance?.getActiveObject()) ?? null,
          );
        };
        const commit = () => {
          if (instance) commitCanvasChange(instance);
        };
        instance.on("selection:created", syncSelection);
        instance.on("selection:updated", syncSelection);
        instance.on("selection:cleared", syncSelection);
        instance.on("object:modified", commit);
        instance.on("text:changed", commit);
        setCanvasReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(getErrorMessage(error));
      });

    return () => {
      cancelled = true;
      renderAbortRef.current?.abort();
      fabricCanvasRef.current = null;
      setCanvasReady(false);
      if (instance) void instance.dispose();
    };
  }, [commitCanvasChange]);

  useEffect(() => {
    if (!canvasReady) return;
    const controller = new AbortController();

    void fetchEditorData(projectId, controller.signal)
      .then(async (nextData) => {
        setData(nextData);
        const product = nextData.project.assets.find(
          (asset) => asset.kind === "PRODUCT",
        );
        const revision = nextData.styleSpec.latestRevision;
        if (!product || !revision) {
          setStatus(
            !product
              ? "请先上传主商品图，编辑器不会用 AI 背景替代商品图层。"
              : "请先生成或保存 StyleSpec revision。",
          );
          return;
        }

        const assetUrls = new Map<string, string>();
        assetUrls.set(product.id, product.previewUrl);
        for (const generation of nextData.generations) {
          assetUrls.set(generation.asset.id, generation.asset.previewUrl);
        }
        assetUrlsRef.current = assetUrls;

        const latestBackground = nextData.generations.find(
          (generation) => !generation.asset.sourceAssetId,
        )?.asset;
        const productScale = Math.min(
          1,
          700 / Math.max(product.width, product.height),
        );
        const initialDocument = createInitialDesignDocument({
          styleSpecRevisionId: revision.id,
          productAssetId: product.id,
          productScale,
          backgroundAssetId: latestBackground?.id,
          headline: nextData.project.sellingPoints[0],
        });

        await renderOnCanvas(initialDocument);
        historyRef.current = new DesignHistory(initialDocument);
        documentRef.current = initialDocument;
        setDocument(initialDocument);
        setJsonDraft(serializeDesignDocument(initialDocument));
        syncHistoryState();
        setStatus(
          latestBackground
            ? "编辑器已加载商品层和最新 AI 背景。"
            : "编辑器已加载商品层；可在生成背景后切换背景。",
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus(getErrorMessage(error));
      });

    return () => controller.abort();
  }, [canvasReady, projectId, renderOnCanvas, syncHistoryState]);

  const selectedLayer = useMemo(
    () =>
      document?.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [document, selectedLayerId],
  );
  const orderedLayers = useMemo(
    () => [...(document?.layers ?? [])].sort((a, b) => b.zIndex - a.zIndex),
    [document],
  );
  const selectedBackgroundId =
    document?.layers.find((layer) => layer.type === "AI_BACKGROUND")
      ?.sourceAssetId ?? "";

  const commitAndRender = useCallback(
    async (nextInput: DesignDocument) => {
      const next = parseDesignDocument(nextInput);
      validateAvailableAssets(next, assetUrlsRef.current);
      await renderOnCanvas(next);
      const committed = historyRef.current?.push(next) ?? next;
      documentRef.current = committed;
      setDocument(committed);
      setJsonDraft(serializeDesignDocument(committed));
      syncHistoryState();
    },
    [renderOnCanvas, syncHistoryState],
  );

  const applyGenerationBackground = useCallback(
    async (generation: GenerationResultView) => {
      const current = documentRef.current;
      if (!current) throw new Error("设计文档尚未就绪。");
      assetUrlsRef.current.set(generation.asset.id, generation.resultUrl);
      await commitAndRender(
        replaceBackgroundAsset(
          current,
          generation.asset.id,
          `background-${crypto.randomUUID()}`,
        ),
      );
    },
    [commitAndRender],
  );

  const refreshGenerationsAndLoad = useCallback(
    async (jobId: string) => {
      const response = await fetch(`/api/projects/${projectId}/generations`);
      const { generations } = await readApiResponse<{
        generations: GenerationResultView[];
      }>(response);
      setData((current) =>
        current ? { ...current, generations } : current,
      );
      for (const generation of generations) {
        assetUrlsRef.current.set(generation.asset.id, generation.resultUrl);
      }

      const completed = findGenerationForJob(generations, jobId);
      if (!completed) {
        throw new Error("任务已成功，但持久化生成结果暂不可见，请稍后刷新。");
      }
      if (completed.asset.sourceAssetId) {
        setStatus("800×800 商品主图已保存，并显示在生成结果中。");
      } else {
        await applyGenerationBackground(completed);
        setStatus(
          "生成结果已保存并加载到画布；商品、文字和装饰图层保持不变。",
        );
      }
    },
    [applyGenerationBackground, projectId],
  );

  const generationJobId = generationJob?.id ?? null;
  useEffect(() => {
    if (!generationJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const response = await fetch(`/api/jobs/${generationJobId}`);
        const { job } = await readApiResponse<{ job: GenerationJobView }>(
          response,
        );
        if (cancelled) return;
        setGenerationJob(job);

        if (isGenerationJobActive(job)) {
          setStatus(
            `生成任务 ${job.status}，worker 尝试 ${job.attemptCount}/${job.maxAttempts}。`,
          );
          timer = setTimeout(() => void poll(), 1_200);
          return;
        }
        if (job.status === "SUCCEEDED") {
          await refreshGenerationsAndLoad(job.id);
          return;
        }
        setStatus(
          `${job.errorCode ?? job.status}：${job.errorMessage ?? "生成任务未成功，可创建新任务重试。"}`,
        );
      } catch (error) {
        if (cancelled) return;
        setStatus(`任务状态读取失败，将继续轮询：${getErrorMessage(error)}`);
        timer = setTimeout(() => void poll(), 2_500);
      }
    };

    timer = setTimeout(() => void poll(), 400);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [generationJobId, refreshGenerationsAndLoad]);

  function updateLayer(
    layerId: string,
    updater: (layer: DesignLayer) => DesignLayer,
  ) {
    if (!documentRef.current || !fabricCanvasRef.current) return;
    try {
      const next = parseDesignDocument({
        ...documentRef.current,
        layers: documentRef.current.layers.map((layer) =>
          layer.id === layerId ? updater(layer) : layer,
        ),
      });
      const changedLayer = next.layers.find((layer) => layer.id === layerId);
      if (!changedLayer) return;

      updateFabricObjectFromLayer(fabricCanvasRef.current, changedLayer);
      const committed = historyRef.current?.push(next) ?? next;
      documentRef.current = committed;
      setDocument(committed);
      setJsonDraft(serializeDesignDocument(committed));
      syncHistoryState();
      setStatus("图层属性已更新。");
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function undo() {
    if (!historyRef.current?.canUndo) return;
    const next = historyRef.current.undo();
    await renderOnCanvas(next);
    documentRef.current = next;
    setDocument(next);
    setJsonDraft(serializeDesignDocument(next));
    syncHistoryState();
    setStatus("已撤销上一步编辑。");
  }

  async function redo() {
    if (!historyRef.current?.canRedo) return;
    const next = historyRef.current.redo();
    await renderOnCanvas(next);
    documentRef.current = next;
    setDocument(next);
    setJsonDraft(serializeDesignDocument(next));
    syncHistoryState();
    setStatus("已重做上一步编辑。");
  }

  async function switchBackground(sourceAssetId: string) {
    if (!documentRef.current) return;
    setBusy(true);
    try {
      await commitAndRender(
        replaceBackgroundAsset(
          documentRef.current,
          sourceAssetId || null,
          `background-${crypto.randomUUID()}`,
        ),
      );
      setStatus(
        sourceAssetId
          ? "背景已切换，商品、文字和装饰图层保持不变。"
          : "AI 背景已移除，其他图层保持不变。",
      );
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function createGenerationJob() {
    const styleSpecRevisionId = documentRef.current?.styleSpecRevisionId;
    if (!styleSpecRevisionId) {
      setStatus("请先生成或保存 StyleSpec revision。");
      return;
    }

    setGenerationSubmitting(true);
    setStatus("正在用当前 StyleSpec revision 创建 800×800 主图任务…");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/generation-jobs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: `${projectId}:generation:${crypto.randomUUID()}`,
            styleSpecRevisionId,
          }),
        },
      );
      const { job } = await readApiResponse<{ job: GenerationJobView }>(
        response,
      );
      setGenerationJob(job);
      setStatus(
        `生成任务已创建，由 ${job.providerName ?? "已配置 Adapter"} 异步处理。`,
      );
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setGenerationSubmitting(false);
    }
  }

  async function loadGenerationIntoCanvas(generation: GenerationResultView) {
    setBusy(true);
    try {
      await applyGenerationBackground(generation);
      setStatus(
        "已加载选定生成结果；商品、文字和装饰图层保持不变。",
      );
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function addTextLayer() {
    if (!documentRef.current) return;
    const layer: TextLayer = {
      id: `text-${crypto.randomUUID()}`,
      type: "TEXT",
      sourceAssetId: null,
      zIndex: nextZIndex(documentRef.current),
      visible: true,
      locked: false,
      x: 540,
      y: 220,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      text: "双击或在右侧编辑文字",
      fontFamily: "Arial",
      fontSize: 52,
      color: "#172033",
      textAlign: "center",
    };
    try {
      await commitAndRender(
        parseDesignDocument({
          ...documentRef.current,
          layers: [...documentRef.current.layers, layer],
        }),
      );
      selectLayer(layer.id);
      setStatus("已添加文字图层。");
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function addDecorationLayer() {
    if (!documentRef.current) return;
    const layer: DesignLayer = {
      id: `decoration-${crypto.randomUUID()}`,
      type: "DECORATION",
      sourceAssetId: null,
      zIndex: nextZIndex(documentRef.current),
      visible: true,
      locked: false,
      x: 820,
      y: 820,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 0.9,
      shape: "RECTANGLE",
      width: 180,
      height: 180,
      fill: "#DDE4FF",
      stroke: "#566CD6",
      strokeWidth: 3,
    };
    try {
      await commitAndRender(
        parseDesignDocument({
          ...documentRef.current,
          layers: [...documentRef.current.layers, layer],
        }),
      );
      selectLayer(layer.id);
      setStatus("已添加装饰图层。");
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function deleteSelectedLayer() {
    if (!documentRef.current || !selectedLayer || selectedLayer.type === "PRODUCT") {
      return;
    }
    try {
      await commitAndRender(
        parseDesignDocument({
          ...documentRef.current,
          layers: documentRef.current.layers.filter(
            (layer) => layer.id !== selectedLayer.id,
          ),
        }),
      );
      setStatus("图层已删除。商品主图层受不变量保护，不能删除。");
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function moveSelectedLayer(direction: "UP" | "DOWN") {
    if (!documentRef.current || !selectedLayer) return;
    try {
      const next = reorderLayer(documentRef.current, selectedLayer.id, direction);
      await commitAndRender(next);
      selectLayer(selectedLayer.id);
      setStatus(direction === "UP" ? "图层已上移。" : "图层已下移。");
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  function selectLayer(layerId: string) {
    setSelectedLayerId(layerId);
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const object = findFabricObjectByLayerId(canvas, layerId);
    if (object?.selectable) {
      canvas.setActiveObject(object);
    } else {
      canvas.discardActiveObject();
    }
    canvas.requestRenderAll();
  }

  async function loadJson() {
    setBusy(true);
    try {
      const next = deserializeDesignDocument(jsonDraft);
      validateAvailableAssets(next, assetUrlsRef.current);
      await commitAndRender(next);
      setStatus("设计 JSON 已校验并加载到 Fabric.js 画布。");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function downloadJson() {
    if (!documentRef.current) return;
    const blob = new Blob([serializeDesignDocument(documentRef.current)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `design-${projectId.replace(/[^A-Za-z0-9_-]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("设计 JSON 已下载。");
  }

  async function saveVersion() {
    if (!documentRef.current) return;
    setBusy(true);
    setStatus("正在校验并保存不可变设计版本…");
    try {
      const response = await fetch(`/api/projects/${projectId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: documentRef.current }),
      });
      const payload = await readApiResponse<{ version: SavedVersion }>(response);
      setStatus(`设计版本 V${payload.version.versionNumber} 已保存。`);
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const prerequisitesReady = Boolean(document && data);
  const generationActive = isGenerationJobActive(generationJob);

  return (
    <section className="panel design-editor-panel">
      <div className="section-heading editor-heading">
        <div>
          <p className="eyebrow">Fabric.js 分层编辑器</p>
          <h2>设计文档 V1</h2>
          <p className="editor-summary">
            商品像素始终来自上传资产；切换 AI 背景只替换背景引用。
          </p>
        </div>
        <div className="editor-toolbar">
          <button
            type="button"
            className="secondary-button"
            disabled={!historyState.canUndo || busy}
            onClick={() => void undo()}
          >
            撤销
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!historyState.canRedo || busy}
            onClick={() => void redo()}
          >
            重做
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!prerequisitesReady || busy}
            onClick={() => void addTextLayer()}
          >
            添加文字
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!prerequisitesReady || busy}
            onClick={() => void addDecorationLayer()}
          >
            添加装饰
          </button>
          <button
            type="button"
            className="primary-button inline-button"
            disabled={!prerequisitesReady || busy}
            onClick={() => void saveVersion()}
          >
            {busy ? "处理中…" : "保存设计版本"}
          </button>
        </div>
      </div>

      {data && document && (
        <div className="generation-flow-panel">
          <div className="generation-flow-actions">
            <div>
              <strong>AI 商品主图生成</strong>
              <p>
                使用当前 StyleSpec revision、商品图和视觉参考图创建 800×800 异步任务。
              </p>
            </div>
            <button
              type="button"
              className="primary-button inline-button"
              disabled={generationSubmitting || generationActive}
              onClick={() => void createGenerationJob()}
            >
              {generationSubmitting
                ? "正在创建…"
                : generationActive
                  ? "生成处理中…"
                  : generationJob && generationJob.status !== "SUCCEEDED"
                    ? "重新生成"
                    : "生成 800×800 主图"}
            </button>
          </div>
          {generationJob && (
            <div className="generation-job-state" aria-live="polite">
              <span className={generationJobBadgeClass(generationJob.status)}>
                {generationJob.status}
              </span>
              <small>
                Provider: {generationJob.providerName ?? "待分配"} · 尝试 {generationJob.attemptCount}/
                {generationJob.maxAttempts}
              </small>
              <small>StyleSpec: {generationJob.styleSpecRevisionId ?? "未绑定"}</small>
              {generationJob.errorMessage && (
                <small className="job-error">
                  {generationJob.errorCode}: {generationJob.errorMessage}
                </small>
              )}
            </div>
          )}
        </div>
      )}

      {data && document && (
        <label className="background-picker">
          <span>AI 背景资产</span>
          <select
            value={selectedBackgroundId}
            disabled={busy}
            onChange={(event) => void switchBackground(event.target.value)}
          >
            <option value="">纯色画布（无 AI 背景）</option>
            {data.generations.filter((generation) => !generation.asset.sourceAssetId).map((generation, index) => (
              <option value={generation.asset.id} key={generation.id}>
                生成背景 {index + 1} · {generation.asset.width} × {generation.asset.height}
              </option>
            ))}
          </select>
          {data.generations.filter((generation) => !generation.asset.sourceAssetId).length === 0 && (
            <small>当前没有生成背景；启动 generation worker 后可创建任务。</small>
          )}
        </label>
      )}

      {data && data.generations.length > 0 && (
        <div className="generation-results" aria-label="生成结果">
          {data.generations.map((generation) => (
            <article className="generation-result-card" key={generation.id}>
              <Image
                src={generation.resultUrl}
                alt={generation.asset.sourceAssetId ? "已生成的商品主图" : "已生成的商品背景"}
                width={92}
                height={92}
                unoptimized
              />
              <div>
                <strong>
                  {generation.asset.sourceAssetId ? "商品主图" : "商品背景"} · {generation.providerName}
                </strong>
                <small>
                  {generation.asset.width} × {generation.asset.height} · StyleSpec {generation.styleSpecRevisionId}
                </small>
                <small>
                  {generation.status} · request {generation.requestId}
                </small>
                <small>
                  {generation.costMetadata.amount} {generation.costMetadata.currency}
                  {generation.costMetadata.estimated ? "（估算）" : ""}
                </small>
                {!generation.asset.sourceAssetId && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void loadGenerationIntoCanvas(generation)}
                  >
                    加载到画布
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="editor-layout">
        <div className="fabric-editor-stage" aria-label="设计画布">
          <canvas
            ref={canvasElementRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
          />
        </div>

        <aside className="layer-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-title">
              <strong>图层</strong>
              <span>{orderedLayers.length}/64</span>
            </div>
            <div className="layer-list">
              {orderedLayers.map((layer) => (
                <button
                  type="button"
                  className={`layer-item ${selectedLayerId === layer.id ? "selected" : ""}`}
                  key={layer.id}
                  onClick={() => selectLayer(layer.id)}
                >
                  <span>{formatLayerType(layer.type)}</span>
                  <small>
                    z{layer.zIndex} · {layer.visible ? "显示" : "隐藏"} · {layer.locked ? "锁定" : "可编辑"}
                  </small>
                </button>
              ))}
            </div>
          </div>

          {selectedLayer ? (
            <div className="sidebar-section inspector">
              <div className="sidebar-title">
                <strong>{formatLayerType(selectedLayer.type)}属性</strong>
                <span>{selectedLayer.id}</span>
              </div>
              <div className="inspector-grid">
                <NumberControl
                  label="X"
                  value={selectedLayer.x}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) => ({
                      ...layer,
                      x: value,
                    }))
                  }
                />
                <NumberControl
                  label="Y"
                  value={selectedLayer.y}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) => ({
                      ...layer,
                      y: value,
                    }))
                  }
                />
                <NumberControl
                  label="缩放 X"
                  value={selectedLayer.scaleX}
                  step={0.05}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) => ({
                      ...layer,
                      scaleX: value,
                    }))
                  }
                />
                <NumberControl
                  label="缩放 Y"
                  value={selectedLayer.scaleY}
                  step={0.05}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) => ({
                      ...layer,
                      scaleY: value,
                    }))
                  }
                />
                <NumberControl
                  label="旋转"
                  value={selectedLayer.rotation}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) => ({
                      ...layer,
                      rotation: value,
                    }))
                  }
                />
                <NumberControl
                  label="透明度"
                  value={selectedLayer.opacity}
                  step={0.05}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) => ({
                      ...layer,
                      opacity: value,
                    }))
                  }
                />
              </div>

              {selectedLayer.type === "TEXT" && (
                <TextInspector
                  layer={selectedLayer}
                  onChange={(next) =>
                    updateLayer(selectedLayer.id, () => next)
                  }
                />
              )}

              <div className="layer-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    updateLayer(selectedLayer.id, (layer) => ({
                      ...layer,
                      locked: !layer.locked,
                    }))
                  }
                >
                  {selectedLayer.locked ? "解锁" : "锁定"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    updateLayer(selectedLayer.id, (layer) => ({
                      ...layer,
                      visible: !layer.visible,
                    }))
                  }
                >
                  {selectedLayer.visible ? "隐藏" : "显示"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={selectedLayer.type === "AI_BACKGROUND"}
                  onClick={() => void moveSelectedLayer("UP")}
                >
                  上移
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={selectedLayer.type === "AI_BACKGROUND"}
                  onClick={() => void moveSelectedLayer("DOWN")}
                >
                  下移
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={selectedLayer.type === "PRODUCT"}
                  onClick={() => void deleteSelectedLayer()}
                >
                  删除
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">选择一个图层后编辑精确属性。</div>
          )}
        </aside>
      </div>

      <details className="design-json-panel">
        <summary>加载或下载设计 JSON</summary>
        <p>
          只接受 DesignDocument V1；未知字段、重复图层、非法商品/背景结构会被拒绝。
        </p>
        <textarea
          rows={16}
          spellCheck={false}
          value={jsonDraft}
          onChange={(event) => setJsonDraft(event.target.value)}
        />
        <div className="editor-toolbar">
          <button
            type="button"
            className="secondary-button"
            disabled={!document || busy}
            onClick={() =>
              document && setJsonDraft(serializeDesignDocument(document))
            }
          >
            刷新当前 JSON
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!document || busy}
            onClick={() => void loadJson()}
          >
            加载 JSON
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!document || busy}
            onClick={downloadJson}
          >
            下载设计 JSON
          </button>
        </div>
      </details>

      <p className="status editor-status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}

function TextInspector({
  layer,
  onChange,
}: {
  layer: TextLayer;
  onChange: (layer: TextLayer) => void;
}) {
  return (
    <div className="text-inspector">
      <label>
        <span>文字内容</span>
        <textarea
          rows={3}
          value={layer.text}
          onChange={(event) =>
            event.target.value && onChange({ ...layer, text: event.target.value })
          }
        />
      </label>
      <div className="inspector-grid">
        <NumberControl
          label="字号"
          value={layer.fontSize}
          onChange={(value) => onChange({ ...layer, fontSize: Math.round(value) })}
        />
        <label>
          <span>字体</span>
          <select
            value={layer.fontFamily}
            onChange={(event) =>
              onChange({
                ...layer,
                fontFamily: event.target.value as TextLayer["fontFamily"],
              })
            }
          >
            {(["Arial", "Helvetica", "Verdana", "Georgia"] as const).map(
              (font) => (
                <option key={font}>{font}</option>
              ),
            )}
          </select>
        </label>
        <label>
          <span>颜色</span>
          <input
            type="color"
            value={layer.color}
            onChange={(event) => onChange({ ...layer, color: event.target.value })}
          />
        </label>
        <label>
          <span>对齐</span>
          <select
            value={layer.textAlign}
            onChange={(event) =>
              onChange({
                ...layer,
                textAlign: event.target.value as TextLayer["textAlign"],
              })
            }
          >
            <option value="left">左对齐</option>
            <option value="center">居中</option>
            <option value="right">右对齐</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function NumberControl({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={roundForInput(value)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

async function fetchEditorData(
  projectId: string,
  signal: AbortSignal,
): Promise<EditorData> {
  const [projectResponse, generationResponse, styleResponse] = await Promise.all([
    fetch(`/api/projects/${projectId}`, { signal }),
    fetch(`/api/projects/${projectId}/generations`, { signal }),
    fetch(`/api/projects/${projectId}/style-spec`, { signal }),
  ]);
  const [{ project }, { generations }, styleSpec] = await Promise.all([
    readApiResponse<{ project: ProjectData }>(projectResponse),
    readApiResponse<{ generations: GenerationResultView[] }>(
      generationResponse,
    ),
    readApiResponse<StyleSpecState>(styleResponse),
  ]);

  return { project, generations, styleSpec };
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "请求失败，请稍后重试。");
  }
  return payload;
}

function validateAvailableAssets(
  document: DesignDocument,
  assetUrls: Map<string, string>,
) {
  for (const layer of document.layers) {
    if (
      (layer.type === "PRODUCT" || layer.type === "AI_BACKGROUND") &&
      !assetUrls.has(layer.sourceAssetId)
    ) {
      throw new Error(
        `${formatLayerType(layer.type)}引用的资产不可用或不属于当前项目。`,
      );
    }
  }
}

function reorderLayer(
  document: DesignDocument,
  layerId: string,
  direction: "UP" | "DOWN",
): DesignDocument {
  const background = document.layers.find(
    (layer) => layer.type === "AI_BACKGROUND",
  );
  const editable = document.layers
    .filter((layer) => layer.type !== "AI_BACKGROUND")
    .sort((left, right) => left.zIndex - right.zIndex);
  const index = editable.findIndex((layer) => layer.id === layerId);
  const target = direction === "UP" ? index + 1 : index - 1;
  if (index < 0 || target < 0 || target >= editable.length) return document;

  [editable[index], editable[target]] = [editable[target]!, editable[index]!];
  const layers = editable.map((layer, nextIndex) => ({
    ...layer,
    zIndex: (nextIndex + 1) * 10,
  }));

  return parseDesignDocument({
    ...document,
    layers: background ? [{ ...background, zIndex: 0 }, ...layers] : layers,
  });
}

function nextZIndex(document: DesignDocument): number {
  return Math.min(
    1000,
    Math.max(...document.layers.map((layer) => layer.zIndex), 0) + 10,
  );
}

function formatLayerType(type: DesignLayer["type"]): string {
  switch (type) {
    case "PRODUCT":
      return "商品层";
    case "AI_BACKGROUND":
      return "AI 背景层";
    case "TEXT":
      return "文字层";
    case "DECORATION":
      return "装饰层";
  }
}

function generationJobBadgeClass(
  status: GenerationJobView["status"],
): string {
  if (status === "SUCCEEDED") return "job-badge job-succeeded";
  if (status === "FAILED" || status === "CANCELED") {
    return "job-badge job-failed";
  }
  return "job-badge";
}

function roundForInput(value: number): number {
  return Math.round(value * 100) / 100;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "编辑器操作失败。";
}
