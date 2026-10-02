import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { TrimString } from '../transformers/normalize';

/**
 * The profile fields a user may edit about themselves. Deliberately excludes
 * anything that carries authorization or business meaning (role, status,
 * assigned trainer, codes, notes) — those are administrator decisions.
 */
export class SelfEditableContactDto {
  @ApiPropertyOptional({ example: '+15550100' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(3, 30)
  phone?: string;

  @ApiPropertyOptional({ example: '12 Queen Street, Springfield' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(1, 255)
  address?: string;
}
