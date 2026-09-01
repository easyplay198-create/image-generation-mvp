import { auth } from "@/auth";
import { createAuthJsP2PrincipalResolver } from "@/src/auth/authjs-principal-resolver";
import { createP2ProductProjectHttpHandlers } from "@/src/http/p2-product-project-api";
import { getDatabaseClient } from "@/src/storage/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const database = getDatabaseClient();
  const principalResolver = createAuthJsP2PrincipalResolver({
    database,
    readSession: () => auth(),
  });
  return createP2ProductProjectHttpHandlers({
    database,
    principalResolver,
  }).post(request);
}
