import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Gender,
  ProfileStatus,
  UserStatus,
  type Member,
  type Trainer,
  type User,
} from '@prisma/client';
import { memberCode, trainerCode } from '../../../common/profiles/profile-code';

/** The account details shown alongside a profile. Never includes credentials. */
export class ProfileAccountDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'mia@gym.local' }) email!: string;
  @ApiProperty({ example: 'Mia' }) firstName!: string;
  @ApiProperty({ example: 'Member' }) lastName!: string;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' }) status!: UserStatus;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastLoginAt!: Date | null;

  static from(user: User): ProfileAccountDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
    };
  }
}

/** A trainer as referenced from a member record. */
export class AssignedTrainerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'T-000001' }) trainerCode!: string;
  @ApiProperty({ example: 'Tina' }) firstName!: string;
  @ApiProperty({ example: 'Trainer' }) lastName!: string;
  @ApiPropertyOptional({ nullable: true }) specialization!: string | null;
  @ApiProperty({ enum: ProfileStatus, enumName: 'ProfileStatus' }) status!: ProfileStatus;

  static from(trainer: Trainer & { user: User }): AssignedTrainerDto {
    return {
      id: trainer.id,
      trainerCode: trainerCode(trainer.trainerNumber),
      firstName: trainer.user.firstName,
      lastName: trainer.user.lastName,
      specialization: trainer.specialization,
      status: trainer.status,
    };
  }
}

export type MemberWithRelations = Member & {
  user: User;
  assignedTrainer: (Trainer & { user: User }) | null;
};

export class MemberResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ type: ProfileAccountDto }) account!: ProfileAccountDto;
  @ApiProperty({ enum: ProfileStatus, enumName: 'ProfileStatus' }) status!: ProfileStatus;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  dateOfBirth!: Date | null;
  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', nullable: true })
  gender!: Gender | null;
  @ApiPropertyOptional({ nullable: true }) address!: string | null;
  @ApiPropertyOptional({ nullable: true }) emergencyContactName!: string | null;
  @ApiPropertyOptional({ nullable: true }) emergencyContactPhone!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Staff-facing notes. Omitted when a member reads their own profile.',
  })
  notes?: string | null;

  @ApiPropertyOptional({ type: AssignedTrainerDto, nullable: true })
  assignedTrainer!: AssignedTrainerDto | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  assignedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' }) joinedAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;

  /**
   * @param includeStaffNotes false when the member themselves is the reader —
   *        staff notes are about the member, not for them.
   */
  static from(member: MemberWithRelations, includeStaffNotes = true): MemberResponseDto {
    return {
      id: member.id,
      memberCode: memberCode(member.memberNumber),
      account: ProfileAccountDto.from(member.user),
      status: member.status,
      dateOfBirth: member.dateOfBirth,
      gender: member.gender,
      address: member.address,
      emergencyContactName: member.emergencyContactName,
      emergencyContactPhone: member.emergencyContactPhone,
      ...(includeStaffNotes ? { notes: member.notes } : {}),
      assignedTrainer: member.assignedTrainer
        ? AssignedTrainerDto.from(member.assignedTrainer)
        : null,
      assignedAt: member.assignedAt,
      joinedAt: member.joinedAt,
      archivedAt: member.archivedAt,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    };
  }
}
