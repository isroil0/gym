import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TrainingSessionStatus,
  type Member,
  type Trainer,
  type TrainingSession,
  type User,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { memberCode, trainerCode } from '../../../common/profiles/profile-code';
import { sessionDurationMinutes } from '../session-scheduling';

export class CreateTrainingSessionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The trainer taking the session. An administrator must supply it; a ' +
      'trainer defaults to themselves and may not book for anyone else.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'trainerId must be a valid UUID' })
  trainerId?: string;

  @ApiProperty({ example: '2026-10-05T09:00:00.000Z' })
  @IsDateString({}, { message: 'startsAt must be an ISO date-time' })
  startsAt!: string;

  @ApiProperty({ example: '2026-10-05T10:00:00.000Z' })
  @IsDateString({}, { message: 'endsAt must be an ISO date-time' })
  endsAt!: string;

  @ApiPropertyOptional({ example: 'Studio 2' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 120)
  location?: string;

  @ApiPropertyOptional({ description: 'What the session will cover' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(4000)
  trainerNotes?: string;
}

export class RescheduleTrainingSessionDto {
  @ApiPropertyOptional({ example: '2026-10-06T09:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'startsAt must be an ISO date-time' })
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-10-06T10:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'endsAt must be an ISO date-time' })
  endsAt?: string;

  @ApiPropertyOptional({ example: 'Studio 1' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 120)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(4000)
  trainerNotes?: string;
}

export class CompleteTrainingSessionDto {
  @ApiPropertyOptional({ description: 'What actually happened in the session' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(4000)
  trainerNotes?: string;
}

export class CancelTrainingSessionDto {
  @ApiPropertyOptional({ example: 'Member unwell' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(2, 255)
  reason?: string;
}

export class QueryTrainingSessionsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'trainerId must be a valid UUID' })
  trainerId?: string;

  @ApiPropertyOptional({ enum: TrainingSessionStatus, enumName: 'TrainingSessionStatus' })
  @IsOptional()
  @IsEnum(TrainingSessionStatus, {
    message: 'status must be one of SCHEDULED, COMPLETED, CANCELLED, NO_SHOW',
  })
  status?: TrainingSessionStatus;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Sessions starting on or after' })
  @IsOptional()
  @IsDateString({}, { message: 'from must be an ISO date or date-time' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Sessions starting on or before' })
  @IsOptional()
  @IsDateString({}, { message: 'to must be an ISO date or date-time' })
  to?: string;
}

export type TrainingSessionWithRelations = TrainingSession & {
  member?: (Member & { user: User }) | null;
  trainer?: (Trainer & { user: User }) | null;
};

export class TrainingSessionResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;

  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiPropertyOptional({ nullable: true }) memberCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) memberName!: string | null;

  @ApiProperty({ format: 'uuid' }) trainerId!: string;
  @ApiPropertyOptional({ nullable: true }) trainerCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) trainerName!: string | null;

  @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) endsAt!: Date;
  @ApiProperty({ example: 60 }) durationMinutes!: number;

  @ApiProperty({ enum: TrainingSessionStatus, enumName: 'TrainingSessionStatus' })
  status!: TrainingSessionStatus;

  @ApiPropertyOptional({ nullable: true }) location!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'The member sees these.' })
  trainerNotes!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) cancellationReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;

  static from(session: TrainingSessionWithRelations): TrainingSessionResponseDto {
    return {
      id: session.id,
      memberId: session.memberId,
      memberCode: session.member ? memberCode(session.member.memberNumber) : null,
      memberName: session.member
        ? `${session.member.user.firstName} ${session.member.user.lastName}`
        : null,
      trainerId: session.trainerId,
      trainerCode: session.trainer ? trainerCode(session.trainer.trainerNumber) : null,
      trainerName: session.trainer
        ? `${session.trainer.user.firstName} ${session.trainer.user.lastName}`
        : null,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      durationMinutes: sessionDurationMinutes(session.startsAt, session.endsAt),
      status: session.status,
      location: session.location,
      trainerNotes: session.trainerNotes,
      completedAt: session.completedAt,
      cancelledAt: session.cancelledAt,
      cancellationReason: session.cancellationReason,
      createdAt: session.createdAt,
    };
  }
}
