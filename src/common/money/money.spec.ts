import { Prisma } from '@prisma/client';
import {
  ZERO,
  atLeastZero,
  format,
  isNegative,
  isPositive,
  isZero,
  money,
  percentOf,
  round2,
  sum,
} from './money';

describe('money', () => {
  it('accepts numbers, strings and decimals', () => {
    expect(format(money(10))).toBe('10.00');
    expect(format(money('10.5'))).toBe('10.50');
    expect(format(money(new Prisma.Decimal('10.555')))).toBe('10.56');
  });

  it('passes an existing decimal through without copying', () => {
    const original = new Prisma.Decimal('1.23');
    expect(money(original)).toBe(original);
  });
});

describe('sum', () => {
  it('adds without binary floating point error', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE754; it must here.
    expect(format(sum(['0.1', '0.2']))).toBe('0.30');
  });

  it('sums a realistic set of payments exactly', () => {
    expect(format(sum(['49.99', '34.99', '10.00', '129.99']))).toBe('224.97');
  });

  it('is zero for an empty list', () => {
    expect(format(sum([]))).toBe('0.00');
  });

  it('handles negatives', () => {
    expect(format(sum(['100.00', '-30.50']))).toBe('69.50');
  });

  it('stays exact over many small amounts', () => {
    expect(format(sum(Array.from({ length: 100 }, () => '0.01')))).toBe('1.00');
  });
});

describe('format', () => {
  it.each([
    [0, '0.00'],
    [5, '5.00'],
    ['49.9', '49.90'],
    ['49.999', '50.00'],
    ['-12.5', '-12.50'],
    ['1000000', '1000000.00'],
  ])('formats %s as %s', (input, expected) => {
    expect(format(input)).toBe(expected);
  });
});

describe('round2', () => {
  it('rounds half away from zero', () => {
    expect(format(round2('0.005'))).toBe('0.01');
    expect(format(round2('2.345'))).toBe('2.35');
  });

  it('leaves exact cents alone', () => {
    expect(format(round2('2.34'))).toBe('2.34');
  });
});

describe('predicates', () => {
  it('classifies sign', () => {
    expect(isZero(ZERO)).toBe(true);
    expect(isPositive(money('0.01'))).toBe(true);
    expect(isPositive(ZERO)).toBe(false);
    expect(isNegative(money('-0.01'))).toBe(true);
    expect(isNegative(ZERO)).toBe(false);
  });
});

describe('atLeastZero', () => {
  it('clamps a credit balance to nil debt', () => {
    expect(format(atLeastZero(money('-25.00')))).toBe('0.00');
  });

  it('leaves a real debt untouched', () => {
    expect(format(atLeastZero(money('25.00')))).toBe('25.00');
  });
});

describe('percentOf', () => {
  it('computes a commission share', () => {
    expect(format(percentOf('1000.00', 15))).toBe('150.00');
  });

  it('rounds to whole cents', () => {
    expect(format(percentOf('49.99', 10))).toBe('5.00');
  });

  it('is zero for a zero rate', () => {
    expect(format(percentOf('49.99', 0))).toBe('0.00');
  });
});
