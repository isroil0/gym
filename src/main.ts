import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';
import { AppConfigService } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  await app.listen(config.port, '0.0.0.0');

  const baseUrl = `http://localhost:${config.port}`;
  logger.log(`Gym CRM API running in ${config.nodeEnv} mode`);
  // Stated plainly because the commonest deployment failure is listening on
  // a port the platform is not routing to. A host that assigns $PORT will
  // show its own number here; anything else means PORT was set by hand.
  logger.log(`Listening : 0.0.0.0:${config.port} (PORT=${process.env.PORT ?? 'unset, defaulted'})`);
  logger.log(`API      : ${baseUrl}/${config.apiPrefix}/v${config.apiDefaultVersion}`);
  logger.log(`Health   : ${baseUrl}/${config.apiPrefix}/health`);
  if (config.swaggerEnabled) {
    logger.log(`Swagger  : ${baseUrl}/${config.swaggerPath}`);
  }
}

void bootstrap().catch((error: unknown) => {
  // The Nest logger may not exist yet if config validation failed.
  console.error('Failed to start Gym CRM API:', error);
  process.exit(1);
});
