import { Transform } from 'class-transformer';

/**
 * Shared `class-transformer` normalizers, so the same input hygiene is applied
 * everywhere a value of that kind is accepted. Non-string input is passed
 * through untouched and left for the validator to reject.
 */

/** Trims surrounding whitespace. */
export const TrimString = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Trims and lower-cases — used for every email, which is stored lower-cased. */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
