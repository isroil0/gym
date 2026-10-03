'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import AddIcon from '@mui/icons-material/AddRounded';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabbedSection } from '@/components/ui/TabbedSection';
import { DateRangePicker } from '@/components/data/DateRangePicker';
import { FilterBar } from '@/components/data/FilterBar';
import { SearchField } from '@/components/data/SearchField';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { dateAnchors } from '@/lib/format/datetime';
import { AccountingOverview } from './AccountingOverview';
import { EntryTable } from './EntryTable';
import { ExpenseDialog } from './ExpenseDialog';
import { IncomeDialog } from './IncomeDialog';
import { CategoryManager } from './CategoryManager';
import { DebtsTab } from './DebtsTab';
import { TrainerPayTab } from './TrainerPayTab';
import { PeriodBreakdownTab } from './PeriodBreakdownTab';
import { useExpenseCategories } from './useAccounting';

const DEFAULTS = {
  page: '1',
  limit: '20',
  from: '',
  to: '',
  expenseCategoryId: '',
  search: '',
};

/**
 * The gym's books, in the six views an owner actually asks for.
 *
 * Accounting lives inside the administrator area and nowhere else; the
 * backend refuses these endpoints to any other role.
 */
export function AccountingPage({ tab = 'overview' }: { tab?: string }) {
  const t = useTranslations('accounting');
  const tc = useTranslations('common');
  const { state, set, clear } = useQueryState(DEFAULTS);
  const [addingExpense, setAddingExpense] = useState(false);
  const [addingIncome, setAddingIncome] = useState(false);

  const categories = useExpenseCategories();

  // Default to the month to date, which is the period the dashboard reports.
  const range = useMemo(() => {
    const anchors = dateAnchors();
    return { from: state.from || anchors.monthStart, to: state.to || anchors.today };
  }, [state.from, state.to]);

  const needsRange = tab !== 'debts' && tab !== 'salaries';

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setAddingIncome(true)}
            >
              {t('income.add')}
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setAddingExpense(true)}
            >
              {t('expense.add')}
            </Button>
          </Stack>
        }
      />

      <TabbedSection
        tabs={[
          { value: 'overview', label: t('tabs.overview') },
          { value: 'income', label: t('tabs.income') },
          { value: 'expenses', label: t('tabs.expenses') },
          { value: 'debts', label: t('tabs.debts') },
          { value: 'salaries', label: t('tabs.salaries') },
          { value: 'reports', label: t('tabs.reports') },
        ]}
        active={tab}
        param="view"
      >
        {needsRange ? (
          <Box sx={{ mb: 2.5 }}>
            <DateRangePicker
              value={range}
              onChange={(next) => set({ from: next.from, to: next.to })}
            />
          </Box>
        ) : null}

        {tab === 'overview' ? <AccountingOverview range={range} /> : null}

        {tab === 'income' ? (
          <EntryTable
            query={{ ...state, ...range, type: 'INCOME' }}
            onPageChange={(page) => set({ page: String(page) })}
            onPageSizeChange={(limit) => set({ limit: String(limit), page: '1' })}
            emptyTitle={t('entries.empty')}
          />
        ) : null}

        {tab === 'expenses' ? (
          <Stack spacing={2.5}>
            <FilterBar
              search={
                <SearchField value={state.search} onChange={(value) => set({ search: value })} />
              }
              filters={[
                {
                  key: 'expenseCategoryId',
                  label: t('categories.one'),
                  value: state.expenseCategoryId,
                  options: [
                    { value: '', label: tc('labels.all') },
                    ...(categories.data?.data ?? []).map((category) => ({
                      value: category.id,
                      label: category.name,
                    })),
                  ],
                },
              ]}
              onFilterChange={(key, value) => set({ [key]: value })}
              onClear={clear}
            />
            <EntryTable
              query={{ ...state, ...range, type: 'EXPENSE' }}
              onPageChange={(page) => set({ page: String(page) })}
              onPageSizeChange={(limit) => set({ limit: String(limit), page: '1' })}
              emptyTitle={t('expense.empty')}
            />
            <CategoryManager />
          </Stack>
        ) : null}

        {tab === 'debts' ? <DebtsTab /> : null}
        {tab === 'salaries' ? <TrainerPayTab /> : null}
        {tab === 'reports' ? <PeriodBreakdownTab range={range} /> : null}
      </TabbedSection>

      <ExpenseDialog open={addingExpense} onClose={() => setAddingExpense(false)} />
      <IncomeDialog open={addingIncome} onClose={() => setAddingIncome(false)} />
    </>
  );
}
