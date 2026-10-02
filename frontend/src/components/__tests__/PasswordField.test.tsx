import { describe, expect, it } from 'vitest';
import { scorePassword } from '@/components/forms/PasswordField';

describe('password strength', () => {
  it('scores anything below the backend policy as the weakest', () => {
    // The backend demands ten characters with a letter and a number. Showing
    // "fair" for something the server will reject would be a lie.
    expect(scorePassword('short1')).toBe(0);
    expect(scorePassword('allletters')).toBe(0);
    expect(scorePassword('1234567890')).toBe(0);
    expect(scorePassword('')).toBe(0);
  });

  it('scores a password that just meets the policy as acceptable', () => {
    expect(scorePassword('abcdefgh12')).toBeGreaterThan(0);
  });

  it('rewards length, mixed case and symbols', () => {
    const minimal = scorePassword('abcdefgh12');
    const longer = scorePassword('abcdefghijkl12');
    const mixed = scorePassword('Abcdefghijkl12!');
    expect(longer).toBeGreaterThanOrEqual(minimal);
    expect(mixed).toBeGreaterThan(minimal);
  });

  it('never exceeds the top of the scale', () => {
    expect(scorePassword('A'.repeat(40) + 'b1!')).toBeLessThanOrEqual(3);
  });
});
