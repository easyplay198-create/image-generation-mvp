import { auth } from "@/auth";
import { createAuthJsP2PrincipalResolver } from "@/src/auth/authjs-principal-resolver";
import { createP2SourceSnapshotHttpHandlers } from "@/src/http/p2-source-snapshot-api";
import { getDatabaseClient } from "@/src/storage/database";
import { createS3ObjectStorage } from "@/src/storage/s3-object-storage";

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
  return createP2SourceSnapshotHttpHandlers({
    database,
    principalResolver,
    createObjectStorage: () => createS3ObjectStorage(),
  }).post(request, context);
}
