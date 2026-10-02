import type { components, operations, paths } from './schema';

/** Every DTO the backend publishes, by its OpenAPI schema name. */
export type Schemas = components['schemas'];

export type { paths, operations };

// ---- Core records -----------------------------------------------------------
export type User = Schemas['UserResponseDto'];
export type Member = Schemas['MemberResponseDto'];
export type Trainer = Schemas['TrainerResponseDto'];
export type MembershipPlan = Schemas['MembershipPlanResponseDto'];
export type Membership = Schemas['MembershipResponseDto'];
export type Payment = Schemas['PaymentResponseDto'];
export type AccountingEntry = Schemas['AccountingEntryResponseDto'];
export type ExpenseCategory = Schemas['ExpenseCategoryResponseDto'];
export type Attendance = Schemas['AttendanceResponseDto'];
export type MembershipCard = Schemas['MembershipCardResponseDto'];
export type WorkoutPlan = Schemas['WorkoutPlanResponseDto'];
export type Measurement = Schemas['MeasurementResponseDto'];
export type TrainingSession = Schemas['TrainingSessionResponseDto'];
export type Notification = Schemas['NotificationResponseDto'];

// ---- Enumerations -----------------------------------------------------------
// Spelled out rather than derived: these are the values the UI switches on and
// labels by key, so a backend change should break the build here first.
export const USER_ROLES = ['ADMIN', 'TRAINER', 'MEMBER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PROFILE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['PENDING', 'ACTIVE', 'FROZEN', 'EXPIRED', 'CANCELLED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const BILLING_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERPAID'] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const ENTRY_TYPES = ['INCOME', 'EXPENSE', 'REFUND'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const INCOME_SOURCES = ['MEMBERSHIP_PAYMENT', 'OTHER'] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];

export const ATTENDANCE_METHODS = ['MANUAL', 'QR'] as const;
export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number];

export const SESSION_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'MEMBERSHIP_EXPIRING',
  'MEMBERSHIP_EXPIRED',
  'PAYMENT_DUE',
  'SESSION_SCHEDULED',
  'SESSION_CANCELLED',
  'CARD_REVOKED',
  'ANNOUNCEMENT',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const COMPENSATION_TYPES = ['NONE', 'FIXED', 'COMMISSION', 'FIXED_PLUS_COMMISSION'] as const;
export type CompensationType = (typeof COMPENSATION_TYPES)[number];

export const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;
export type Gender = (typeof GENDERS)[number];

export const MEASUREMENT_UNITS = ['KG', 'LB'] as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export const PROGRESS_METRICS = [
  'weightKg',
  'heightCm',
  'bodyFatPercent',
  'muscleMassKg',
  'chestCm',
  'waistCm',
  'hipsCm',
  'thighCm',
  'armCm',
  'restingHeartRate',
] as const;
export type ProgressMetric = (typeof PROGRESS_METRICS)[number];

/** Why the door refused someone. Mirrors the backend's EntryDenialReason. */
export const ENTRY_DENIAL_REASONS = [
  'MEMBER_ARCHIVED',
  'ACCOUNT_INACTIVE',
  'NO_MEMBERSHIP',
  'MEMBERSHIP_NOT_STARTED',
  'MEMBERSHIP_FROZEN',
  'MEMBERSHIP_EXPIRED',
  'MEMBERSHIP_CANCELLED',
  'NO_VISITS_LEFT',
  'ALREADY_INSIDE',
  'CARD_REVOKED',
  'CARD_SUPERSEDED',
  'CARD_INVALID',
  'CARD_NOT_ISSUED',
  'DOOR_CODE_INVALID',
  'DOOR_CODE_EXPIRED',
] as const;
export type EntryDenialReason = (typeof ENTRY_DENIAL_REASONS)[number];

// ---- Pagination -------------------------------------------------------------
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export const EMPTY_PAGE: PaginationMeta = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};
