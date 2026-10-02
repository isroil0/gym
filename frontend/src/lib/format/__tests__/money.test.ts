import { describe, expect, it } from 'vitest';
import { addAmounts, formatAmount, formatMoney, isNegativeAmount } from '../money';

describe('money formatting', () => {
  it('formats a decimal string without going through a float', () => {
    // 1234567890123.45 cannot be represented exactly as a double. The string
    // must survive untouched.
    const formatted = formatAmount('1234567890123.45', 'en');
    expect(formatted.replace(/[\s ,]/g, '')).toBe('1234567890123.45');
  });

  it('keeps two decimals even when the backend sends a whole number', () => {
    expect(formatAmount('50', 'en')).toBe('50.00');
  });

  it('renders an em dash for a missing amount rather than NaN or 0', () => {
    expect(formatAmount(null, 'en')).toBe('—');
    expect(formatAmount(undefined, 'en')).toBe('—');
    expect(formatMoney('', 'en')).toBe('—');
  });

  it('uses each locale’s own separators', () => {
    const en = formatAmount('1234.50', 'en');
    const ru = formatAmount('1234.50', 'ru');
    expect(en).toContain('.');
    // Russian uses a comma for the decimal mark and a space for thousands.
    expect(ru).toContain(',');
    expect(ru).not.toBe(en);
  });

  it('includes the currency in the money form', () => {
    expect(formatMoney('49.99', 'en', { currency: 'USD' })).toContain('49.99');
    expect(formatMoney('49.99', 'en', { currency: 'USD' })).toMatch(/\$|USD/);
  });

  it('recognises a negative result', () => {
    expect(isNegativeAmount('-1100.02')).toBe(true);
    expect(isNegativeAmount('0.00')).toBe(false);
  });

  it('adds amounts without floating point drift', () => {
    // 0.1 + 0.2 is the canonical float trap.
    expect(addAmounts('0.10', '0.20')).toBe('0.30');
    expect(addAmounts('49.99', '49.99')).toBe('99.98');
    expect(addAmounts('99.98', '-1200.00')).toBe('-1100.02');
  });
});
