import { createHash } from "node:crypto";

import { AssetKind, BenchmarkVariant } from "@/src/generated/prisma/client";

import type {
  BenchmarkAssetSnapshot,
  BenchmarkJobInput,
  CreateBenchmarkRunInput,
} from "@/src/benchmarks/benchmark-contract";
import { parseStoredGenerationUsage } from "@/src/domain/generated-background";
import { ApiError } from "@/src/http/api";
import { parseStyleSpecV1, StyleSpecValidationError } from "@/src/domain/style-spec";
import type { DatabaseClient } from "@/src/storage/database";
import { withTransaction } from "@/src/storage/database";
import type { ObjectStorage } from "@/src/storage/object-storage";

const OUTPUT_SIZE = 800;

export class BenchmarkService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly storage?: ObjectStorage,
  ) {}

  async createRun(input: {
    ownerId: string;
    projectId: string;
    request: CreateBenchmarkRunInput;
    providerName: string;
    modelName: string;
  }) {
    if (input.providerName !== "qwen") {
      throw new ApiError(
        "VALIDATION_FAILED",
        409,
        "Benchmark 仅允许使用当前已验收的 Qwen 模型。",
      );
    }

    const runId = await withTransaction(this.database, async (transaction) => {
      const lockedProjects = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Project"
        WHERE "id" = ${input.projectId} AND "ownerId" = ${input.ownerId}
        FOR UPDATE
      `;
      if (lockedProjects.length !== 1) throw projectNotFound();

      const duplicate = await transaction.benchmarkRun.findFirst({
        where: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          idempotencyKey: input.request.idempotencyKey,
        },
        select: { id: true },
      });
      if (duplicate) return duplicate.id;

      const project = await transaction.project.findFirst({
        where: { id: input.projectId, ownerId: input.ownerId },
        select: {
          productName: true,
          category: true,
          sellingPoints: true,
          targetAudience: true,
          forbiddenClaims: true,
        },
      });
      if (!project) throw projectNotFound();

      const revision = await transaction.styleSpecRevision.findFirst({
        where: {
          id: input.request.styleSpecRevisionId,
          ownerId: input.ownerId,
          projectId: input.projectId,
          revisionNumber: 2,
        },
      });
      if (!revision) {
        throw new ApiError(
          "STYLE_SPEC_INVALID",
          409,
          "Benchmark 必须明确使用 StyleSpec revision 2。",
        );
      }
      let styleSpec;
      try {
        styleSpec = parseStyleSpecV1(revision.specJson);
      } catch (error) {
        if (error instanceof StyleSpecValidationError) {
          throw new ApiError(
            "STYLE_SPEC_INVALID",
            409,
            "StyleSpec revision 2 未通过 Schema 校验。",
          );
        }
        throw error;
      }

      const product = await transaction.asset.findFirst({
        where: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          kind: AssetKind.PRODUCT,
        },
      });
      if (!product) {
        throw new ApiError(
          "PRODUCT_ASSET_REQUIRED",
          409,
          "Benchmark 必须绑定当前项目的商品图。",
        );
      }
      const references = await transaction.asset.findMany({
        where: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          kind: AssetKind.REFERENCE,
          NOT: { sha256: product.sha256 },
        },
        orderBy: { createdAt: "asc" },
      });
      const distinct = new Map<string, (typeof references)[number]>();
      for (const reference of references) {
        if (!distinct.has(reference.sha256)) distinct.set(reference.sha256, reference);
      }
      const visualReferences = [...distinct.values()].slice(0, 2);
      if (visualReferences.length === 0) {
        throw new ApiError(
          "REFERENCE_ASSET_REQUIRED",
          409,
          "StyleSpec 组至少需要一张与商品图不同的 Reference Image。",
        );
      }

      const productReference = toSnapshot(product);
      const referenceSnapshots = visualReferences.map(toSnapshot);
      const generationContext = {
        schemaVersion: "1.0" as const,
        styleSpecRevisionNumber: 2 as const,
        productReference,
        visualReferences: referenceSnapshots,
        canvas: { width: OUTPUT_SIZE as 800, height: OUTPUT_SIZE as 800 },
      };
      const experimentFingerprint = createExperimentFingerprint({
        fingerprintVersion: "2.0",
        experimentProtocol: "OBSERVATIONAL_NON_CAUSAL_SAMPLE_COMPARISON",
        variants: ["PLAIN_PROMPT", "STYLE_SPEC"],
        projectId: input.projectId,
        providerName: input.providerName,
        modelName: input.modelName,
        output: { width: OUTPUT_SIZE, height: OUTPUT_SIZE },
        plainPrompt: input.request.plainPrompt,
        productContext: project,
        productReference,
        visualReferences: referenceSnapshots,
        styleSpecRevisionId: revision.id,
        styleSpecRevisionNumber: revision.revisionNumber,
        styleSpec,
        generationContext,
      });
      const existingExperiment = await transaction.benchmarkRun.findFirst({
        where: {
          projectId: input.projectId,
          experimentFingerprint,
        },
        select: { id: true },
      });
      if (existingExperiment) return existingExperiment.id;

      const run = await transaction.benchmarkRun.create({
        data: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          idempotencyKey: input.request.idempotencyKey,
          experimentFingerprint,
          sku: project.productName,
          providerName: input.providerName,
          modelName: input.modelName,
          outputWidth: OUTPUT_SIZE,
          outputHeight: OUTPUT_SIZE,
          productAssetId: product.id,
          referenceAssetIds: visualReferences.map((asset) => asset.id),
          styleSpecRevisionId: revision.id,
          generationContextJson: generationContext,
        },
      });

      const shared = {
        schemaVersion: "1.0" as const,
        modelName: input.modelName,
        productReference,
        canvas: { width: OUTPUT_SIZE as 800, height: OUTPUT_SIZE as 800 },
      };
      const plainInput: BenchmarkJobInput = {
        ...shared,
        requestId: crypto.randomUUID(),
        variant: "PLAIN_PROMPT",
        prompt: input.request.plainPrompt,
      };
      const styleInput: BenchmarkJobInput = {
        ...shared,
        requestId: crypto.randomUUID(),
        variant: "STYLE_SPEC",
        styleSpecRevisionId: revision.id,
        styleSpecRevisionNumber: 2,
        productContext: project,
        visualReferences: referenceSnapshots,
        generationContext,
      };

      await transaction.benchmarkJob.createMany({
        data: [
          {
            ownerId: input.ownerId,
            projectId: input.projectId,
            benchmarkRunId: run.id,
            variant: BenchmarkVariant.PLAIN_PROMPT,
            inputJson: plainInput,
            providerName: input.providerName,
          },
          {
            ownerId: input.ownerId,
            projectId: input.projectId,
            benchmarkRunId: run.id,
            variant: BenchmarkVariant.STYLE_SPEC,
            inputJson: styleInput,
            providerName: input.providerName,
          },
        ],
      });

      return run.id;
    });

    return this.getRun(input.ownerId, input.projectId, runId);
  }

  async listRuns(
    ownerId: string,
    projectId: string,
    input: { limit: number; cursor?: string },
  ) {
    await this.assertProject(ownerId, projectId);
    const runs = await this.database.benchmarkRun.findMany({
      where: { ownerId, projectId },
      include: {
        jobs: {
          include: { result: { include: { asset: true } } },
          orderBy: { variant: "asc" },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor
        ? { cursor: { id: input.cursor }, skip: 1 }
        : {}),
    });
    const hasMore = runs.length > input.limit;
    const page = hasMore ? runs.slice(0, input.limit) : runs;
    return {
      benchmarks: page.map(toRunDto),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }

  async getRun(ownerId: string, projectId: string, runId: string) {
    const run = await this.database.benchmarkRun.findFirst({
      where: { id: runId, ownerId, projectId },
      include: {
        jobs: {
          include: { result: { include: { asset: true } } },
          orderBy: { variant: "asc" },
        },
      },
    });
    if (!run) throw new ApiError("GENERATION_NOT_FOUND", 404, "Benchmark Run 不存在或无权访问。");
    return toRunDto(run);
  }

  async getPreview(input: {
    ownerId: string;
    projectId: string;
    resultId: string;
  }) {
    if (!this.storage) throw new Error("Object storage is required for benchmark previews.");
    const result = await this.database.benchmarkResult.findFirst({
      where: {
        id: input.resultId,
        ownerId: input.ownerId,
        projectId: input.projectId,
      },
      include: { asset: true },
    });
    if (!result) throw new ApiError("GENERATION_NOT_FOUND", 404, "Benchmark Result 不存在或无权访问。");
    const object = await this.storage.getObject(result.asset.objectKey);
    return {
      body: object.body,
      mimeType: result.asset.mimeType,
      byteSize: Number(result.asset.byteSize),
    };
  }

  private async assertProject(ownerId: string, projectId: string) {
    const project = await this.database.project.findFirst({
      where: { id: projectId, ownerId },
      select: { id: true },
    });
    if (!project) throw projectNotFound();
  }
}

function toSnapshot(asset: {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: bigint;
  sha256: string;
}): BenchmarkAssetSnapshot {
  return {
    assetId: asset.id,
    mimeType: asset.mimeType as BenchmarkAssetSnapshot["mimeType"],
    width: asset.width,
    height: asset.height,
    byteSize: Number(asset.byteSize),
    sha256: asset.sha256,
  };
}

type RunWithJobs = Awaited<ReturnType<DatabaseClient["benchmarkRun"]["findFirst"]>> & {
  jobs: Array<{
    id: string;
    variant: "PLAIN_PROMPT" | "STYLE_SPEC";
    status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
    inputJson: unknown;
    providerName: string;
    providerRequestId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    result: null | {
      id: string;
      providerName: string;
      providerRequestId: string;
      requestId: string;
      durationMs: number;
      usageJson: unknown;
      costMetadataJson: unknown;
      createdAt: Date;
      asset: {
        id: string;
        sourceAssetId: string | null;
        mimeType: string;
        byteSize: bigint;
        width: number;
        height: number;
        sha256: string;
      };
    };
  }>;
};

function toRunDto(run: NonNullable<RunWithJobs>) {
  return {
    id: run.id,
    projectId: run.projectId,
    sku: run.sku,
    providerName: run.providerName,
    modelName: run.modelName,
    outputWidth: run.outputWidth,
    outputHeight: run.outputHeight,
    productAssetId: run.productAssetId,
    referenceAssetIds: run.referenceAssetIds,
    experimentProtocol: "OBSERVATIONAL_NON_CAUSAL_SAMPLE_COMPARISON" as const,
    styleSpecRevisionId: run.styleSpecRevisionId,
    generationContext: run.generationContextJson,
    createdAt: run.createdAt.toISOString(),
    jobs: run.jobs.map((job) => {
      const parsedInput = job.inputJson as BenchmarkJobInput;
      const normalized = job.result
        ? parseStoredGenerationUsage(
            job.result.usageJson,
            job.result.costMetadataJson,
            job.result.providerRequestId,
          )
        : null;
      return {
        id: job.id,
        variant: job.variant,
        status: job.status,
        input: parsedInput,
        providerName: job.providerName,
        providerRequestId: job.providerRequestId,
        errorCode: job.errorCode,
        errorMessage: toPublicBenchmarkError(job.errorCode),
        startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        createdAt: job.createdAt.toISOString(),
        result: job.result && normalized
          ? {
              id: job.result.id,
              providerName: job.result.providerName,
              providerRequestId: job.result.providerRequestId,
              requestId: job.result.requestId,
              durationMs: job.result.durationMs,
              usage: {
                generatedImages: normalized.generatedImages,
                inputUnits: normalized.inputUnits,
                outputPixels: normalized.outputPixels,
              },
              costMetadata: normalized.costMetadata,
              createdAt: job.result.createdAt.toISOString(),
              resultUrl: `/api/projects/${encodeURIComponent(run.projectId)}/benchmarks/results/${encodeURIComponent(job.result.id)}/preview`,
              asset: {
                id: job.result.asset.id,
                sourceAssetId: job.result.asset.sourceAssetId,
                mimeType: job.result.asset.mimeType,
                byteSize: Number(job.result.asset.byteSize),
                width: job.result.asset.width,
                height: job.result.asset.height,
                sha256: job.result.asset.sha256,
              },
            }
          : null,
      };
    }),
  };
}

export function createExperimentFingerprint(input: unknown): string {
  return createHash("sha256")
    .update(stableCanonicalSerialize(input))
    .digest("hex");
}

export function stableCanonicalSerialize(input: unknown): string {
  const serialized = JSON.stringify(toCanonicalJson(input));
  if (serialized === undefined) {
    throw new TypeError("Benchmark fingerprint input must be JSON-serializable.");
  }
  return serialized;
}

function toCanonicalJson(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(toCanonicalJson);
  if (input === null || typeof input !== "object") return input;

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      )
      .map(([key, value]) => [key, toCanonicalJson(value)]),
  );
}

function toPublicBenchmarkError(errorCode: string | null): string | null {
  if (!errorCode) return null;
  if (errorCode === "PROVIDER_SUBMISSION_AMBIGUOUS") {
    return "Provider 提交结果不明确；为避免重复计费，未自动重试。";
  }
  if (errorCode.startsWith("PROVIDER_")) {
    return "图片生成服务未完成该组样本。";
  }
  if (errorCode === "STORAGE_COMPENSATION_FAILED") {
    return "结果保存失败；补偿清理需要人工核查。";
  }
  return "Benchmark 任务未完成，请联系管理员并提供 Job ID。";
}

function projectNotFound() {
  return new ApiError("PROJECT_NOT_FOUND", 404, "商品项目不存在或无权访问。");
}
