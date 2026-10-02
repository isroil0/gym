import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { MembershipCard } from '@prisma/client';
import { IsOptional, IsString, Length } from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';

export class RevokeCardDto {
  @ApiPropertyOptional({ example: 'Card shared with a non-member' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(2, 255)
  reason?: string;
}

export class MembershipCardResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ example: 'M-000001' }) memberCode!: string;
  @ApiProperty({ example: 'Mia Member' }) memberName!: string;

  @ApiProperty({
    example: 'GYM1.0b5f8a2e-1111-4000-8000-000000000001.2.9f1c7a3e...',
    description:
      'Encode this string into a QR image. Derived, not stored, so it can be ' +
      're-rendered at any time; regenerating the card changes it.',
  })
  token!: string;

  @ApiProperty({ example: 2, description: 'Bumped on each regeneration' }) version!: number;
  @ApiProperty({ example: true }) active!: boolean;

  @ApiProperty({ type: String, format: 'date-time' }) issuedAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  revokedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) revokedReason!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: Date | null;

  static from(
    card: MembershipCard,
    token: string,
    member: { memberNumber: number; firstName: string; lastName: string },
    memberCodeOf: (memberNumber: number) => string,
  ): MembershipCardResponseDto {
    return {
      id: card.id,
      memberId: card.memberId,
      memberCode: memberCodeOf(member.memberNumber),
      memberName: `${member.firstName} ${member.lastName}`,
      token,
      version: card.version,
      active: card.revokedAt === null,
      issuedAt: card.issuedAt,
      revokedAt: card.revokedAt,
      revokedReason: card.revokedReason,
      lastUsedAt: card.lastUsedAt,
    };
  }
}
