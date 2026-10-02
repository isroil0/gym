import { VersioningType, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfigService } from './config/configuration';
import { setupSwagger } from './common/swagger/swagger.setup';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

/**
 * Builds a fully configured application instance.
 * Shared by `main.ts` and the e2e test harness so both run identical wiring.
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(AppConfigService);

  // Registered before anything else so the correlation id exists by the time
  // the request logger, the controllers and the exception filter run.
  const requestId = new RequestIdMiddleware();
  app.use(requestId.use.bind(requestId));

  app.useLogger(app.get(PinoLogger));
  app.flushLogs();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix(config.apiPrefix, {
    exclude: [config.swaggerPath, `${config.swaggerPath}-json`],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: config.apiDefaultVersion,
  });
  app.enableShutdownHooks();

  setupSwagger(app, config);

  return app;
}
