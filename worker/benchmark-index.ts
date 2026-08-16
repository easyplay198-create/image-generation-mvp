import "dotenv/config";

import { setTimeout as delay } from "node:timers/promises";

import { createPlainPromptQwenProvider } from "@/src/benchmarks/plain-prompt-qwen-provider";
import { assertServerEnvironment } from "@/src/config/environment";
import { createImageGenerationProvider } from "@/src/providers/image-generation-factory";
import { getDatabaseClient } from "@/src/storage/database";
import { createS3ObjectStorage } from "@/src/storage/s3-object-storage";
import { BenchmarkWorker } from "@/worker/benchmark-worker";

const IDLE_DELAY_MS = 1_000;

async function main() {
  assertServerEnvironment();
  const database = getDatabaseClient();
  const worker = new BenchmarkWorker(
    database,
    createS3ObjectStorage(),
    createImageGenerationProvider(),
    createPlainPromptQwenProvider(),
  );
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    while (!stopping) {
      if (!(await worker.runOnce())) await delay(IDLE_DELAY_MS);
    }
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      operation: "benchmark.worker.stop",
      error: error instanceof Error ? error.message : "Unknown error",
    }),
  );
  process.exitCode = 1;
});
