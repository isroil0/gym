/**
 * Human-readable codes for profiles, derived from a database sequence rather
 * than a count, so two concurrent sign-ups can never produce the same code.
 */
const CODE_DIGITS = 6;

export function formatProfileCode(prefix: 'M' | 'T', sequentialNumber: number): string {
  return `${prefix}-${String(sequentialNumber).padStart(CODE_DIGITS, '0')}`;
}

export const memberCode = (memberNumber: number) => formatProfileCode('M', memberNumber);
export const trainerCode = (trainerNumber: number) => formatProfileCode('T', trainerNumber);
