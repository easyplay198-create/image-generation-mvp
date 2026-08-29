import { createP2TruthHttpHandlers } from "@/src/http/p2-truth-api";
import { getDatabaseClient } from "@/src/storage/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; truthRevisionId: string }> },
) {
  return createP2TruthHttpHandlers({ database: getDatabaseClient() }).activate(
    request,
    context,
  );
}
