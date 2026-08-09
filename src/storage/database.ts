import { PrismaPg } from "@prisma/adapter-pg";

import { getRequiredEnvironmentVariable } from "@/src/config/environment";
import {
  Prisma,
  PrismaClient,
} from "@/src/generated/prisma/client";

const globalDatabase = globalThis as unknown as {
  database?: PrismaClient;
};

export type DatabaseClient = PrismaClient;
export type TransactionClient = Prisma.TransactionClient;

export function createDatabaseClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}

export function getDatabaseClient(): PrismaClient {
  if (!globalDatabase.database) {
    globalDatabase.database = createDatabaseClient(
      getRequiredEnvironmentVariable("DATABASE_URL"),
    );
  }

  return globalDatabase.database;
}

export async function withTransaction<T>(
  database: PrismaClient,
  operation: (transaction: TransactionClient) => Promise<T>,
): Promise<T> {
  return database.$transaction(operation);
}

export async function checkDatabaseConnection(
  database: PrismaClient = getDatabaseClient(),
): Promise<void> {
  await database.$queryRaw`SELECT 1`;
}
