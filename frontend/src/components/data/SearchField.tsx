'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import SearchIcon from '@mui/icons-material/SearchRounded';
import ClearIcon from '@mui/icons-material/CloseRounded';
import CircularProgress from '@mui/material/CircularProgress';

/**
 * Debounced search.
 *
 * The field is uncontrolled from the caller's point of view — it keeps what
 * was typed immediately and reports upward only once typing pauses, so a
 * slow list never swallows a keystroke.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  debounceMs = 300,
  loading = false,
  autoFocus = false,
  fullWidth = false,
  size = 'small',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  loading?: boolean;
  autoFocus?: boolean;
  fullWidth?: boolean;
  size?: 'small' | 'medium';
}) {
  const t = useTranslations('common.actions');
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  // Accept changes pushed from outside (a cleared filter bar, a back button)
  // without fighting the person typing.
  useEffect(() => {
    setDraft((current) => (current === value ? current : value));
  }, [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => latest.current(draft), debounceMs);
    return () => clearTimeout(timer);
  }, [draft, value, debounceMs]);

  return (
    <TextField
      inputRef={inputRef}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      placeholder={placeholder ?? t('search')}
      size={size}
      fullWidth={fullWidth}
      autoFocus={autoFocus}
      type="search"
      slotProps={{
        htmlInput: { 'aria-label': placeholder ?? t('search'), enterKeyHint: 'search' },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              {loading ? <CircularProgress size={14} /> : null}
              {draft && !loading ? (
                <IconButton
                  size="small"
                  aria-label={t('clear')}
                  onClick={() => {
                    setDraft('');
                    onChange('');
                    inputRef.current?.focus();
                  }}
                  edge="end"
                >
                  <ClearIcon sx={{ fontSize: 16 }} />
                </IconButton>
              ) : null}
            </InputAdornment>
          ),
        },
      }}
      sx={{
        minWidth: fullWidth ? undefined : { xs: '100%', sm: 260 },
        // Chrome draws its own clear button on type=search; ours is better
        // placed and keyboard reachable.
        '& input[type=search]::-webkit-search-cancel-button': { display: 'none' },
      }}
    />
  );
}
