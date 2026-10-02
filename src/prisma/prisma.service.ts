import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppConfigService } from '../config/configuration';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  private readonly slowQueryMs: number;

  constructor(config: AppConfigService) {
    super({
      datasources: { db: { url: config.databaseUrl } },
      // `query` is emitted as an event rather than printed, so only the slow
      // ones reach the log.
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    this.slowQueryMs = config.slowQueryMs;
  }

  async onModuleInit(): Promise<void> {
    this.watchSlowQueries();
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  /**
   * Warns about queries slower than SLOW_QUERY_MS.
   *
   * A standing tripwire rather than a one-off profiling exercise: a query that
   * degrades as the gym's data grows announces itself instead of waiting to be
   * noticed. Set the threshold to 0 to disable.
   */
  private watchSlowQueries(): void {
    if (this.slowQueryMs <= 0) return;

    // Prisma's event typing does not narrow by level, hence the cast.
    (
      this as unknown as {
        $on: (event: 'query', handler: (event: Prisma.QueryEvent) => void) => void;
      }
    ).$on('query', (event) => {
      if (event.duration < this.slowQueryMs) return;

      this.logger.warn(`Slow query (${event.duration}ms): ${event.query.slice(0, 300)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }

  /** Lightweight connectivity probe used by the health endpoint. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  /**
   * Truncates every application table. Test-helper only — refuses to run
   * outside NODE_ENV=test so it can never be fired at a real database.
   */
  async truncateAllTables(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('truncateAllTables() is only available when NODE_ENV=test');
    }

    const tables = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `;

    if (tables.length === 0) return;

    const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
    await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
  }
}
