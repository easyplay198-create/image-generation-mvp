import { auth } from "@/auth";
import { createAuthJsP2PrincipalResolver } from "@/src/auth/authjs-principal-resolver";
import { createP2AssetTaskHttpHandlers } from "@/src/http/p2-asset-task-api";
import { getDatabaseClient } from "@/src/storage/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ projectId: string; assetTaskId: string; artifactId: string; artifactRevisionId: string }> }) {
  const database = getDatabaseClient();
  const principalResolver = createAuthJsP2PrincipalResolver({ database, readSession: () => auth() });
  return createP2AssetTaskHttpHandlers({ database, principalResolver }).content(request, context);
}
