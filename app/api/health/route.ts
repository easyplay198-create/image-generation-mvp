import { assertServerEnvironment } from "@/src/config/environment";
import { getHealthStatus } from "@/src/health/status";
import {
  checkDatabaseConnection,
  getDatabaseClient,
} from "@/src/storage/database";
import { createS3ObjectStorage } from "@/src/storage/s3-object-storage";

export const dynamic = "force-dynamic";

export async function GET() {
  assertServerEnvironment();
  const database = getDatabaseClient();
  const objectStorage = createS3ObjectStorage();
  const health = await getHealthStatus({
    database: () => checkDatabaseConnection(database),
    objectStorage: () => objectStorage.checkConnection(),
  });

  return Response.json(health, {
    status: health.status === "ok" ? 200 : 503,
  });
}
