-- CreateEnum
CREATE TYPE "membership_plan_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('PENDING', 'ACTIVE', 'FROZEN', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "membership_plans" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "duration_days" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "visit_limit" INTEGER,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" "membership_plan_status" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_memberships" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "purchase_price" DECIMAL(10,2) NOT NULL,
    "visit_limit" INTEGER,
    "visits_used" INTEGER NOT NULL DEFAULT 0,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'ACTIVE',
    "frozen_at" TIMESTAMP(3),
    "total_frozen_days" INTEGER NOT NULL DEFAULT 0,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" VARCHAR(255),
    "extended_days" INTEGER NOT NULL DEFAULT 0,
    "previous_membership_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_freezes" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "days" INTEGER,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_freezes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_plans_name_key" ON "membership_plans"("name");

-- CreateIndex
CREATE INDEX "membership_plans_status_idx" ON "membership_plans"("status");

-- CreateIndex
CREATE INDEX "membership_plans_display_order_idx" ON "membership_plans"("display_order");

-- CreateIndex
CREATE UNIQUE INDEX "member_memberships_previous_membership_id_key" ON "member_memberships"("previous_membership_id");

-- CreateIndex
CREATE INDEX "member_memberships_member_id_idx" ON "member_memberships"("member_id");

-- CreateIndex
CREATE INDEX "member_memberships_member_id_status_idx" ON "member_memberships"("member_id", "status");

-- CreateIndex
CREATE INDEX "member_memberships_status_idx" ON "member_memberships"("status");

-- CreateIndex
CREATE INDEX "member_memberships_end_date_idx" ON "member_memberships"("end_date");

-- CreateIndex
CREATE INDEX "member_memberships_status_end_date_idx" ON "member_memberships"("status", "end_date");

-- CreateIndex
CREATE INDEX "member_memberships_plan_id_idx" ON "member_memberships"("plan_id");

-- CreateIndex
CREATE INDEX "membership_freezes_membership_id_idx" ON "membership_freezes"("membership_id");

-- AddForeignKey
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_previous_membership_id_fkey" FOREIGN KEY ("previous_membership_id") REFERENCES "member_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_freezes" ADD CONSTRAINT "membership_freezes_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "member_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
