import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { ExpenseCategoriesService } from './expense-categories.service';
import { AccountingController } from './accounting.controller';

/**
 * Accounting module — the ledger: income, expenses, refunds, categories and
 * the revenue/profit totals (Phase 5).
 *
 * Deliberately depends on nothing else, so PaymentsModule can import it to
 * post entries inside its own transactions without a circular dependency.
 */
@Module({
  controllers: [AccountingController],
  providers: [AccountingService, ExpenseCategoriesService],
  exports: [AccountingService, ExpenseCategoriesService],
})
export class AccountingModule {}
