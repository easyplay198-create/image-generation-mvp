import { describe, expect, it } from "vitest";

import {
  findGenerationForJob,
  isGenerationJobActive,
  isGenerationJobTerminal,
  type GenerationJobView,
} from "../../src/domain/generation-flow";

function job(status: GenerationJobView["status"]): GenerationJobView {
  return {
    id: "job-1",
    projectId: "project-1",
    type: "IMAGE_GENERATION",
    status,
    attemptCount: 0,
    maxAttempts: 2,
    providerName: "mock",
    providerRequestId: null,
    styleSpecRevisionId: "revision-1",
    errorCode: null,
    errorMessage: null,
  };
}

describe("generation flow state", () => {
  it.each(["QUEUED", "RUNNING"] as const)(
    "keeps polling an active %s job",
    (status) => {
      expect(isGenerationJobActive(job(status))).toBe(true);
      expect(isGenerationJobTerminal(job(status))).toBe(false);
    },
  );

  it.each(["SUCCEEDED", "FAILED", "CANCELED"] as const)(
    "stops polling a terminal %s job",
    (status) => {
      expect(isGenerationJobActive(job(status))).toBe(false);
      expect(isGenerationJobTerminal(job(status))).toBe(true);
    },
  );

  it("selects the persisted result associated with the completed job", () => {
    const generations = [{ jobId: "older" }, { jobId: "job-1" }];

    expect(findGenerationForJob(generations, "job-1")).toEqual({
      jobId: "job-1",
    });
    expect(findGenerationForJob(generations, "missing")).toBeNull();
  });
});
