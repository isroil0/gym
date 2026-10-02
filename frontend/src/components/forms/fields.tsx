'use client';

import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Checkbox from '@mui/material/Checkbox';
import InputAdornment from '@mui/material/InputAdornment';
import FormHelperText from '@mui/material/FormHelperText';
import Box from '@mui/material/Box';
import { CURRENCY } from '@/lib/format/money';

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  fullWidth?: boolean;
}

/** A text input bound to react-hook-form, showing its own validation message. */
export function TextInput<T extends FieldValues>({
  control,
  name,
  label,
  helperText,
  required,
  disabled,
  autoFocus,
  placeholder,
  fullWidth = true,
  multiline,
  rows,
  type = 'text',
  ...rest
}: BaseProps<T> & {
  multiline?: boolean;
  rows?: number;
  type?: string;
} & Omit<TextFieldProps, 'name' | 'control' | 'label' | 'type'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          label={label}
          type={type}
          required={required}
          disabled={disabled || field.disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          fullWidth={fullWidth}
          multiline={multiline}
          rows={rows}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helperText}
          {...rest}
        />
      )}
    />
  );
}

/**
 * Money input.
 *
 * Holds a string, not a number: typing "10." must not become 10, and the
 * value posted must be the digits the person entered.
 */
export function MoneyInput<T extends FieldValues>({
  control,
  name,
  label,
  helperText,
  required,
  disabled,
  autoFocus,
  fullWidth = true,
  currency = CURRENCY,
}: BaseProps<T> & { currency?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          onChange={(event) => {
            // Accept digits and one separator; reject everything else as it
            // is typed so the field can never hold something unpostable.
            const next = event.target.value.replace(/[^\d.,]/g, '');
            field.onChange(next);
          }}
          label={label}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          fullWidth={fullWidth}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helperText}
          slotProps={{
            htmlInput: { inputMode: 'decimal', className: 'tabular', autoComplete: 'off' },
            input: {
              endAdornment: <InputAdornment position="end">{currency}</InputAdornment>,
            },
          }}
        />
      )}
    />
  );
}

export function NumberInput<T extends FieldValues>({
  control,
  name,
  label,
  helperText,
  required,
  disabled,
  fullWidth = true,
  min,
  max,
  step = 1,
  suffix,
}: BaseProps<T> & { min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          onChange={(event) => {
            const raw = event.target.value;
            field.onChange(raw === '' ? '' : raw);
          }}
          label={label}
          type="number"
          required={required}
          disabled={disabled}
          fullWidth={fullWidth}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helperText}
          slotProps={{
            htmlInput: { min, max, step, inputMode: 'numeric', className: 'tabular' },
            input: suffix
              ? { endAdornment: <InputAdornment position="end">{suffix}</InputAdornment> }
              : undefined,
          }}
        />
      )}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Secondary line, e.g. a member code under a name. */
  description?: string;
}

export function SelectInput<T extends FieldValues>({
  control,
  name,
  label,
  options,
  helperText,
  required,
  disabled,
  fullWidth = true,
  emptyLabel,
}: BaseProps<T> & { options: SelectOption[]; emptyLabel?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          select
          label={label}
          required={required}
          disabled={disabled}
          fullWidth={fullWidth}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helperText}
        >
          {emptyLabel ? (
            <MenuItem value="">
              <em>{emptyLabel}</em>
            </MenuItem>
          ) : null}
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value} disabled={option.disabled}>
              <Box>
                <Box component="span">{option.label}</Box>
                {option.description ? (
                  <Box
                    component="span"
                    sx={{ display: 'block', fontSize: '0.75rem', color: 'text.secondary' }}
                  >
                    {option.description}
                  </Box>
                ) : null}
              </Box>
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
}

export function DateInput<T extends FieldValues>({
  control,
  name,
  label,
  helperText,
  required,
  disabled,
  fullWidth = true,
  min,
  max,
}: BaseProps<T> & { min?: string; max?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          label={label}
          type="date"
          required={required}
          disabled={disabled}
          fullWidth={fullWidth}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helperText}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min, max } }}
        />
      )}
    />
  );
}

export function DateTimeInput<T extends FieldValues>({
  control,
  name,
  label,
  helperText,
  required,
  disabled,
  fullWidth = true,
}: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          label={label}
          type="datetime-local"
          required={required}
          disabled={disabled}
          fullWidth={fullWidth}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helperText}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      )}
    />
  );
}

export function SwitchInput<T extends FieldValues>({
  control,
  name,
  label,
  helperText,
  disabled,
}: Omit<BaseProps<T>, 'required' | 'autoFocus' | 'placeholder' | 'fullWidth'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Box>
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(field.value)}
                onChange={(event) => field.onChange(event.target.checked)}
                disabled={disabled}
                inputRef={field.ref}
                size="small"
              />
            }
            label={label}
            slotProps={{ typography: { variant: 'body2' } }}
          />
          {fieldState.error?.message || helperText ? (
            <FormHelperText error={Boolean(fieldState.error)} sx={{ ml: 0 }}>
              {fieldState.error?.message ?? helperText}
            </FormHelperText>
          ) : null}
        </Box>
      )}
    />
  );
}

export function CheckboxInput<T extends FieldValues>({
  control,
  name,
  label,
  disabled,
}: Omit<BaseProps<T>, 'required' | 'autoFocus' | 'placeholder' | 'fullWidth' | 'helperText'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FormControlLabel
          control={
            <Checkbox
              checked={Boolean(field.value)}
              onChange={(event) => field.onChange(event.target.checked)}
              disabled={disabled}
              inputRef={field.ref}
              size="small"
            />
          }
          label={label}
          slotProps={{ typography: { variant: 'body2' } }}
        />
      )}
    />
  );
}
