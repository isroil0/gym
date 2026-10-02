-- CreateEnum
CREATE TYPE "check_in_method" AS ENUM ('MANUAL', 'QR');

-- CreateTable
CREATE TABLE "membership_cards" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" VARCHAR(255),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "membership_id" UUID,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_out_at" TIMESTAMP(3),
    "method" "check_in_method" NOT NULL,
    "visit_deducted" BOOLEAN NOT NULL DEFAULT false,
    "recorded_by_user_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_cards_member_id_key" ON "membership_cards"("member_id");

-- CreateIndex
CREATE INDEX "membership_cards_revoked_at_idx" ON "membership_cards"("revoked_at");

-- CreateIndex
CREATE INDEX "attendances_member_id_idx" ON "attendances"("member_id");

-- CreateIndex
CREATE INDEX "attendances_checked_in_at_idx" ON "attendances"("checked_in_at");

-- CreateIndex
CREATE INDEX "attendances_member_id_checked_in_at_idx" ON "attendances"("member_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "attendances_membership_id_idx" ON "attendances"("membership_id");

-- CreateIndex
CREATE INDEX "attendances_checked_out_at_idx" ON "attendances"("checked_out_at");

-- AddForeignKey
ALTER TABLE "membership_cards" ADD CONSTRAINT "membership_cards_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "member_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A member may be inside the gym at most once at a time.
--
-- Prisma cannot express a partial unique index, so it is declared here by hand.
-- Without it two concurrent scans could both pass the application check and
-- open two visits, double-deducting a limited allowance. With it, the second
-- insert fails with a unique violation and is reported as a conflict.
CREATE UNIQUE INDEX "attendances_one_open_visit_per_member"
  ON "attendances" ("member_id")
  WHERE "checked_out_at" IS NULL;
