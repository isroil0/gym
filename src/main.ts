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
