import { PrismaClient } from "@prisma/client";
// 與prisma做連結
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const prismaConnectivityErrorCodes = new Set(["P1001", "P1002"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPrismaConnectivityError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const prismaError = error as Error & { code?: string };
  if (prismaError.code && prismaConnectivityErrorCodes.has(prismaError.code)) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("can't reach database server") ||
    message.includes("connection") ||
    message.includes("timed out")
  );
}

export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    baseDelayMs?: number;
  },
): Promise<T> {
  const retries = options?.retries ?? 2;
  const baseDelayMs = options?.baseDelayMs ?? 250;

  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      const isLastAttempt = attempt >= retries;
      if (!isPrismaConnectivityError(error) || isLastAttempt) {
        throw error;
      }

      const delay = baseDelayMs * 2 ** attempt;
      await sleep(delay);
      attempt += 1;
    }
  }
}
