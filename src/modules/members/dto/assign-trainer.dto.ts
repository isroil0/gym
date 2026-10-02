import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class AssignTrainerDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Trainer to assign, or null to unassign the current trainer.',
  })
  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsUUID('4', { message: 'trainerId must be a valid UUID or null' })
  trainerId!: string | null;
}
