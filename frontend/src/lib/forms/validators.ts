import { z } from 'zod';

export type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Validation built around a translator.
 *
 * Zod messages are produced at schema-construction time, so the schema has to
 * be created where the language is known. Every screen therefore builds its
 * schema inside the component with `useTranslations('validation')`, and a
 * language switch rebuilds it with the new strings.
 */
export function validators(t: Translate) {
  const requiredText = (max = 255) =>
    z
      .string({ message: t('required') })
      .trim()
      .min(1, t('required'))
      .max(max, t('maxLength', { max }));

  const optionalText = (max = 255) =>
    z
      .string()
      .trim()
      .max(max, t('maxLength', { max }))
      .optional()
      .or(z.literal('')); 

  return {
    requiredText,
    optionalText,

    email: () =>
      z
        .string({ message: t('required') })
        .trim()
        .min(1, t('required'))
        .email(t('email'))
        .max(255, t('maxLength', { max: 255 })),

    /** Permissive on purpose: members give numbers in several formats. */
    phone: (required = false) => {
      const base = z
        .string()
        .trim()
        .regex(/^[+]?[\d\s()-]{6,20}$/, t('phone'));
      return required ? base.min(1, t('required')) : base.optional().or(z.literal(''));
    },

    /**
     * Mirrors the backend policy exactly: at least 10 characters, at most 128,
     * containing at least one letter and at least one number. Asking for more
     * than the server does would reject passwords the server would accept.
     */
    password: (min = 10) =>
      z
        .string({ message: t('required') })
        .min(min, t('passwordMin', { min }))
        .max(128, t('maxLength', { max: 128 }))
        .refine(
          (value) => /[a-zA-Z]/.test(value) && /\d/.test(value),
          t('passwordLetterAndDigit'),
        ),

    /**
     * Money as a string, never a float.
     *
     * The value travels to the backend exactly as typed so that 0.1 + 0.2
     * never becomes a problem anybody has to debug later.
     */
    money: (options: { min?: number; max?: number; required?: boolean } = {}) => {
      const { min = 0, max = 99_999_999, required = true } = options;
      const schema = z
        .string()
        .trim()
        .regex(/^\d+([.,]\d{1,2})?$/, t('invalidAmount'))
        .transform((value) => value.replace(',', '.'))
        .refine((value) => Number(value) >= min, t('min', { min }))
        .refine((value) => Number(value) <= max, t('amountTooLarge'));
      return required
        ? z.string().trim().min(1, t('required')).pipe(schema)
        : (schema.optional().or(z.literal('')) as unknown as typeof schema);
    },

    positiveInt: (options: { min?: number; max?: number } = {}) => {
      const { min = 1, max = 100_000 } = options;
      return z.coerce
        .number({ message: t('number') })
        .int(t('integer'))
        .min(min, t('min', { min }))
        .max(max, t('max', { max }));
    },

    nonNegativeNumber: (max = 100_000) =>
      z.coerce
        .number({ message: t('number') })
        .min(0, t('nonNegative'))
        .max(max, t('max', { max })),

    /** An ISO calendar date, the shape every date field on the backend takes. */
    isoDate: (required = true) => {
      const base = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('date'));
      return required ? base : base.optional().or(z.literal(''));
    },

    isoDateTime: (required = true) => {
      const base = z.string().min(1, t('required'));
      return required ? base : base.optional().or(z.literal(''));
    },

    uuid: (required = true) => {
      const base = z.string().uuid(t('selectOption'));
      return required ? base.min(1, t('required')) : base.optional().or(z.literal(''));
    },

    enumOf: <T extends readonly [string, ...string[]]>(values: T, required = true) => {
      const base = z.enum(values, { message: t('selectOption') });
      return required ? base : base.optional();
    },
  };
}

export type Validators = ReturnType<typeof validators>;

/** Confirm-password refinement, applied to an object schema. */
export function matchPasswords<T extends z.ZodTypeAny>(
  schema: T,
  t: Translate,
  fields: { password: string; confirm: string } = { password: 'newPassword', confirm: 'confirmPassword' },
) {
  return schema.refine(
    (value) =>
      (value as Record<string, unknown>)[fields.password] ===
      (value as Record<string, unknown>)[fields.confirm],
    { message: t('passwordsMustMatch'), path: [fields.confirm] },
  );
}

/**
 * Applies a sub-schema to one field only when a condition holds.
 *
 * Creating a member asks for an email and password; editing one does not,
 * because the backend's update endpoint accepts neither. Rather than building
 * two schemas with two inferred types — which makes every field name a cast —
 * the field stays optional in the type and is validated conditionally here.
 */
export function requiredWhen<T extends z.ZodRawShape>(
  shape: T,
  condition: boolean,
  fields: Record<string, z.ZodTypeAny>,
) {
  return z.object(shape).superRefine((value, ctx) => {
    if (!condition) return;
    for (const [name, schema] of Object.entries(fields)) {
      const result = schema.safeParse((value as Record<string, unknown>)[name] ?? '');
      if (!result.success) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: result.error.issues[0]?.message ?? 'Invalid',
        });
      }
    }
  });
}
