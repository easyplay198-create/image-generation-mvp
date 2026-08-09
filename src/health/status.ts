type HealthCheck = () => Promise<void>;

type HealthChecks = {
  database: HealthCheck;
  objectStorage: HealthCheck;
};

async function getServiceStatus(check: HealthCheck) {
  try {
    await check();

    return { status: "ok" } as const;
  } catch {
    return { status: "unavailable" } as const;
  }
}

export async function getHealthStatus(checks: HealthChecks) {
  const [database, objectStorage] = await Promise.all([
    getServiceStatus(checks.database),
    getServiceStatus(checks.objectStorage),
  ]);
  const status =
    database.status === "ok" && objectStorage.status === "ok"
      ? "ok"
      : "degraded";

  return {
    status,
    services: {
      web: {
        status: "ok",
      },
      database,
      objectStorage,
    },
  };
}
