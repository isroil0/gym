# Phase 6 — Payments and accounting

## Summary
Payments (record, refund, history, balances) and the six accounting views, all
inside the administrator area, all reading from the backend's ledger rather
than computing money of their own.

## Pages
| Route | What |
| --- | --- |
| `/admin/payments` | Payments directory, date range and method filters, detail drawer, refunds |
| `/admin/accounting?view=overview` | Revenue, expenses, result, margin; daily chart; income and expense breakdowns |
| `?view=income` | Income entries from the ledger |
| `?view=expenses` | Expense entries, add expense, category management |
| `?view=debts` | Who owes what |
| `?view=salaries` | Trainer compensation and recorded payouts |
| `?view=reports` | Day-by-day ledger breakdown |
| `/admin/members/[id]?tab=payments` | One member's charges, payments and balance |

## The frontend adds up nothing it does not have to
Revenue, expenses, result and margin all come from `GET /accounting/summary`.
A second implementation of "profit" in the browser is a second thing that can
disagree with the books. The only arithmetic done client-side is each bar's
share of its total — presentation, not accounting — and the outstanding total
described below.

## A real backend defect found: understated outstanding total
`GET /dashboard/admin` fetches the **top five** debtors for its
`topDebtors` panel and then sums *that page* into `totalOutstanding`, while
reporting `membersInDebt` from the full count. With eight debtors in the
verification database the dashboard reported **863.48** against a true
**958.46** — understated by exactly the three smallest debts (49.99 + 34.99 +
10.00 = 94.98).

`GET /reports/unpaid-balances` has the same shape of bug with a limit of 100,
so it is correct only while the gym has at most 100 debtors. For a gym of a
thousand members that ceiling is reachable.

Both are recorded as backend defects (8 and 9 below). Because this is a
headline money figure, the frontend does not display either: `useTotalOutstanding`
pages through `GET /billing/outstanding` — whose per-member figures are
correct — and sums them **in integer minor units** so repeated addition cannot
drift. Used by both the dashboard card and the Debts tab, so the two agree.

## Verified against the live backend
```
payment 39.99 taken          income 1798.35 → 1838.34
automatic ledger entry       1 entry, isAutomatic true, 39.99
voiding that entry           422 UNPROCESSABLE_ENTITY  (the UI disables it, with the reason)
partial refund 10.00         PARTIALLY_REFUNDED, net 29.99, still refundable 29.99
                             refunds 10.00, revenue 1828.34
revenue = income − refunds   1838.34 − 10.00 = 1828.34  ✓
manual expense 12.34         isAutomatic false → voided with a reason
voided entry                 left the totals unchanged  ✓
expense attributed to trainer Nigora Rashidova, 500.00, filterable by trainerId

accounting == reports == dashboard
  revenue   1828.34 = 1828.34 = 1828.34  ✓
  expenses  13535.00 = 13535.00          ✓
  profit    −11706.66 = −11706.66        ✓
sum(daily buckets) == period summary, for revenue, expenses and profit  ✓
```
All six accounting tabs render 200 with no raw translation keys, and the
trainer-pay tab states the payroll limitation on the page itself.

## Honest about what the salaries page is
The backend stores a compensation arrangement per trainer and lets an expense
be attributed to one (`CreateAccountingEntryDto.trainerId`), so the page shows
real configured pay and lets a real payout be recorded against a trainer.
It does **not** calculate what is owed — there is no payroll engine — and the
page says exactly that in all three languages rather than implying otherwise.

## Tests added
5 cases for the exact outstanding total: summing across pages rather than one,
integer minor units so ten lots of 0.07 give 0.70 and not 0.7000000000000001,
a single request when there is one page, zero reported as 0.00, and a partial
figure flagged rather than paging forever.

## Verification
```
lint       0 errors, 0 warnings
typecheck  0 errors
tests      12 files, 282 passed
build      succeeded
```

## Backend integration gaps found
8. **`dashboard.totalOutstanding` is wrong with more than five debtors** — it
   sums the top-five page while counting all debtors. Confirmed understating
   by 94.98 against a true 958.46.
9. **`reports/unpaid-balances.totalOutstanding` has the same flaw at limit
   100** — correct only up to 100 debtors.
