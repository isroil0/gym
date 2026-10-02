import { format } from '../../common/money/money';
import {
  SettlementStatus,
  aggregateSettlements,
  computeTotals,
  refundableAmount,
  settleCharge,
} from './billing-math';

describe('settleCharge', () => {
  it('reports an unpaid charge', () => {
    const s = settleCharge({ purchasePrice: '49.99' });

    expect(format(s.amountDue)).toBe('49.99');
    expect(format(s.amountPaid)).toBe('0.00');
    expect(format(s.outstanding)).toBe('49.99');
    expect(format(s.credit)).toBe('0.00');
    expect(s.status).toBe(SettlementStatus.UNPAID);
  });

  it('reports a fully paid charge', () => {
    const s = settleCharge({ purchasePrice: '49.99', payments: ['49.99'] });

    expect(format(s.balance)).toBe('0.00');
    expect(format(s.outstanding)).toBe('0.00');
    expect(s.status).toBe(SettlementStatus.PAID);
  });

  it('tracks a partial payment and the remaining debt', () => {
    const s = settleCharge({ purchasePrice: '100.00', payments: ['30.00'] });

    expect(format(s.outstanding)).toBe('70.00');
    expect(s.status).toBe(SettlementStatus.PARTIALLY_PAID);
  });

  it('adds up several partial payments exactly', () => {
    const s = settleCharge({
      purchasePrice: '100.00',
      payments: ['33.33', '33.33', '33.34'],
    });

    expect(format(s.amountPaid)).toBe('100.00');
    expect(format(s.outstanding)).toBe('0.00');
    expect(s.status).toBe(SettlementStatus.PAID);
  });

  it('applies a discount to what is owed', () => {
    const s = settleCharge({ purchasePrice: '100.00', discountAmount: '25.00' });

    expect(format(s.grossAmount)).toBe('100.00');
    expect(format(s.discountAmount)).toBe('25.00');
    expect(format(s.amountDue)).toBe('75.00');
    expect(format(s.outstanding)).toBe('75.00');
  });

  it('treats a fully discounted charge as settled, not unpaid', () => {
    const s = settleCharge({ purchasePrice: '100.00', discountAmount: '100.00' });

    expect(format(s.amountDue)).toBe('0.00');
    expect(s.status).toBe(SettlementStatus.PAID);
  });

  it('never lets a discount larger than the price become a liability', () => {
    const s = settleCharge({ purchasePrice: '50.00', discountAmount: '80.00' });

    expect(format(s.amountDue)).toBe('0.00');
    expect(format(s.outstanding)).toBe('0.00');
    expect(format(s.credit)).toBe('0.00');
  });

  it('reports an overpayment as credit, not negative debt', () => {
    const s = settleCharge({ purchasePrice: '50.00', payments: ['60.00'] });

    expect(format(s.balance)).toBe('-10.00');
    expect(format(s.outstanding)).toBe('0.00');
    expect(format(s.credit)).toBe('10.00');
    expect(s.status).toBe(SettlementStatus.OVERPAID);
  });

  it('brings the debt back when a payment is refunded', () => {
    const s = settleCharge({
      purchasePrice: '100.00',
      payments: ['100.00'],
      refunds: ['40.00'],
    });

    expect(format(s.netPaid)).toBe('60.00');
    expect(format(s.outstanding)).toBe('40.00');
    expect(s.status).toBe(SettlementStatus.PARTIALLY_PAID);
  });

  it('returns a fully refunded charge to unpaid', () => {
    const s = settleCharge({
      purchasePrice: '100.00',
      payments: ['100.00'],
      refunds: ['100.00'],
    });

    expect(format(s.netPaid)).toBe('0.00');
    expect(format(s.outstanding)).toBe('100.00');
    expect(s.status).toBe(SettlementStatus.UNPAID);
  });

  it('combines a discount, partial payments and a refund', () => {
    const s = settleCharge({
      purchasePrice: '200.00',
      discountAmount: '20.00',
      payments: ['100.00', '50.00'],
      refunds: ['30.00'],
    });

    expect(format(s.amountDue)).toBe('180.00');
    expect(format(s.amountPaid)).toBe('150.00');
    expect(format(s.amountRefunded)).toBe('30.00');
    expect(format(s.netPaid)).toBe('120.00');
    expect(format(s.outstanding)).toBe('60.00');
    expect(s.status).toBe(SettlementStatus.PARTIALLY_PAID);
  });

  it('does not accumulate floating point error on awkward amounts', () => {
    const s = settleCharge({
      purchasePrice: '0.30',
      payments: ['0.10', '0.20'],
    });

    expect(format(s.outstanding)).toBe('0.00');
    expect(s.status).toBe(SettlementStatus.PAID);
  });

  it('treats a refund that exceeds payments as a debt, never as credit', () => {
    const s = settleCharge({
      purchasePrice: '50.00',
      payments: ['50.00'],
      refunds: ['50.00'],
    });

    expect(format(s.credit)).toBe('0.00');
    expect(format(s.outstanding)).toBe('50.00');
  });
});

describe('refundableAmount', () => {
  it('is the whole payment when nothing has been refunded', () => {
    expect(format(refundableAmount('49.99', []))).toBe('49.99');
  });

  it('shrinks as partial refunds are issued', () => {
    expect(format(refundableAmount('100.00', ['30.00', '20.00']))).toBe('50.00');
  });

  it('is nil once the payment is fully refunded', () => {
    expect(format(refundableAmount('100.00', ['100.00']))).toBe('0.00');
  });

  it('never goes negative', () => {
    expect(format(refundableAmount('100.00', ['100.00', '10.00']))).toBe('0.00');
  });
});

describe('aggregateSettlements', () => {
  it('rolls several charges into one member position', () => {
    const totals = aggregateSettlements([
      settleCharge({ purchasePrice: '100.00', payments: ['100.00'] }),
      settleCharge({ purchasePrice: '50.00', payments: ['20.00'] }),
      settleCharge({ purchasePrice: '30.00', discountAmount: '30.00' }),
    ]);

    expect(format(totals.amountDue)).toBe('150.00');
    expect(format(totals.amountPaid)).toBe('120.00');
    expect(format(totals.outstanding)).toBe('30.00');
  });

  it('nets a credit on one charge against a debt on another', () => {
    const totals = aggregateSettlements([
      settleCharge({ purchasePrice: '50.00', payments: ['80.00'] }),
      settleCharge({ purchasePrice: '100.00', payments: ['0.00'] }),
    ]);

    expect(format(totals.balance)).toBe('70.00');
    expect(format(totals.outstanding)).toBe('70.00');
    expect(format(totals.credit)).toBe('0.00');
  });

  it('is all zeroes for a member with no charges', () => {
    const totals = aggregateSettlements([]);

    expect(format(totals.amountDue)).toBe('0.00');
    expect(format(totals.outstanding)).toBe('0.00');
  });
});

describe('computeTotals', () => {
  it('nets refunds out of revenue and subtracts expenses for profit', () => {
    const t = computeTotals({ income: '1000.00', refunds: '150.00', expenses: '400.00' });

    expect(format(t.revenue)).toBe('850.00');
    expect(format(t.profit)).toBe('450.00');
  });

  it('does not treat a refund as an operating expense', () => {
    const withRefund = computeTotals({ income: '100.00', refunds: '100.00', expenses: '0.00' });
    const asExpense = computeTotals({ income: '100.00', refunds: '0.00', expenses: '100.00' });

    // Profit matches, but revenue does not — which is the distinction.
    expect(format(withRefund.profit)).toBe(format(asExpense.profit));
    expect(format(withRefund.revenue)).toBe('0.00');
    expect(format(asExpense.revenue)).toBe('100.00');
  });

  it('reports a loss as a negative profit', () => {
    const t = computeTotals({ income: '100.00', refunds: '0.00', expenses: '250.00' });
    expect(format(t.profit)).toBe('-150.00');
  });

  it('is all zeroes for an empty period', () => {
    const t = computeTotals({ income: 0, refunds: 0, expenses: 0 });
    expect(format(t.profit)).toBe('0.00');
  });
});
