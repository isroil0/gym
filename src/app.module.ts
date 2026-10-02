import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { TimeModule } from './common/time/time.module';
import { HealthModule } from './health/health.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { buildLoggerOptions } from './common/logging/logger.config';
import { createValidationPipe } from './common/pipes/validation.pipe';

// Feature modules (shells until their phase is implemented).
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MembersModule } from './modules/members/members.module';
import { TrainersModule } from './modules/trainers/trainers.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { WorkoutsModule } from './modules/workouts/workouts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => buildLoggerOptions(config),
    }),
    // Rate limiting. Exactly one throttler is registered: a second named one
    // would be applied to every route as well, not only where it is named, so
    // the credential limit would throttle ordinary traffic too. Credential
    // endpoints instead tighten this one with @ThrottleCredentials().
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.rateLimitWindowSeconds * 1000,
            limit: config.rateLimitMax,
          },
        ],
      }),
    }),
    PrismaModule,
    TimeModule,
    HealthModule,

    AuthModule,
    UsersModule,
    MembersModule,
    TrainersModule,
    MembershipsModule,
    PaymentsModule,
    AccountingModule,
    AttendanceModule,
    WorkoutsModule,
    ReportsModule,
    NotificationsModule,
    AuditModule,
    SettingsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    // Registered before the auth guards so an unauthenticated flood is turned
    // away without touching the database.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
