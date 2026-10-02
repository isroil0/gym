import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

/**
 * Payments module — money received from members, refunds, and what is still
 * owed (Phase 5).
 *
 * Depends on AccountingModule so every payment posts its ledger entry in the
 * same transaction, and on MembersModule for the member-visibility rule.
 */
@Module({
  imports: [MembersModule, AccountingModule],
  controllers: [PaymentsController, BillingController],
  providers: [PaymentsService, BillingService],
  exports: [PaymentsService, BillingService],
})
export class PaymentsModule {}
