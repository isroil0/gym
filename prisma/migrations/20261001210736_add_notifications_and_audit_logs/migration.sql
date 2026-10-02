-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('MEMBERSHIP_EXPIRING', 'MEMBERSHIP_EXPIRED', 'PAYMENT_DUE', 'SESSION_SCHEDULED', 'SESSION_CANCELLED', 'CARD_REVOKED', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "notification_severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "audit_outcome" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "severity" "notification_severity" NOT NULL DEFAULT 'INFO',
    "title" VARCHAR(160) NOT NULL,
    "body" TEXT NOT NULL,
    "related_entity_type" VARCHAR(40),
    "related_entity_id" UUID,
    "read_at" TIMESTAMP(3),
    "dedupe_key" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_role" "user_role",
    "actor_email" VARCHAR(255),
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(60),
    "entity_id" VARCHAR(64),
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(255) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "outcome" "audit_outcome" NOT NULL,
    "error_code" VARCHAR(60),
    "payload" JSONB,
    "request_id" VARCHAR(64),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_idx" ON "notifications"("recipient_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_idx" ON "notifications"("recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_outcome_idx" ON "audit_logs"("outcome");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- Phase 9 hardening: invariants the application already enforces, restated in
-- the database so a bug, a direct SQL edit or a race cannot bypass them.
-- ===========================================================================

-- Exclusion constraints need btree_gist to mix equality on a scalar with
-- overlap on a range in one index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Money can never be negative, and a charge can never be negative.
-- ---------------------------------------------------------------------------
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "accounting_entries"
  ADD CONSTRAINT "accounting_entries_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "membership_plans"
  ADD CONSTRAINT "membership_plans_price_non_negative" CHECK ("price" >= 0),
  ADD CONSTRAINT "membership_plans_duration_positive" CHECK ("duration_days" > 0),
  ADD CONSTRAINT "membership_plans_visit_limit_positive"
    CHECK ("visit_limit" IS NULL OR "visit_limit" > 0);

-- A discount can reduce a charge to nil but never below it, and never create
-- a liability for the gym.
ALTER TABLE "member_memberships"
  ADD CONSTRAINT "member_memberships_price_non_negative" CHECK ("purchase_price" >= 0),
  ADD CONSTRAINT "member_memberships_discount_non_negative" CHECK ("discount_amount" >= 0),
  ADD CONSTRAINT "member_memberships_discount_within_price"
    CHECK ("discount_amount" <= "purchase_price"),
  ADD CONSTRAINT "member_memberships_dates_ordered" CHECK ("end_date" >= "start_date"),
  ADD CONSTRAINT "member_memberships_visits_non_negative" CHECK ("visits_used" >= 0),
  ADD CONSTRAINT "member_memberships_visit_limit_positive"
    CHECK ("visit_limit" IS NULL OR "visit_limit" > 0);

-- ---------------------------------------------------------------------------
-- An accounting entry is either an expense with a category, or income/refund
-- without one. Nothing in between.
-- ---------------------------------------------------------------------------
ALTER TABLE "accounting_entries"
  ADD CONSTRAINT "accounting_entries_category_matches_type" CHECK (
    ("type" = 'EXPENSE' AND "expense_category_id" IS NOT NULL)
    OR ("type" <> 'EXPENSE' AND "expense_category_id" IS NULL)
  ),
  -- Only an expense can be attributed to a trainer.
  ADD CONSTRAINT "accounting_entries_trainer_only_on_expense" CHECK (
    "trainer_id" IS NULL OR "type" = 'EXPENSE'
  );

-- ---------------------------------------------------------------------------
-- A visit cannot end before it began, and a session must have a real length.
-- ---------------------------------------------------------------------------
ALTER TABLE "attendances"
  ADD CONSTRAINT "attendances_checkout_after_checkin"
    CHECK ("checked_out_at" IS NULL OR "checked_out_at" >= "checked_in_at");

ALTER TABLE "training_sessions"
  ADD CONSTRAINT "training_sessions_ends_after_starts" CHECK ("ends_at" > "starts_at");

-- Prescriptions must be physically meaningful.
ALTER TABLE "workout_exercises"
  ADD CONSTRAINT "workout_exercises_sets_positive" CHECK ("sets" > 0),
  ADD CONSTRAINT "workout_exercises_weight_non_negative"
    CHECK ("weight" IS NULL OR "weight" >= 0),
  ADD CONSTRAINT "workout_exercises_rest_non_negative"
    CHECK ("rest_seconds" IS NULL OR "rest_seconds" >= 0);

-- ---------------------------------------------------------------------------
-- A member holds at most one live membership over any given day.
--
-- The application already refuses an overlap, but two concurrent sales could
-- both pass that check. An exclusion constraint makes it impossible: the
-- inclusive date range matches how the application reasons about membership
-- periods, and only the statuses that occupy the calendar are considered, so
-- an expired or cancelled term frees its dates.
-- ---------------------------------------------------------------------------
ALTER TABLE "member_memberships"
  ADD CONSTRAINT "member_memberships_no_overlap"
  EXCLUDE USING gist (
    "member_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  )
  WHERE ("status" IN ('PENDING', 'ACTIVE', 'FROZEN'));

-- ---------------------------------------------------------------------------
-- Neither a trainer nor a member can be in two sessions at once.
--
-- Half-open ranges, matching the application: a 09:00-10:00 session and a
-- 10:00-11:00 session do not clash. A cancelled or no-show session frees the
-- slot, so only SCHEDULED and COMPLETED are considered.
-- ---------------------------------------------------------------------------
ALTER TABLE "training_sessions"
  ADD CONSTRAINT "training_sessions_trainer_no_overlap"
  EXCLUDE USING gist (
    "trainer_id" WITH =,
    tsrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE ("status" IN ('SCHEDULED', 'COMPLETED'));

ALTER TABLE "training_sessions"
  ADD CONSTRAINT "training_sessions_member_no_overlap"
  EXCLUDE USING gist (
    "member_id" WITH =,
    tsrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE ("status" IN ('SCHEDULED', 'COMPLETED'));

-- ---------------------------------------------------------------------------
-- Indexes for the access paths the dashboards and reports actually use, found
-- by reading the queries in Phase 8 rather than guessing.
-- ---------------------------------------------------------------------------

-- Billing settles a member by walking their memberships and the payments on
-- them; the unpaid-balances report does it for everyone.
CREATE INDEX IF NOT EXISTS "payments_member_id_paid_at_idx"
  ON "payments" ("member_id", "paid_at" DESC);

-- "Memberships lapsing in the next N days" on the admin dashboard.
CREATE INDEX IF NOT EXISTS "member_memberships_status_end_date_idx"
  ON "member_memberships" ("status", "end_date");

-- The renewal chain, walked by the renewals report.
CREATE INDEX IF NOT EXISTS "member_memberships_previous_membership_id_idx"
  ON "member_memberships" ("previous_membership_id");

-- Trainer dashboard: last visit and visits-this-month per assigned member.
CREATE INDEX IF NOT EXISTS "attendances_member_id_checked_in_at_desc_idx"
  ON "attendances" ("member_id", "checked_in_at" DESC);

-- Trainer stats group sessions by trainer over a period.
CREATE INDEX IF NOT EXISTS "training_sessions_trainer_id_status_starts_at_idx"
  ON "training_sessions" ("trainer_id", "status", "starts_at");

-- The member dashboard's "next session".
CREATE INDEX IF NOT EXISTS "training_sessions_member_id_status_starts_at_idx"
  ON "training_sessions" ("member_id", "status", "starts_at");

-- Trainer-attributed expenses in the trainer-stats report.
CREATE INDEX IF NOT EXISTS "accounting_entries_trainer_id_occurred_on_idx"
  ON "accounting_entries" ("trainer_id", "occurred_on")
  WHERE "trainer_id" IS NOT NULL;

-- Every financial report filters on a date range and ignores voided rows.
CREATE INDEX IF NOT EXISTS "accounting_entries_live_occurred_on_idx"
  ON "accounting_entries" ("occurred_on", "type")
  WHERE "voided_at" IS NULL;

-- A member's unread notification badge.
CREATE INDEX IF NOT EXISTS "notifications_unread_idx"
  ON "notifications" ("recipient_id", "created_at" DESC)
  WHERE "read_at" IS NULL;
