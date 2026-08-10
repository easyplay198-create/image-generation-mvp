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
  costMetadata: {
    amount: string;
    currency: string;
    estimated: boolean;
  };
  asset: {
    id: string;
    width: number;
    height: number;
    previewUrl: string;
  };
  createdAt: string;
};

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
