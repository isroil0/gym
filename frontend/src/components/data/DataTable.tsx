'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import {
  DataGrid,
  type DataGridProps,
  type GridRowParams,
  type GridValidRowModel,
} from '@mui/x-data-grid';
import { alpha } from '@mui/material/styles';
import { useDataGridLocale } from './useDataGridLocale';
import { useThemeMode } from '@/providers/ThemeModeProvider';
import { EmptyState, ErrorState } from '@/components/feedback/EmptyState';
import { TableSkeleton } from '@/components/feedback/Skeletons';
import type { PaginationMeta } from '@/lib/api/types';

const ROW_HEIGHT = { comfortable: 56, standard: 48, compact: 40 } as const;

/**
 * The product's one table.
 *
 * Paging, sorting and filtering all happen on the server — a thousand members
 * is small, but the backend already does this work correctly and duplicating
 * it in the browser would be a second source of truth for the same question.
 */
// Rows are not required to carry an `id`: several backend records are keyed
// by something else (a member balance by `memberId`, a daily bucket by its
// date), and `getRowId` is how the grid is told which field to use.
export function DataTable<Row extends GridValidRowModel>({
  rows,
  columns,
  meta,
  loading = false,
  error = null,
  onRetry,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  emptyTitle,
  emptyBody,
  filtered = false,
  emptyAction,
  minHeight = 420,
  ...gridProps
}: {
  rows: Row[];
  meta?: PaginationMeta;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onRowClick?: (row: Row) => void;
  emptyTitle: string;
  emptyBody?: string;
  filtered?: boolean;
  emptyAction?: React.ReactNode;
  minHeight?: number;
} & Omit<DataGridProps<Row>, 'rows' | 'onRowClick' | 'loading'>) {
  const t = useTranslations('common');
  const te = useTranslations('errors');
  const localeText = useDataGridLocale();
  const { density } = useThemeMode();

  const showSkeleton = loading && rows.length === 0;

  const slots = useMemo(
    () => ({
      noRowsOverlay: () => (
        <EmptyState
          title={emptyTitle}
          body={emptyBody}
          variant={filtered ? 'filtered' : 'empty'}
          action={emptyAction}
          compact
        />
      ),
      // The grid's own spinner tells you nothing about what is arriving;
      // a skeleton shaped like the table does.
      loadingOverlay: () => <TableSkeleton rows={6} columns={Math.min(columns.length, 6)} />,
    }),
    [emptyTitle, emptyBody, filtered, emptyAction, columns.length],
  );

  if (error) {
    return (
      <Box sx={{ minHeight }}>
        <ErrorState
          title={t('states.errorTitle')}
          body={te('generic')}
          onRetry={onRetry}
          retryLabel={t('actions.retry')}
        />
      </Box>
    );
  }

  if (showSkeleton) {
    return (
      <Box sx={{ minHeight }}>
        <TableSkeleton rows={8} columns={Math.min(columns.length, 6)} />
      </Box>
    );
  }

  return (
    <DataGrid<Row>
      rows={rows}
      columns={columns}
      localeText={localeText}
      loading={loading}
      slots={slots}
      rowHeight={ROW_HEIGHT[density]}
      columnHeaderHeight={42}
      disableRowSelectionOnClick
      pagination
      paginationMode="server"
      filterMode="server"
      // No list endpoint accepts a sort parameter, so the grid must not offer
      // sorting it cannot perform. Rows arrive in the order the backend
      // chose. See the integration notes in the README.
      disableColumnSorting
      disableColumnFilter
      rowCount={meta?.total ?? rows.length}
      paginationModel={{
        page: Math.max(0, (meta?.page ?? 1) - 1),
        pageSize: meta?.limit ?? 20,
      }}
      onPaginationModelChange={(model) => {
        if (model.pageSize !== (meta?.limit ?? 20)) onPageSizeChange?.(model.pageSize);
        else onPageChange?.(model.page + 1);
      }}
      pageSizeOptions={[10, 20, 50, 100]}
      onRowClick={onRowClick ? (params: GridRowParams<Row>) => onRowClick(params.row) : undefined}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        minHeight,
        bgcolor: 'background.paper',
        '--DataGrid-overlayHeight': `${minHeight - 90}px`,
        '& .MuiDataGrid-columnHeaders': { bgcolor: 'background.subtle' },
        '& .MuiDataGrid-columnHeaderTitle': {
          fontWeight: 580,
          fontSize: '0.78125rem',
          color: 'text.secondary',
        },
        '& .MuiDataGrid-cell': { fontSize: '0.875rem', borderColor: 'divider' },
        '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
        '& .MuiDataGrid-columnSeparator': { display: 'none' },
        '& .MuiDataGrid-footerContainer': { borderColor: 'divider', minHeight: 48 },
        '& .MuiDataGrid-row': {
          cursor: onRowClick ? 'pointer' : 'default',
          transition: (theme) => `background-color ${theme.motion.instant}ms`,
        },
        '& .MuiDataGrid-row:hover': {
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.045),
        },
        // Keyboard users must be able to see which row they are on.
        '& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row:focus-within': {
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
        },
        ...gridProps.sx,
      }}
      {...gridProps}
    />
  );
}
