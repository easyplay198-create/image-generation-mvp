import type { GenerationCostMetadata } from "@/src/providers/image-generation-provider";

export const GENERATION_JOB_ACTIVE_STATUSES = ["QUEUED", "RUNNING"] as const;
export const GENERATION_JOB_TERMINAL_STATUSES = [
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
] as const;

export type GenerationJobStatus =
  | (typeof GENERATION_JOB_ACTIVE_STATUSES)[number]
  | (typeof GENERATION_JOB_TERMINAL_STATUSES)[number];

export type GenerationJobView = {
  id: string;
  projectId: string;
  type: "IMAGE_GENERATION";
  status: GenerationJobStatus;
  attemptCount: number;
  maxAttempts: number;
  providerName: string | null;
  providerRequestId: string | null;
  styleSpecRevisionId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type GenerationResultView = {
  id: string;
  projectId: string;
  jobId: string;
  styleSpecRevisionId: string;
  status: "SUCCEEDED";
  resultUrl: string;
  providerName: string;
  providerRequestId: string;
  requestId: string;
  durationMs: number;
  costMetadata: GenerationCostMetadata;
  asset: {
    id: string;
    sourceAssetId: string | null;
    width: number;
    height: number;
    previewUrl: string;
  };
  createdAt: string;
};

export function formatGenerationCost(cost: GenerationCostMetadata): string {
  if (cost.status === "ESTIMATED") {
    return `${cost.amount} ${cost.currency}${cost.estimated ? "（估算）" : ""}`;
  }
  return cost.reason === "LEGACY_UNVERIFIED_COST"
    ? "历史零值记录，定价未核验"
    : "成本未知";
}

export function isGenerationJobActive(
  job: Pick<GenerationJobView, "status"> | null | undefined,
): boolean {
  return Boolean(
    job &&
      GENERATION_JOB_ACTIVE_STATUSES.includes(
        job.status as (typeof GENERATION_JOB_ACTIVE_STATUSES)[number],
      ),
  );
}

export function isGenerationJobTerminal(
  job: Pick<GenerationJobView, "status"> | null | undefined,
): boolean {
  return Boolean(
    job &&
      GENERATION_JOB_TERMINAL_STATUSES.includes(
        job.status as (typeof GENERATION_JOB_TERMINAL_STATUSES)[number],
      ),
  );
}

export function findGenerationForJob<T extends { jobId: string }>(
  generations: readonly T[],
  jobId: string,
): T | null {
  return generations.find((generation) => generation.jobId === jobId) ?? null;
}
