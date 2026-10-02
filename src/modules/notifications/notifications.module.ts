import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

/**
 * Notifications module — in-app messages and the reminder sweep (Phase 9).
 *
 * Reminder amounts come from BillingService, so a reminder can never quote a
 * figure that disagrees with the unpaid-balances report.
 */
@Module({
  imports: [PaymentsModule, MembershipsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
