-- CreateEnum
CREATE TYPE "compensation_type" AS ENUM ('NONE', 'FIXED', 'COMMISSION', 'FIXED_PLUS_COMMISSION');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "accounting_entry_type" AS ENUM ('INCOME', 'EXPENSE', 'REFUND');

-- CreateEnum
CREATE TYPE "income_source" AS ENUM ('MEMBERSHIP_PAYMENT', 'OTHER');

-- AlterTable
ALTER TABLE "member_memberships" ADD COLUMN     "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_reason" VARCHAR(255);

-- AlterTable
ALTER TABLE "trainers" ADD COLUMN     "commission_rate" DECIMAL(5,2),
ADD COLUMN     "compensation_type" "compensation_type" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "monthly_salary" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "membership_id" UUID,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "payment_method" NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'COMPLETED',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "reference" VARCHAR(120),
    "notes" TEXT,
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "payment_method" NOT NULL,
    "reason" VARCHAR(255),
    "refunded_at" TIMESTAMP(3) NOT NULL,
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_entries" (
    "id" UUID NOT NULL,
    "type" "accounting_entry_type" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "occurred_on" DATE NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "expense_category_id" UUID,
    "income_source" "income_source",
    "method" "payment_method",
    "payment_id" UUID,
    "refund_id" UUID,
    "trainer_id" UUID,
    "is_automatic" BOOLEAN NOT NULL DEFAULT false,
    "voided_at" TIMESTAMP(3),
    "voided_reason" VARCHAR(255),
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_member_id_idx" ON "payments"("member_id");

-- CreateIndex
CREATE INDEX "payments_membership_id_idx" ON "payments"("membership_id");

-- CreateIndex
CREATE INDEX "payments_paid_at_idx" ON "payments"("paid_at");

-- CreateIndex
CREATE INDEX "payments_method_idx" ON "payments"("method");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refunds_refunded_at_idx" ON "refunds"("refunded_at");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE INDEX "expense_categories_archived_at_idx" ON "expense_categories"("archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_entries_payment_id_key" ON "accounting_entries"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_entries_refund_id_key" ON "accounting_entries"("refund_id");

-- CreateIndex
CREATE INDEX "accounting_entries_type_idx" ON "accounting_entries"("type");

-- CreateIndex
CREATE INDEX "accounting_entries_occurred_on_idx" ON "accounting_entries"("occurred_on");

-- CreateIndex
CREATE INDEX "accounting_entries_type_occurred_on_idx" ON "accounting_entries"("type", "occurred_on");

-- CreateIndex
CREATE INDEX "accounting_entries_expense_category_id_idx" ON "accounting_entries"("expense_category_id");

-- CreateIndex
CREATE INDEX "accounting_entries_trainer_id_idx" ON "accounting_entries"("trainer_id");

-- CreateIndex
CREATE INDEX "accounting_entries_voided_at_idx" ON "accounting_entries"("voided_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "member_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_expense_category_id_fkey" FOREIGN KEY ("expense_category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
