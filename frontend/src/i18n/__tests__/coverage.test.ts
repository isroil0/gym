import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { LOCALES, type Locale } from '../config';
import { ALL_NAMESPACES } from '../messages';

const LOCALES_DIR = join(__dirname, '..', 'locales');

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function read(locale: Locale, namespace: string): Record<string, Json> {
  return JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${namespace}.json`), 'utf8'));
}

/** Every leaf path in a message bundle, e.g. "actions.save". */
function leafPaths(value: Json, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function leafEntries(value: Json, prefix = ''): Array<[string, Json]> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [[prefix, value]];
  return Object.entries(value).flatMap(([key, child]) =>
    leafEntries(child, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * The argument names an ICU message depends on. Parsed from the real AST
 * rather than matched with a regex: inside a plural, `{No results}` is literal
 * text, not a placeholder, and only a parser can tell the difference.
 */
function placeholdersOf(message: string): Set<string> {
  const found = new Set<string>();

  const walk = (elements: MessageFormatElement[]): void => {
    for (const element of elements) {
      switch (element.type) {
        case TYPE.argument:
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          found.add(element.value);
          break;
        case TYPE.select:
        case TYPE.plural:
          found.add(element.value);
          for (const option of Object.values(element.options)) walk(option.value);
          break;
        case TYPE.tag:
          walk(element.children);
          break;
        default:
          break;
      }
    }
  };

  walk(parse(message));
  return found;
}

/** The message with every {placeholder} removed, so only prose is left. */
function proseOf(message: string): string {
  return message.replace(/\{[^{}]*\}/g, '').replace(/[#×…·\-–—,.:;!?()%\s]/g, '');
}

describe('translation resources', () => {
  it('ships every namespace in every locale', () => {
    for (const locale of LOCALES) {
      const present = readdirSync(join(LOCALES_DIR, locale))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
        .sort();
      expect(present, `locale ${locale}`).toEqual([...ALL_NAMESPACES].sort());
    }
  });

  describe.each(ALL_NAMESPACES)('%s', (namespace) => {
    const english = read('en', namespace);
    const englishPaths = leafPaths(english).sort();

    it.each(LOCALES.filter((l) => l !== 'en'))('%s has exactly the English keys', (locale) => {
      const paths = leafPaths(read(locale, namespace)).sort();

      const missing = englishPaths.filter((p) => !paths.includes(p));
      const extra = paths.filter((p) => !englishPaths.includes(p));

      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it.each(LOCALES)('%s has no empty or placeholder-only values', (locale) => {
      const blank = leafEntries(read(locale, namespace))
        .filter(([, value]) => typeof value !== 'string' || value.trim().length === 0)
        .map(([path]) => path);

      expect(blank).toEqual([]);
    });

    it.each(LOCALES)('%s uses the same placeholders as English', (locale) => {
      const translated = Object.fromEntries(leafEntries(read(locale, namespace)));
      const mismatched: Array<{ key: string; expected: string[]; actual: string[] }> = [];

      for (const [key, value] of leafEntries(english)) {
        if (typeof value !== 'string') continue;
        const other = translated[key];
        if (typeof other !== 'string') continue;

        const expected = [...placeholdersOf(value)].sort();
        const actual = [...placeholdersOf(other)].sort();
        if (expected.join() !== actual.join()) mismatched.push({ key, expected, actual });
      }

      expect(mismatched).toEqual([]);
    });

    it.each(LOCALES)('%s compiles as valid ICU for its locale', (locale) => {
      const broken: Array<{ key: string; error: string }> = [];

      for (const [key, value] of leafEntries(read(locale, namespace))) {
        if (typeof value !== 'string') continue;
        try {
          new IntlMessageFormat(value, locale);
        } catch (error) {
          broken.push({ key, error: (error as Error).message });
        }
      }

      expect(broken).toEqual([]);
    });
  });

  it('never leaves a Cyrillic string in the Uzbek bundle', () => {
    // Uzbek here is Latin-only. A stray Cyrillic character almost always means
    // a Russian string was pasted into the wrong file.
    const offenders: string[] = [];
    for (const namespace of ALL_NAMESPACES) {
      for (const [key, value] of leafEntries(read('uz', namespace))) {
        if (typeof value === 'string' && /[Ѐ-ӿ]/.test(value)) {
          offenders.push(`${namespace}.${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never leaves an untranslated English string in Russian', () => {
    // Catches copy-paste: a Russian value identical to English, long enough
    // that it cannot be a brand name, a unit or a number.
    const suspects: string[] = [];
    for (const namespace of ALL_NAMESPACES) {
      const english = Object.fromEntries(leafEntries(read('en', namespace)));
      for (const [key, value] of leafEntries(read('ru', namespace))) {
        if (typeof value !== 'string' || typeof english[key] !== 'string') continue;
        // Format-only patterns such as "{sets} × {reps}" are identical in
        // every language by design; compare the prose, not the pattern.
        if (value.length > 12 && value === english[key] && /[a-zA-Z]{4}/.test(proseOf(value))) {
          suspects.push(`${namespace}.${key}`);
        }
      }
    }
    expect(suspects).toEqual([]);
  });

  it('declares Russian plurals with the categories Russian actually needs', () => {
    // Russian needs one/few/many. A bundle carrying only the English one/other
    // pair renders "5 дня" instead of "5 дней".
    const incomplete: string[] = [];
    for (const namespace of ALL_NAMESPACES) {
      for (const [key, value] of leafEntries(read('ru', namespace))) {
        if (typeof value !== 'string' || !value.includes(', plural,')) continue;
        const hasAll = ['one {', 'few {', 'many {'].every((c) => value.includes(c));
        if (!hasAll) incomplete.push(`${namespace}.${key}`);
      }
    }
    expect(incomplete).toEqual([]);
  });
});
