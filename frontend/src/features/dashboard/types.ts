import type { Schemas } from '@/lib/api/types';

/** Dashboard and report shapes, named from the generated OpenAPI types. */
export type AdminDashboard = Schemas['AdminDashboardDto'];
export type TrainerDashboard = Schemas['TrainerDashboardDto'];
export type MemberDashboard = Schemas['MemberDashboardDto'];
export type ExpiringMembership = Schemas['ExpiringMembershipDto'];
export type DebtorSummary = Schemas['DebtorSummaryDto'];

export type RevenueReport = Schemas['RevenueReportDto'];
export type ExpenseReport = Schemas['ExpenseReportDto'];
export type ProfitReport = Schemas['ProfitReportDto'];
export type AttendanceReport = Schemas['AttendanceReportDto'];
export type MembershipSalesReport = Schemas['MembershipSalesReportDto'];
export type RenewalsReport = Schemas['RenewalsReportDto'];
export type ExpiredMembershipsReport = Schemas['ExpiredMembershipsReportDto'];
export type UnpaidBalancesReport = Schemas['UnpaidBalancesReportDto'];
export type TrainerStatsReport = Schemas['TrainerStatsReportDto'];
