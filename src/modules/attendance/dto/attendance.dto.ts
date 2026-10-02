import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CheckInMethod,
  type Attendance,
  type Member,
  type MemberMembership,
  type MembershipPlan,
  type User,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { memberCode } from '../../../common/profiles/profile-code';
import { visitsRemaining } from '../../memberships/membership-period';

export class ManualCheckInDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId!: string;

  @ApiPropertyOptional({ description: 'Staff-facing notes about this visit' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class QrScanDto {
  @ApiProperty({
    example: 'GYM1.0b5f8a2e-1111-4000-8000-000000000001.2.9f1c...',
    description: "The exact string decoded from the member's QR card",
  })
  @TrimString()
  @IsString()
  @Length(10, 300)
  token!: string;
}

export class CheckOutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId!: string;
}

export class QueryAttendanceDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'memberId must be a valid UUID' })
  memberId?: string;

  @ApiPropertyOptional({ enum: CheckInMethod, enumName: 'CheckInMethod' })
  @IsOptional()
  @IsEnum(CheckInMethod, { message: 'method must be MANUAL or QR' })
  method?: CheckInMethod;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Visits on or after this date' })
  @IsOptional()
  @IsDateString({}, { message: 'from must be an ISO date such as 2026-10-01' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Visits on or before this date' })
  @IsOptional()
  @IsDateString({}, { message: 'to must be an ISO date such as 2026-10-31' })
  to?: string;
}

export type AttendanceWithRelations = Attendance & {
  member?: (Member & { user: User }) | null;
  membership?: (MemberMembership & { plan: MembershipPlan }) | null;
  recordedBy?: User | null;
};

export class AttendanceResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiPropertyOptional({ nullable: true }) memberCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) memberName!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true }) membershipId!: string | null;
  @ApiPropertyOptional({ nullable: true }) membershipPlanName!: string | null;

  @ApiProperty({ type: String, format: 'date-time' }) checkedInAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  checkedOutAt!: Date | null;

  @ApiProperty({ example: true, description: 'True while the member is still inside' })
  stillInside!: boolean;

  @ApiPropertyOptional({
    example: 72,
    nullable: true,
    description: 'Length of a completed visit in minutes. Null while still inside.',
  })
  durationMinutes!: number | null;

  @ApiProperty({ enum: CheckInMethod, enumName: 'CheckInMethod' }) method!: CheckInMethod;
  @ApiProperty({ example: true, description: 'Whether this visit consumed a limited allowance' })
  visitDeducted!: boolean;

  @ApiPropertyOptional({ nullable: true, description: "Omitted from a member's own view" })
  notes?: string | null;
  @ApiPropertyOptional({ nullable: true }) recordedBy!: string | null;

  static from(
    attendance: AttendanceWithRelations,
    includeStaffNotes = true,
  ): AttendanceResponseDto {
    const stillInside = attendance.checkedOutAt === null;

    return {
      id: attendance.id,
      memberId: attendance.memberId,
      memberCode: attendance.member ? memberCode(attendance.member.memberNumber) : null,
      memberName: attendance.member
        ? `${attendance.member.user.firstName} ${attendance.member.user.lastName}`
        : null,
      membershipId: attendance.membershipId,
      membershipPlanName: attendance.membership?.plan.name ?? null,
      checkedInAt: attendance.checkedInAt,
      checkedOutAt: attendance.checkedOutAt,
      stillInside,
      durationMinutes: stillInside
        ? null
        : Math.max(
            0,
            Math.round(
              (attendance.checkedOutAt!.getTime() - attendance.checkedInAt.getTime()) / 60_000,
            ),
          ),
      method: attendance.method,
      visitDeducted: attendance.visitDeducted,
      ...(includeStaffNotes ? { notes: attendance.notes } : {}),
      recordedBy: attendance.recordedBy
        ? `${attendance.recordedBy.firstName} ${attendance.recordedBy.lastName}`
        : null,
    };
  }
}

/** The answer the front desk needs: let them in, or why not. */
export class CheckInResultDto {
  @ApiProperty({ example: true }) admitted!: true;
  @ApiProperty({ type: AttendanceResponseDto }) attendance!: AttendanceResponseDto;

  @ApiPropertyOptional({
    example: 6,
    nullable: true,
    description: 'Visits left after this one. Null for an unlimited membership.',
  })
  visitsRemaining!: number | null;

  @ApiPropertyOptional({
    example: 12,
    nullable: true,
    description: 'Days left on the membership.',
  })
  membershipDaysRemaining!: number | null;
}

export class TodayAttendanceDto {
  @ApiProperty({ example: '2026-10-01' }) date!: string;
  @ApiProperty({ example: 37, description: 'Distinct members who came in today' })
  totalVisits!: number;
  @ApiProperty({ example: 12, description: 'Members currently inside' })
  currentlyInside!: number;
  @ApiProperty({ type: [AttendanceResponseDto] }) visits!: AttendanceResponseDto[];
}

export function computeVisitsRemaining(
  membership: { visitLimit: number | null; visitsUsed: number } | null,
): number | null {
  if (!membership) return null;
  return visitsRemaining(membership.visitLimit, membership.visitsUsed);
}

/** The code to render on the gym's door sign. */
export class DoorCodeDto {
  @ApiProperty({
    description: 'Encode this string into the QR shown at the door.',
    example: 'DOOR1.1.3f2a1c8e9b7d4a6f0e5c2b8d1a4f7c3e',
  })
  code!: string;

  @ApiProperty({
    description:
      'Which generation of the entry code this is. Rises by one each time ' +
      'staff reissue it, which retires every copy of the previous code.',
    example: 1,
  })
  version!: number;
}

/** A member admitting themselves by scanning the door sign. */
export class SelfCheckInDto {
  @ApiProperty({
    description: 'The exact string decoded from the QR shown at the gym door.',
    example: 'DOOR1.1.3f2a1c8e9b7d4a6f0e5c2b8d1a4f7c3e',
  })
  @IsString()
  @IsNotEmpty({ message: 'code should not be empty' })
  @MaxLength(256)
  code!: string;
}
