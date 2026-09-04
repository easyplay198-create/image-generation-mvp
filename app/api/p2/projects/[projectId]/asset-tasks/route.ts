import { auth } from "@/auth";
import { createAuthJsP2PrincipalResolver } from "@/src/auth/authjs-principal-resolver";
import { createP2AssetTaskHttpHandlers } from "@/src/http/p2-asset-task-api";
import { getDatabaseClient } from "@/src/storage/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const database = getDatabaseClient();
  const principalResolver = createAuthJsP2PrincipalResolver({
    database,
    readSession: () => auth(),
  });
  return createP2AssetTaskHttpHandlers({ database, principalResolver }).post(
    request,
    context,
  );
}
