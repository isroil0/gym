import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { PaymentsModule } from '../payments/payments.module';
import { AccountingModule } from '../accounting/accounting.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { WorkoutsModule } from '../workouts/workouts.module';
import { DashboardsService } from './dashboards.service';
import { DashboardsController } from './dashboards.controller';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

/**
 * Reports module — dashboards and business reports (Phase 8).
 *
 * The integration layer, so it imports broadly. It deliberately reuses the
 * domain services for anything with a definition — revenue and profit from
 * AccountingService, debts from BillingService, membership status from
 * MembershipsService — rather than recomputing them from raw tables, so a
 * report can never contradict the records it summarises.
 */
@Module({
  imports: [
    MembersModule,
    MembershipsModule,
    PaymentsModule,
    AccountingModule,
    AttendanceModule,
    WorkoutsModule,
  ],
  controllers: [DashboardsController, ReportsController],
  providers: [DashboardsService, ReportsService],
  exports: [DashboardsService, ReportsService],
})
export class ReportsModule {}
