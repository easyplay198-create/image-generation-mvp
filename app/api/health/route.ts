import { assertServerEnvironment } from "@/src/config/environment";
import { getFoundationHealth } from "@/src/health/status";

export const dynamic = "force-dynamic";

export function GET() {
  assertServerEnvironment();

  return Response.json(getFoundationHealth());
}
