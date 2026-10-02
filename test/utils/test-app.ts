import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Boots the real application (same wiring as production) for e2e tests.
 *
 * Listens on an ephemeral port rather than only calling `init()`. Supertest
 * starts its own throwaway listener for every request against a non-listening
 * server, which across hundreds of requests churns through sockets and
 * occasionally surfaces as a spurious "socket hang up". One listener per suite
 * avoids that.
 *
 * Always call `closeTestApp` in afterAll to close the server and the DB pool.
 */
export async function createTestApp(): Promise<TestContext> {
  const app = await createApp();
  await app.init();
  await app.listen(0);

  return { app, prisma: app.get(PrismaService) };
}

export async function closeTestApp(ctx: TestContext | undefined): Promise<void> {
  if (!ctx) return;
  await ctx.app.close();
}

/** Clears all tables between tests. Only usable with NODE_ENV=test. */
export async function resetDatabase(ctx: TestContext): Promise<void> {
  await ctx.prisma.truncateAllTables();
}
