import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Member, MemberMeasurement, User } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { memberCode } from '../../../common/profiles/profile-code';
import { TRACKED_METRICS, type MetricProgress, type TrackedMetric } from '../progress-math';

/** Reusable numeric bounds, so a typo cannot store an impossible body. */
const BOUNDS = {
  weightKg: [20, 500],
  heightCm: [50, 260],
  bodyFatPercent: [1, 80],
  muscleMassKg: [5, 200],
  circumferenceCm: [10, 300],
  restingHeartRate: [25, 220],
} as const;

export class MeasurementFieldsDto {
  @ApiPropertyOptional({ example: 84.5, minimum: BOUNDS.weightKg[0], maximum: BOUNDS.weightKg[1] })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'weightKg must be a number with at most 2 decimal places' },
  )
  @Min(BOUNDS.weightKg[0])
  @Max(BOUNDS.weightKg[1])
  weightKg?: number;

  @ApiPropertyOptional({ example: 180, minimum: BOUNDS.heightCm[0], maximum: BOUNDS.heightCm[1] })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 1 },
    { message: 'heightCm must be a number with at most 1 decimal place' },
  )
  @Min(BOUNDS.heightCm[0])
  @Max(BOUNDS.heightCm[1])
  heightCm?: number;

  @ApiPropertyOptional({
    example: 21.5,
    minimum: BOUNDS.bodyFatPercent[0],
    maximum: BOUNDS.bodyFatPercent[1],
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 1 },
    { message: 'bodyFatPercent must be a number with at most 1 decimal place' },
  )
  @Min(BOUNDS.bodyFatPercent[0])
  @Max(BOUNDS.bodyFatPercent[1])
  bodyFatPercent?: number;

  @ApiPropertyOptional({
    example: 38.2,
    minimum: BOUNDS.muscleMassKg[0],
    maximum: BOUNDS.muscleMassKg[1],
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'muscleMassKg must be a number with at most 2 decimal places' },
  )
  @Min(BOUNDS.muscleMassKg[0])
  @Max(BOUNDS.muscleMassKg[1])
  muscleMassKg?: number;

  @ApiPropertyOptional({ example: 102.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(BOUNDS.circumferenceCm[0])
  @Max(BOUNDS.circumferenceCm[1])
  chestCm?: number;

  @ApiPropertyOptional({ example: 86 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(BOUNDS.circumferenceCm[0])
  @Max(BOUNDS.circumferenceCm[1])
  waistCm?: number;

  @ApiPropertyOptional({ example: 98 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(BOUNDS.circumferenceCm[0])
  @Max(BOUNDS.circumferenceCm[1])
  hipsCm?: number;

  @ApiPropertyOptional({ example: 58 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(BOUNDS.circumferenceCm[0])
  @Max(BOUNDS.circumferenceCm[1])
  thighCm?: number;

  @ApiPropertyOptional({ example: 34 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(BOUNDS.circumferenceCm[0])
  @Max(BOUNDS.circumferenceCm[1])
  armCm?: number;

  @ApiPropertyOptional({
    example: 58,
    minimum: BOUNDS.restingHeartRate[0],
    maximum: BOUNDS.restingHeartRate[1],
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(BOUNDS.restingHeartRate[0])
  @Max(BOUNDS.restingHeartRate[1])
  restingHeartRate?: number;

  @ApiPropertyOptional({ description: 'Notes about the reading. The member sees these.' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateMeasurementDto extends MeasurementFieldsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId!: string;

  @ApiProperty({
    example: '2026-10-01',
    description: 'One set of measurements per member per date',
  })
  @IsDateString({}, { message: 'measuredOn must be an ISO date such as 2026-10-01' })
  measuredOn!: string;
}

export class UpdateMeasurementDto extends MeasurementFieldsDto {}

export class QueryMeasurementsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString({}, { message: 'from must be an ISO date such as 2026-01-01' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString({}, { message: 'to must be an ISO date such as 2026-12-31' })
  to?: string;
}

export type MeasurementWithRelations = MemberMeasurement & {
  member?: (Member & { user: User }) | null;
  recordedBy?: User | null;
};

function decimalOrNull(
  value: { toFixed(places: number): string } | null,
  places: number,
): string | null {
  return value === null ? null : value.toFixed(places);
}

export class MeasurementResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiPropertyOptional({ nullable: true }) memberCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) memberName!: string | null;

  @ApiProperty({ type: String, format: 'date' }) measuredOn!: Date;

  @ApiPropertyOptional({ example: '84.50', nullable: true }) weightKg!: string | null;
  @ApiPropertyOptional({ example: '180.0', nullable: true }) heightCm!: string | null;
  @ApiPropertyOptional({ example: '21.5', nullable: true }) bodyFatPercent!: string | null;
  @ApiPropertyOptional({ example: '38.20', nullable: true }) muscleMassKg!: string | null;
  @ApiPropertyOptional({ example: '102.5', nullable: true }) chestCm!: string | null;
  @ApiPropertyOptional({ example: '86.0', nullable: true }) waistCm!: string | null;
  @ApiPropertyOptional({ example: '98.0', nullable: true }) hipsCm!: string | null;
  @ApiPropertyOptional({ example: '58.0', nullable: true }) thighCm!: string | null;
  @ApiPropertyOptional({ example: '34.0', nullable: true }) armCm!: string | null;
  @ApiPropertyOptional({ example: 58, nullable: true }) restingHeartRate!: number | null;

  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiPropertyOptional({ nullable: true }) recordedBy!: string | null;

  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;

  static from(measurement: MeasurementWithRelations): MeasurementResponseDto {
    return {
      id: measurement.id,
      memberId: measurement.memberId,
      memberCode: measurement.member ? memberCode(measurement.member.memberNumber) : null,
      memberName: measurement.member
        ? `${measurement.member.user.firstName} ${measurement.member.user.lastName}`
        : null,
      measuredOn: measurement.measuredOn,
      weightKg: decimalOrNull(measurement.weightKg, 2),
      heightCm: decimalOrNull(measurement.heightCm, 1),
      bodyFatPercent: decimalOrNull(measurement.bodyFatPercent, 1),
      muscleMassKg: decimalOrNull(measurement.muscleMassKg, 2),
      chestCm: decimalOrNull(measurement.chestCm, 1),
      waistCm: decimalOrNull(measurement.waistCm, 1),
      hipsCm: decimalOrNull(measurement.hipsCm, 1),
      thighCm: decimalOrNull(measurement.thighCm, 1),
      armCm: decimalOrNull(measurement.armCm, 1),
      restingHeartRate: measurement.restingHeartRate,
      notes: measurement.notes,
      recordedBy: measurement.recordedBy
        ? `${measurement.recordedBy.firstName} ${measurement.recordedBy.lastName}`
        : null,
      createdAt: measurement.createdAt,
    };
  }
}

export class MetricProgressDto {
  @ApiProperty({ enum: TRACKED_METRICS, example: 'weightKg' }) metric!: TrackedMetric;
  @ApiProperty({ example: 90 }) first!: number;
  @ApiProperty({ type: String, format: 'date' }) firstMeasuredOn!: Date;
  @ApiProperty({ example: 84 }) latest!: number;
  @ApiProperty({ type: String, format: 'date' }) latestMeasuredOn!: Date;
  @ApiProperty({ example: -6, description: 'latest − first; negative means it came down' })
  change!: number;
  @ApiPropertyOptional({ example: -6.67, nullable: true }) changePercent!: number | null;
  @ApiProperty({ example: 7 }) readings!: number;

  static from(progress: MetricProgress): MetricProgressDto {
    return { ...progress };
  }
}

export class MemberProgressDto {
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ example: 'Mia Member' }) memberName!: string;

  @ApiProperty({ example: 7, description: 'Measurement sets recorded in the period' })
  measurementCount!: number;

  @ApiPropertyOptional({
    example: { weightKg: 84, heightCm: 180 },
    description: 'The most recent non-null reading for each metric',
  })
  current!: Partial<Record<TrackedMetric, number>>;

  @ApiPropertyOptional({
    example: 25.9,
    nullable: true,
    description: 'From the latest known weight and height; null unless both are known.',
  })
  bmi!: number | null;

  @ApiProperty({
    type: [MetricProgressDto],
    description: 'Only metrics with at least two readings — one point is not progress.',
  })
  progress!: MetricProgressDto[];

  @ApiProperty({ type: [MeasurementResponseDto], description: 'The series, newest first' })
  measurements!: MeasurementResponseDto[];
}
