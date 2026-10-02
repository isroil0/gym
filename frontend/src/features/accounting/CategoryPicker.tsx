'use client';

import { useTranslations } from 'next-intl';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import type { ExpenseCategory } from '@/lib/api/types';

/** Either an existing category or the name of one to create. */
interface Option {
  name: string;
  /** Absent when this is the "add what I just typed" row. */
  id?: string;
  isNew?: boolean;
}

const filter = createFilterOptions<Option>({ trim: true });

/**
 * Chooses the category an expense is filed under, or names a new one.
 *
 * The list is short and rarely changes, so it is filtered in the browser
 * rather than searched on the server. Typing a name that is not in the list
 * offers to add it, which is the point: a gym should not have to leave the
 * expense it is recording to go and create a category first.
 *
 * Nothing is created here. The dialog resolves the name when it saves, so
 * abandoning the form leaves no category behind.
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  label,
  addLabel,
  error,
  disabled = false,
}: {
  categories: ExpenseCategory[];
  /** The chosen name, existing or not. */
  value: string;
  onChange: (name: string) => void;
  label: string;
  /** Rendered for the "create this one" row; receives the typed name. */
  addLabel: (name: string) => string;
  error?: string;
  disabled?: boolean;
}) {
  const tc = useTranslations('common');
  const options: Option[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));
  const selected = options.find((option) => option.name === value) ?? (value ? { name: value } : null);

  return (
    <Autocomplete<Option, false, false, true>
      freeSolo
      selectOnFocus
      handleHomeEndKeys
      disabled={disabled}
      options={options}
      value={selected}
      noOptionsText={tc('states.noResults')}
      isOptionEqualToValue={(option, chosen) => option.name === chosen.name}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
      filterOptions={(all, params) => {
        const filtered = filter(all, params);
        const typed = params.inputValue.trim();
        // Only offer to add a name that is not already there, whatever case
        // it was typed in — near-duplicate categories help nobody.
        const exists = all.some((option) => option.name.toLowerCase() === typed.toLowerCase());
        if (typed && !exists) filtered.push({ name: typed, isNew: true });
        return filtered;
      }}
      renderOption={({ key, ...props }, option) => (
        <li key={key} {...props}>
          {option.isNew ? addLabel(option.name) : option.name}
        </li>
      )}
      onChange={(_event, chosen) => {
        if (chosen === null) return onChange('');
        onChange(typeof chosen === 'string' ? chosen.trim() : chosen.name);
      }}
      onInputChange={(_event, input, reason) => {
        // Typing is a choice too: a name never picked from the list must still
        // reach the form, or saving would silently drop it.
        if (reason === 'input') onChange(input);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required
          error={Boolean(error)}
          helperText={error}
        />
      )}
    />
  );
}
