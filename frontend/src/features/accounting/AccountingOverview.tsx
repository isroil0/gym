'use client';

import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { MetricCard } from '@/components/ui/MetricCard';
import { SectionCard } from '@/components/ui/SectionCard';
import { TrendChart } from '@/components/charts/TrendChart';
import { useChartColors } from '@/components/charts/ChartTheme';
import { MetricCardSkeleton, ChartSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatMoney } from '@/lib/format/money';
import { formatPercent } from '@/lib/format/number';
import { useDailyTotals, useSummary } from './useAccounting';

/**
 * The books for a chosen period.
 *
 * Revenue, expenses and the result all come from `GET /accounting/summary`,
 * which is the same computation the reports pages use. The frontend adds
 * nothing up itself — a second implementation of "profit" is a second thing
 * that can disagree with the ledger.
 */
export function AccountingOverview({ range }: { range: { from: string; to: string } }) {
  const t = useTranslations('accounting.overview');
  const tp = useTranslations('payments');
  const ta = useTranslations('accounting');
  const { locale } = useLocale();
  const colors = useChartColors();

  const summary = useSummary(range);
  const daily = useDailyTotals(range);

  if (summary.isPending) return <MetricCardSkeleton count={4} />;
  if (!summary.data) return <EmptyState title={ta('entries.empty')} />;

  const s = summary.data;
  const profit = Number(s.profit);
  const revenue = Number(s.revenue);
  const margin = revenue !== 0 ? (profit / revenue) * 100 : 0;

  return (
    <Stack spacing={2.5}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
        }}
      >
        <MetricCard
          label={t('revenue')}
          value={formatMoney(s.revenue, locale)}
          hint={`${t('income')} ${formatMoney(s.income, locale)} · ${t('refunds')} ${formatMoney(s.refunds, locale)}`}
          tone="success"
          help={t('netExplainer')}
        />
        <MetricCard label={t('expenses')} value={formatMoney(s.expenses, locale)} tone="danger" />
        <MetricCard
          label={profit >= 0 ? t('profitPositive') : t('profitNegative')}
          value={formatMoney(s.profit, locale)}
          tone={profit >= 0 ? 'success' : 'danger'}
        />
        <MetricCard
          label={t('margin')}
          value={formatPercent(margin, locale)}
          tone={margin >= 0 ? 'accent' : 'danger'}
        />
      </Box>

      <SectionCard title={t('revenue')}>
        {daily.isPending ? (
          <ChartSkeleton height={240} />
        ) : (
          <TrendChart
            height={260}
            variant="bar"
            buckets={(daily.data ?? []).map((bucket) => bucket.date)}
            valueFormatter={(value) => formatMoney(value ?? 0, locale)}
            series={[
              {
                key: 'revenue',
                label: t('revenue'),
                color: colors.revenue,
                values: (daily.data ?? []).map((b) => Number(b.revenue)),
              },
              {
                key: 'expenses',
                label: t('expenses'),
                color: colors.expenses,
                values: (daily.data ?? []).map((b) => Number(b.expenses)),
              },
            ]}
          />
        )}
      </SectionCard>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <SectionCard title={t('expenseBreakdown')} divided dense>
          {s.expensesByCategory.length === 0 ? (
            <EmptyState title={ta('expense.empty')} compact />
          ) : (
            <Breakdown
              items={s.expensesByCategory.map((row) => ({
                label: row.expenseCategoryName ?? ta('categories.uncategorised'),
                amount: row.amount,
              }))}
              total={s.expenses}
              tone="error"
            />
          )}
        </SectionCard>

        <SectionCard title={t('byMethod')} divided dense>
          {s.byPaymentMethod.length === 0 ? (
            <EmptyState title={tp('empty.title')} compact />
          ) : (
            <Breakdown
              // The backend reports income and refunds per method; what the
              // gym actually kept is the difference.
              items={s.byPaymentMethod.map((row) => ({
                label: row.method ? tp(`method.${row.method}`) : ta('categories.uncategorised'),
                amount: (Number(row.income) - Number(row.refunds)).toFixed(2),
              }))}
              total={s.revenue}
              tone="primary"
            />
          )}
        </SectionCard>
      </Box>
    </Stack>
  );
}

/**
 * A list of amounts with a bar showing each one's share of the total.
 *
 * The share is computed here rather than read from the API, which reports
 * amounts only. It is presentation, not arithmetic the ledger depends on.
 */
function Breakdown({
  items,
  total,
  tone,
}: {
  items: Array<{ label: string; amount: string }>;
  total: string;
  tone: 'error' | 'primary';
}) {
  const { locale } = useLocale();
  const denominator = Math.abs(Number(total)) || 1;
  return (
    <Stack spacing={1.5}>
      {items.map((item) => (
        <Box key={item.label}>
          <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 0.5 }}>
            <Typography variant="body2" noWrap>
              {item.label}
            </Typography>
            <Typography variant="body2" className="tabular" sx={{ fontWeight: 540, flexShrink: 0 }}>
              {formatMoney(item.amount, locale)}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, (Math.abs(Number(item.amount)) / denominator) * 100)}
            color={tone}
            sx={{ height: 4 }}
          />
        </Box>
      ))}
    </Stack>
  );
}
