'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { GridLocaleText } from '@mui/x-data-grid';

/**
 * Data grid chrome in the reader's language.
 *
 * Built from this product's own message bundles rather than the grid's
 * shipped locales: those cover Russian but not Uzbek, and mixing the two
 * sources would leave one language half-translated.
 */
export function useDataGridLocale(): Partial<GridLocaleText> {
  const t = useTranslations('common');

  return useMemo(
    () => ({
      noRowsLabel: t('states.noResults'),
      noResultsOverlayLabel: t('states.noResults'),
      columnMenuLabel: t('table.columns'),
      columnMenuSortAsc: t('table.sortAscending'),
      columnMenuSortDesc: t('table.sortDescending'),
      columnMenuHideColumn: t('actions.close'),
      columnMenuManageColumns: t('table.columns'),
      columnMenuUnsort: t('actions.reset'),
      columnMenuFilter: t('actions.filter'),
      toolbarDensity: t('table.density'),
      toolbarColumns: t('table.columns'),
      toolbarFilters: t('actions.filters'),
      toolbarExport: t('actions.export'),
      footerRowSelected: (count: number) => t('table.selected', { count }),
      footerTotalRows: t('labels.total'),
      MuiTablePagination: {
        labelRowsPerPage: t('table.rowsPerPage'),
        labelDisplayedRows: ({ from, to, count }: { from: number; to: number; count: number }) =>
          t('table.showingRange', { from, to, total: count === -1 ? to : count }),
      },
      checkboxSelectionHeaderName: t('actions.select'),
      actionsCellMore: t('actions.showMore'),
    }),
    [t],
  );
}
