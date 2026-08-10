import "dotenv/config";

import { setTimeout as delay } from "node:timers/promises";

import { assertServerEnvironment } from "@/src/config/environment";
import { createStyleAnalyzerProvider } from "@/src/providers/style-analyzer-factory";
import { getDatabaseClient } from "@/src/storage/database";
import { createS3ObjectStorage } from "@/src/storage/s3-object-storage";
import { StyleAnalysisWorker } from "@/worker/style-analysis-worker";

const IDLE_DELAY_MS = 1_000;

async function main() {
  assertServerEnvironment();

  const database = getDatabaseClient();
  const provider = createStyleAnalyzerProvider();
  const worker = new StyleAnalysisWorker(
    database,
    createS3ObjectStorage(),
    provider,
  );
  let stopping = false;

  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      operation: "style-analysis.worker.start",
      result: "ready",
      providerName: provider.name,
    }),
  );

  try {
    while (!stopping) {
      const processed = await worker.runOnce();
      if (!processed) await delay(IDLE_DELAY_MS);
    }
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      operation: "style-analysis.worker.stop",
      result: "failed",
      errorCode: "WORKER_FATAL",
      message: error instanceof Error ? error.message : "Unknown worker error",
    }),
  );
  process.exitCode = 1;
});
