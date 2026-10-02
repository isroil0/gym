import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorDetail, ApiErrorResponse } from '../dto/api-error.dto';
import { PaginationMeta } from '../dto/pagination.dto';
import type { AppConfigService } from '../../config/configuration';

export const SWAGGER_TAGS = {
  health: 'Health',
  auth: 'Auth',
  users: 'Users',
  members: 'Members',
  trainers: 'Trainers',
  memberships: 'Memberships',
  payments: 'Payments',
  accounting: 'Accounting',
  attendance: 'Attendance',
  workouts: 'Workouts',
  reports: 'Reports',
  notifications: 'Notifications',
  settings: 'Settings',
} as const;

/**
 * Mounts OpenAPI docs at `${SWAGGER_PATH}` with the raw JSON at
 * `${SWAGGER_PATH}-json`. No-op when SWAGGER_ENABLED is false.
 */
export function setupSwagger(app: INestApplication, config: AppConfigService): void {
  if (!config.swaggerEnabled) return;

  const builder = new DocumentBuilder()
    .setTitle('Gym CRM API')
    .setDescription(
      'Backend API for gym management: members, trainers, memberships, payments, ' +
        'accounting, attendance, workouts and reporting.',
    )
    .setVersion(config.apiDefaultVersion)
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    );

  for (const tag of Object.values(SWAGGER_TAGS)) {
    builder.addTag(tag);
  }

  const document = SwaggerModule.createDocument(app, builder.build(), {
    extraModels: [ApiErrorResponse, ApiErrorDetail, PaginationMeta],
  });

  SwaggerModule.setup(config.swaggerPath, app, document, {
    jsonDocumentUrl: `${config.swaggerPath}-json`,
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', operationsSorter: 'alpha' },
    customSiteTitle: 'Gym CRM API Docs',
  });
}
