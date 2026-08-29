import { createP2TruthHttpHandlers } from "@/src/http/p2-truth-api";
import { getDatabaseClient } from "@/src/storage/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; truthRevisionId: string }> },
) {
  return createP2TruthHttpHandlers({ database: getDatabaseClient() }).get(
    request,
    context,
  );
}
