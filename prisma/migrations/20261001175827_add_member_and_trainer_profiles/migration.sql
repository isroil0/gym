-- CreateEnum
CREATE TYPE "profile_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "member_number" SERIAL NOT NULL,
    "date_of_birth" DATE,
    "gender" "gender",
    "address" VARCHAR(255),
    "emergency_contact_name" VARCHAR(100),
    "emergency_contact_phone" VARCHAR(30),
    "notes" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "profile_status" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMP(3),
    "assigned_trainer_id" UUID,
    "assigned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "trainer_number" SERIAL NOT NULL,
    "specialization" VARCHAR(120),
    "bio" TEXT,
    "certifications" TEXT,
    "hired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "profile_status" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_user_id_key" ON "members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_member_number_key" ON "members"("member_number");

-- CreateIndex
CREATE INDEX "members_status_idx" ON "members"("status");

-- CreateIndex
CREATE INDEX "members_assigned_trainer_id_idx" ON "members"("assigned_trainer_id");

-- CreateIndex
CREATE INDEX "members_assigned_trainer_id_status_idx" ON "members"("assigned_trainer_id", "status");

-- CreateIndex
CREATE INDEX "members_joined_at_idx" ON "members"("joined_at");

-- CreateIndex
CREATE UNIQUE INDEX "trainers_user_id_key" ON "trainers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trainers_trainer_number_key" ON "trainers"("trainer_number");

-- CreateIndex
CREATE INDEX "trainers_status_idx" ON "trainers"("status");

-- CreateIndex
CREATE INDEX "trainers_hired_at_idx" ON "trainers"("hired_at");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_assigned_trainer_id_fkey" FOREIGN KEY ("assigned_trainer_id") REFERENCES "trainers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
