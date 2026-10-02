import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompensationType, ProfileStatus, type Trainer, type User } from '@prisma/client';
import { trainerCode } from '../../../common/profiles/profile-code';
import { format } from '../../../common/money/money';
import { ProfileAccountDto } from '../../members/dto/member-response.dto';

export type TrainerWithRelations = Trainer & {
  user: User;
  _count?: { assignedMembers: number };
};

export class TrainerResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'T-000001' }) trainerCode!: string;
  @ApiProperty({ type: ProfileAccountDto }) account!: ProfileAccountDto;
  @ApiProperty({ enum: ProfileStatus, enumName: 'ProfileStatus' }) status!: ProfileStatus;

  @ApiPropertyOptional({ nullable: true }) specialization!: string | null;
  @ApiPropertyOptional({ nullable: true }) bio!: string | null;
  @ApiPropertyOptional({ nullable: true }) certifications!: string | null;

  @ApiPropertyOptional({
    example: 12,
    description: 'Number of members currently assigned. Present on list and detail reads.',
  })
  assignedMemberCount?: number;

  @ApiProperty({ enum: CompensationType, enumName: 'CompensationType' })
  compensationType!: CompensationType;
  @ApiPropertyOptional({ example: '2500.00', nullable: true }) monthlySalary!: string | null;
  @ApiPropertyOptional({ example: '15.00', nullable: true }) commissionRate!: string | null;

  @ApiProperty({ type: String, format: 'date-time' }) hiredAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;

  static from(trainer: TrainerWithRelations): TrainerResponseDto {
    return {
      id: trainer.id,
      trainerCode: trainerCode(trainer.trainerNumber),
      account: ProfileAccountDto.from(trainer.user),
      status: trainer.status,
      specialization: trainer.specialization,
      bio: trainer.bio,
      certifications: trainer.certifications,
      ...(trainer._count ? { assignedMemberCount: trainer._count.assignedMembers } : {}),
      compensationType: trainer.compensationType,
      monthlySalary: trainer.monthlySalary ? format(trainer.monthlySalary) : null,
      commissionRate: trainer.commissionRate ? format(trainer.commissionRate) : null,
      hiredAt: trainer.hiredAt,
      archivedAt: trainer.archivedAt,
      createdAt: trainer.createdAt,
      updatedAt: trainer.updatedAt,
    };
  }
}

export class ArchiveTrainerResponseDto extends TrainerResponseDto {
  @ApiProperty({
    example: 3,
    description: 'Members that were unassigned because their trainer was archived.',
  })
  unassignedMemberCount!: number;
}
