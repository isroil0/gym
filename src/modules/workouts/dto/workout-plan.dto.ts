import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  WeightUnit,
  WorkoutPlanStatus,
  type Member,
  type Trainer,
  type User,
  type WorkoutDay,
  type WorkoutExercise,
  type WorkoutPlan,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { memberCode, trainerCode } from '../../../common/profiles/profile-code';

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export class CreateWorkoutPlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId!: string;

  @ApiProperty({ example: 'Autumn strength block' })
  @TrimString()
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional({ example: 'Four days a week, upper/lower split.' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ example: 'First 100kg squat' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(255)
  goal?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be an ISO date such as 2026-10-01' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString({}, { message: 'endDate must be an ISO date such as 2026-12-31' })
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Coaching notes. Unlike staff notes elsewhere, the member sees these.',
  })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(4000)
  trainerNotes?: string;
}

export class UpdateWorkoutPlanDto {
  @ApiPropertyOptional({ example: 'Winter strength block' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(255)
  goal?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be an ISO date such as 2026-10-01' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString({}, { message: 'endDate must be an ISO date such as 2026-12-31' })
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(4000)
  trainerNotes?: string;
}

export class CreateWorkoutDayDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: 31, description: 'Position in the cycle' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  dayOrder!: number;

  @ApiProperty({ example: 'Push day' })
  @TrimString()
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateWorkoutDayDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 31 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  dayOrder?: number;

  @ApiPropertyOptional({ example: 'Push day' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateWorkoutExerciseDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: 50, description: 'Position within the day' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  exerciseOrder!: number;

  @ApiProperty({ example: 'Barbell bench press' })
  @TrimString()
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional({ example: 'Chest' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 120)
  targetMuscleGroup?: string;

  @ApiProperty({ example: 4, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  sets!: number;

  @ApiProperty({
    example: '8-12',
    description: 'Free text, so "8-12", "AMRAP" and "30s" are all valid.',
  })
  @TrimString()
  @IsString()
  @Length(1, 30)
  reps!: string;

  @ApiPropertyOptional({ example: 80, minimum: 0, maximum: 9999.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'weight must be a number with at most 2 decimal places' },
  )
  @Min(0)
  @Max(9999.99)
  weight?: number;

  @ApiPropertyOptional({ enum: WeightUnit, enumName: 'WeightUnit', default: WeightUnit.KG })
  @IsOptional()
  @IsEnum(WeightUnit, { message: 'weightUnit must be KG or LB' })
  weightUnit?: WeightUnit;

  @ApiPropertyOptional({ example: 90, minimum: 0, maximum: 3600, description: 'Rest in seconds' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3600)
  restSeconds?: number;

  @ApiPropertyOptional({ example: '3-1-2-0' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 30)
  tempo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateWorkoutExerciseDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  exerciseOrder?: number;

  @ApiPropertyOptional({ example: 'Barbell bench press' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ example: 'Chest' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 120)
  targetMuscleGroup?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  sets?: number;

  @ApiPropertyOptional({ example: '8-12' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 30)
  reps?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'weight must be a number with at most 2 decimal places' },
  )
  @Min(0)
  @Max(9999.99)
  weight?: number;

  @ApiPropertyOptional({ enum: WeightUnit, enumName: 'WeightUnit' })
  @IsOptional()
  @IsEnum(WeightUnit, { message: 'weightUnit must be KG or LB' })
  weightUnit?: WeightUnit;

  @ApiPropertyOptional({ minimum: 0, maximum: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3600)
  restSeconds?: number;

  @ApiPropertyOptional({ example: '3-1-2-0' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 30)
  tempo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class QueryWorkoutPlansDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'trainerId must be a valid UUID' })
  trainerId?: string;

  @ApiPropertyOptional({ enum: WorkoutPlanStatus, enumName: 'WorkoutPlanStatus' })
  @IsOptional()
  @IsEnum(WorkoutPlanStatus, { message: 'status must be ACTIVE or ARCHIVED' })
  status?: WorkoutPlanStatus;

  @ApiPropertyOptional({ description: 'Case-insensitive match on plan name or goal' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(120)
  search?: string;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export class WorkoutExerciseResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 1 }) exerciseOrder!: number;
  @ApiProperty({ example: 'Barbell bench press' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) targetMuscleGroup!: string | null;
  @ApiProperty({ example: 4 }) sets!: number;
  @ApiProperty({ example: '8-12' }) reps!: string;
  @ApiPropertyOptional({ example: '80.00', nullable: true, description: 'Exact decimal string' })
  weight!: string | null;
  @ApiProperty({ enum: WeightUnit, enumName: 'WeightUnit' }) weightUnit!: WeightUnit;
  @ApiPropertyOptional({ example: 90, nullable: true }) restSeconds!: number | null;
  @ApiPropertyOptional({ example: '3-1-2-0', nullable: true }) tempo!: string | null;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;

  static from(exercise: WorkoutExercise): WorkoutExerciseResponseDto {
    return {
      id: exercise.id,
      exerciseOrder: exercise.exerciseOrder,
      name: exercise.name,
      targetMuscleGroup: exercise.targetMuscleGroup,
      sets: exercise.sets,
      reps: exercise.reps,
      weight: exercise.weight ? exercise.weight.toFixed(2) : null,
      weightUnit: exercise.weightUnit,
      restSeconds: exercise.restSeconds,
      tempo: exercise.tempo,
      notes: exercise.notes,
    };
  }
}

export class WorkoutDayResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 1 }) dayOrder!: number;
  @ApiProperty({ example: 'Push day' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty({ type: [WorkoutExerciseResponseDto] }) exercises!: WorkoutExerciseResponseDto[];

  static from(day: WorkoutDay & { exercises: WorkoutExercise[] }): WorkoutDayResponseDto {
    return {
      id: day.id,
      dayOrder: day.dayOrder,
      name: day.name,
      notes: day.notes,
      exercises: day.exercises.map((exercise) => WorkoutExerciseResponseDto.from(exercise)),
    };
  }
}

export type WorkoutPlanWithRelations = WorkoutPlan & {
  member?: (Member & { user: User }) | null;
  trainer?: (Trainer & { user: User }) | null;
  days?: Array<WorkoutDay & { exercises: WorkoutExercise[] }>;
};

export class WorkoutPlanResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiPropertyOptional({ nullable: true }) memberCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) memberName!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true }) trainerId!: string | null;
  @ApiPropertyOptional({ nullable: true }) trainerCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) trainerName!: string | null;

  @ApiProperty({ example: 'Autumn strength block' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiPropertyOptional({ nullable: true }) goal!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true }) startDate!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true }) endDate!: Date | null;

  @ApiPropertyOptional({ nullable: true, description: 'Coaching notes; the member sees these.' })
  trainerNotes!: string | null;

  @ApiProperty({ enum: WorkoutPlanStatus, enumName: 'WorkoutPlanStatus' })
  status!: WorkoutPlanStatus;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt!: Date | null;

  @ApiProperty({ example: 3, description: 'Number of training days in the plan' })
  dayCount!: number;
  @ApiProperty({ example: 18, description: 'Total prescribed exercises across all days' })
  exerciseCount!: number;

  @ApiPropertyOptional({
    type: [WorkoutDayResponseDto],
    description: 'The full programme. Present on detail reads, omitted from lists.',
  })
  days?: WorkoutDayResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;

  /**
   * @param includeDays false for list reads, which report the counts but not
   *        the whole programme. The counts are derived either way.
   */
  static from(plan: WorkoutPlanWithRelations, includeDays = true): WorkoutPlanResponseDto {
    const days = plan.days ?? [];

    return {
      id: plan.id,
      memberId: plan.memberId,
      memberCode: plan.member ? memberCode(plan.member.memberNumber) : null,
      memberName: plan.member ? `${plan.member.user.firstName} ${plan.member.user.lastName}` : null,
      trainerId: plan.trainerId,
      trainerCode: plan.trainer ? trainerCode(plan.trainer.trainerNumber) : null,
      trainerName: plan.trainer
        ? `${plan.trainer.user.firstName} ${plan.trainer.user.lastName}`
        : null,
      name: plan.name,
      description: plan.description,
      goal: plan.goal,
      startDate: plan.startDate,
      endDate: plan.endDate,
      trainerNotes: plan.trainerNotes,
      status: plan.status,
      archivedAt: plan.archivedAt,
      dayCount: days.length,
      exerciseCount: days.reduce((total, day) => total + day.exercises.length, 0),
      ...(includeDays && plan.days
        ? { days: days.map((day) => WorkoutDayResponseDto.from(day)) }
        : {}),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }
}
