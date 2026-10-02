-- CreateEnum
CREATE TYPE "workout_plan_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "weight_unit" AS ENUM ('KG', 'LB');

-- CreateEnum
CREATE TYPE "training_session_status" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "workout_plans" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "trainer_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "goal" VARCHAR(255),
    "start_date" DATE,
    "end_date" DATE,
    "trainer_notes" TEXT,
    "status" "workout_plan_status" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_days" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "day_order" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_exercises" (
    "id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "exercise_order" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "target_muscle_group" VARCHAR(120),
    "sets" INTEGER NOT NULL,
    "reps" VARCHAR(30) NOT NULL,
    "weight" DECIMAL(6,2),
    "weight_unit" "weight_unit" NOT NULL DEFAULT 'KG',
    "rest_seconds" INTEGER,
    "tempo" VARCHAR(30),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_measurements" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "measured_on" DATE NOT NULL,
    "weight_kg" DECIMAL(5,2),
    "height_cm" DECIMAL(5,1),
    "body_fat_percent" DECIMAL(4,1),
    "muscle_mass_kg" DECIMAL(5,2),
    "chest_cm" DECIMAL(5,1),
    "waist_cm" DECIMAL(5,1),
    "hips_cm" DECIMAL(5,1),
    "thigh_cm" DECIMAL(5,1),
    "arm_cm" DECIMAL(5,1),
    "resting_heart_rate" INTEGER,
    "notes" TEXT,
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "training_session_status" NOT NULL DEFAULT 'SCHEDULED',
    "location" VARCHAR(120),
    "trainer_notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_plans_member_id_idx" ON "workout_plans"("member_id");

-- CreateIndex
CREATE INDEX "workout_plans_member_id_status_idx" ON "workout_plans"("member_id", "status");

-- CreateIndex
CREATE INDEX "workout_plans_trainer_id_idx" ON "workout_plans"("trainer_id");

-- CreateIndex
CREATE INDEX "workout_plans_status_idx" ON "workout_plans"("status");

-- CreateIndex
CREATE INDEX "workout_days_plan_id_idx" ON "workout_days"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_days_plan_id_day_order_key" ON "workout_days"("plan_id", "day_order");

-- CreateIndex
CREATE INDEX "workout_exercises_day_id_idx" ON "workout_exercises"("day_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_exercises_day_id_exercise_order_key" ON "workout_exercises"("day_id", "exercise_order");

-- CreateIndex
CREATE INDEX "member_measurements_member_id_idx" ON "member_measurements"("member_id");

-- CreateIndex
CREATE INDEX "member_measurements_member_id_measured_on_idx" ON "member_measurements"("member_id", "measured_on");

-- CreateIndex
CREATE UNIQUE INDEX "member_measurements_member_id_measured_on_key" ON "member_measurements"("member_id", "measured_on");

-- CreateIndex
CREATE INDEX "training_sessions_trainer_id_idx" ON "training_sessions"("trainer_id");

-- CreateIndex
CREATE INDEX "training_sessions_member_id_idx" ON "training_sessions"("member_id");

-- CreateIndex
CREATE INDEX "training_sessions_starts_at_idx" ON "training_sessions"("starts_at");

-- CreateIndex
CREATE INDEX "training_sessions_trainer_id_starts_at_idx" ON "training_sessions"("trainer_id", "starts_at");

-- CreateIndex
CREATE INDEX "training_sessions_member_id_starts_at_idx" ON "training_sessions"("member_id", "starts_at");

-- CreateIndex
CREATE INDEX "training_sessions_status_idx" ON "training_sessions"("status");

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_days" ADD CONSTRAINT "workout_days_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "workout_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "workout_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_measurements" ADD CONSTRAINT "member_measurements_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_measurements" ADD CONSTRAINT "member_measurements_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
