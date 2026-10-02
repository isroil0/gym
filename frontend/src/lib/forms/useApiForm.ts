'use client';

import { useCallback, useState } from 'react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api/errors';

/**
 * Turns a rejected API call into something the form can show.
 *
 * Field-level problems are attached to the inputs the backend named, so the
 * reader sees the error where they made it. Anything else becomes one message
 * above the buttons. The translated text for a known error code is preferred
 * over the server's English prose.
 */
export function useFormErrorHandler<T extends FieldValues>(form: UseFormReturn<T>) {
  const te = useTranslations('errors');
  const [formError, setFormError] = useState<string | null>(null);

  const clearFormError = useCallback(() => setFormError(null), []);

  const handleError = useCallback(
    (error: unknown): void => {
      if (!(error instanceof ApiError)) {
        setFormError(te('generic'));
        return;
      }

      const fieldErrors = error.fieldErrors;
      const fields = Object.keys(fieldErrors);

      if (fields.length > 0) {
        let attached = 0;
        for (const field of fields) {
          // Only claim a field the form actually has; otherwise the message
          // would be attached to nothing and silently disappear.
          if (field in form.getValues()) {
            form.setError(field as Path<T>, { type: 'server', message: fieldErrors[field] });
            attached += 1;
          }
        }
        if (attached > 0) {
          setFormError(null);
          form.setFocus(fields[0] as Path<T>, { shouldSelect: true });
          return;
        }
      }

      setFormError(translate(error, te));
    },
    [form, te],
  );

  return { formError, setFormError, clearFormError, handleError };
}

/** The best message available for an API failure, in the reader's language. */
export function translate(
  error: ApiError,
  te: (key: string, values?: Record<string, string | number>) => string,
): string {
  const key = `codes.${error.code}`;
  const translated = te(key);
  // next-intl returns the key path when a message is missing; fall back to
  // whatever the server said rather than printing "errors.codes.X".
  if (translated && !translated.endsWith(key)) return translated;
  return error.message || te('generic');
}

/** The same translation, for callers outside a form. */
export function useApiErrorMessage() {
  const te = useTranslations('errors');
  return useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        // A business-rule refusal carries the specific reason in details;
        // that is far more useful than the generic category message.
        if (error.status === 422 && error.reason) return error.reason;
        return translate(error, te);
      }
      return te('generic');
    },
    [te],
  );
}
