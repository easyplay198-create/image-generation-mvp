export function getFoundationHealth() {
  return {
    status: "degraded",
    services: {
      web: {
        status: "ok",
      },
      database: {
        status: "not_checked",
        detail: "Database connectivity is deferred to T-01.",
      },
      objectStorage: {
        status: "not_checked",
        detail: "Object-storage connectivity is deferred to T-01.",
      },
    },
  } as const;
}
