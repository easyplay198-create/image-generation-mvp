export type VisionAsset = {
  id: string;
  kind: "PRODUCT" | "REFERENCE";
  width: number;
  height: number;
  previewUrl: string;
};

export type VisionProject = {
  id: string;
  name: string;
  productName: string;
  category: string;
  sellingPoints: string[];
  targetAudience: string | null;
  forbiddenClaims: string[];
  assets: VisionAsset[];
};

export type VisionStyleSpec = {
  revisionNumber: number;
  spec: Record<string, unknown>;
} | null;

export type VisionGeneration = {
  id: string;
  jobId: string;
  status: "SUCCEEDED";
  providerName: string;
  resultUrl: string;
  createdAt: string;
  asset: {
    id: string;
    width: number;
    height: number;
    previewUrl: string;
  };
};

export type VisionWorkspaceData = {
  project: VisionProject;
  styleSpec: VisionStyleSpec;
  generations: VisionGeneration[];
  dataSourceStatus: "CONNECTED" | "PARTIAL" | "DEMO_ONLY";
  unavailableContracts: string[];
};

const DEMO_ASSET_URL = "/ai-vision-v4/mu-006-l-source.png";

export async function loadVisionWorkspaceData(
  projectId: string,
  signal?: AbortSignal,
): Promise<VisionWorkspaceData> {
  const [projectResult, styleSpecResult, generationsResult] =
    await Promise.allSettled([
      fetchProject(projectId, signal),
      fetchStyleSpec(projectId, signal),
      fetchGenerations(projectId, signal),
    ]);

  const project =
    projectResult.status === "fulfilled"
      ? projectResult.value
      : createDemoProject(projectId);
  const styleSpec =
    styleSpecResult.status === "fulfilled" ? styleSpecResult.value : null;
  const generations =
    generationsResult.status === "fulfilled" ? generationsResult.value : [];
  const successfulReads = [
    projectResult,
    styleSpecResult,
    generationsResult,
  ].filter((result) => result.status === "fulfilled").length;

  return {
    project,
    styleSpec,
    generations,
    dataSourceStatus:
      successfulReads === 3
        ? "CONNECTED"
        : successfulReads === 0
          ? "DEMO_ONLY"
          : "PARTIAL",
    unavailableContracts: [
      "Gate A/B/C authority",
      "UI_GUARD_COMPILE / ExecutionPackage",
      "platform rule version",
      "production approval",
    ],
  };
}

export function getProductAsset(data: VisionWorkspaceData): VisionAsset {
  return (
    data.project.assets.find((asset) => asset.kind === "PRODUCT") ??
    createDemoProject(data.project.id).assets[0]!
  );
}

export function getCandidateImages(data: VisionWorkspaceData): string[] {
  const images = data.generations
    .map((generation) => generation.asset.previewUrl)
    .filter(Boolean)
    .slice(0, 3);

  while (images.length < 3) images.push(getProductAsset(data).previewUrl);
  return images;
}

async function fetchProject(
  projectId: string,
  signal?: AbortSignal,
): Promise<VisionProject> {
  const payload = await readApiResponse<{ project: unknown }>(
    `/api/projects/${encodeURIComponent(projectId)}`,
    signal,
  );
  return parseProject(payload.project);
}

async function fetchStyleSpec(
  projectId: string,
  signal?: AbortSignal,
): Promise<VisionStyleSpec> {
  const payload = await readApiResponse<{ styleSpec: unknown }>(
    `/api/projects/${encodeURIComponent(projectId)}/style-spec`,
    signal,
  );
  if (!isRecord(payload.styleSpec)) return null;
  const revision = payload.styleSpec.latestRevision;
  if (!isRecord(revision) || !isRecord(revision.spec)) return null;

  return {
    revisionNumber: readNumber(revision.revisionNumber, 0),
    spec: revision.spec,
  };
}

async function fetchGenerations(
  projectId: string,
  signal?: AbortSignal,
): Promise<VisionGeneration[]> {
  const payload = await readApiResponse<{ generations: unknown }>(
    `/api/projects/${encodeURIComponent(projectId)}/generations`,
    signal,
  );
  if (!Array.isArray(payload.generations)) return [];

  return payload.generations.flatMap((candidate) => {
    if (!isRecord(candidate) || !isRecord(candidate.asset)) return [];
    const previewUrl = readString(candidate.asset.previewUrl);
    if (!previewUrl) return [];

    return [
      {
        id: readString(candidate.id) || crypto.randomUUID(),
        jobId: readString(candidate.jobId),
        status: "SUCCEEDED" as const,
        providerName: readString(candidate.providerName) || "unknown",
        resultUrl: readString(candidate.resultUrl),
        createdAt: readString(candidate.createdAt),
        asset: {
          id: readString(candidate.asset.id),
          width: readNumber(candidate.asset.width, 800),
          height: readNumber(candidate.asset.height, 800),
          previewUrl,
        },
      },
    ];
  });
}

async function readApiResponse<Payload>(
  url: string,
  signal?: AbortSignal,
): Promise<Payload> {
  const response = await fetch(url, { cache: "no-store", signal });
  const payload = (await response.json()) as Payload & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `读取失败：${response.status}`);
  }
  return payload;
}

function parseProject(input: unknown): VisionProject {
  if (!isRecord(input)) throw new Error("项目响应格式无效。");
  const assets = Array.isArray(input.assets)
    ? input.assets.flatMap((asset) => parseAsset(asset))
    : [];

  return {
    id: readString(input.id),
    name: readString(input.name) || "未命名项目",
    productName: readString(input.productName) || "未命名商品",
    category: readString(input.category) || "未分类",
    sellingPoints: readStringArray(input.sellingPoints),
    targetAudience: readString(input.targetAudience) || null,
    forbiddenClaims: readStringArray(input.forbiddenClaims),
    assets,
  };
}

function parseAsset(input: unknown): VisionAsset[] {
  if (!isRecord(input)) return [];
  const kind = input.kind;
  const previewUrl = readString(input.previewUrl);
  if ((kind !== "PRODUCT" && kind !== "REFERENCE") || !previewUrl) return [];

  return [
    {
      id: readString(input.id),
      kind,
      width: readNumber(input.width, 800),
      height: readNumber(input.height, 800),
      previewUrl,
    },
  ];
}

function createDemoProject(projectId: string): VisionProject {
  return {
    id: projectId,
    name: "MU-006-L 视觉验证",
    productName: "MU-006-L",
    category: "汽车应急电源",
    sellingPoints: ["商品主体优先", "保持屏幕与按键关系"],
    targetAudience: null,
    forbiddenClaims: ["未经证实的性能数值", "未经核验的平台合规声明"],
    assets: [
      {
        id: "demo-source",
        kind: "PRODUCT",
        width: 1440,
        height: 900,
        previewUrl: DEMO_ASSET_URL,
      },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}
