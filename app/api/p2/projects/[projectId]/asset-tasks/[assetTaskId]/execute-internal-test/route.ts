import { auth } from "@/auth";
import { createAuthJsP2PrincipalResolver } from "@/src/auth/authjs-principal-resolver";
import { createP2AssetTaskHttpHandlers } from "@/src/http/p2-asset-task-api";
import { getDatabaseClient } from "@/src/storage/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ projectId: string; assetTaskId: string }> }) {
  const database = getDatabaseClient();
  const principalResolver = createAuthJsP2PrincipalResolver({ database, readSession: () => auth() });
  const buildEvidence = { sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "", productVersion: "0.1.0" };
  return createP2AssetTaskHttpHandlers({ database, principalResolver, buildEvidence }).execute(request, context);
}
