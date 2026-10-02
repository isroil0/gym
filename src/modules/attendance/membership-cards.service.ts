import { Injectable, Logger } from '@nestjs/common';
import type { MembershipCard, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/configuration';
import { MembersService } from '../members/members.service';
import { ConflictError, NotFoundError } from '../../common/errors/app.exception';
import { memberCode } from '../../common/profiles/profile-code';
import { MembershipCardResponseDto } from './dto/membership-card.dto';
import { buildCardToken } from './membership-card-token';

export interface CardWithMember {
  card: MembershipCard;
  member: { memberNumber: number; firstName: string; lastName: string };
}

@Injectable()
export class MembershipCardsService {
  private readonly logger = new Logger(MembershipCardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly members: MembersService,
  ) {}

  /** The scannable payload for a card. Derived, never stored. */
  tokenFor(card: MembershipCard): string {
    return buildCardToken({ memberId: card.memberId, version: card.version }, this.config.qrSecret);
  }

  present(loaded: CardWithMember): MembershipCardResponseDto {
    return MembershipCardResponseDto.from(
      loaded.card,
      this.tokenFor(loaded.card),
      loaded.member,
      memberCode,
    );
  }

  /**
   * A member's card, issuing one on first request.
   *
   * Issuing on demand means a member always has a card without an extra
   * administrative step, and there is nothing to backfill for members created
   * before this phase.
   */
  async ensureForMember(memberId: string): Promise<CardWithMember> {
    const member = await this.members.findOneOrFail(memberId);

    const existing = await this.prisma.membershipCard.findUnique({ where: { memberId } });
    const card = existing ?? (await this.issue(memberId));

    if (!existing) {
      this.logger.log(`Issued membership card for member ${memberId}`);
    }

    return {
      card,
      member: {
        memberNumber: member.memberNumber,
        firstName: member.user.firstName,
        lastName: member.user.lastName,
      },
    };
  }

  async forUser(userId: string): Promise<CardWithMember> {
    const profile = await this.members.findByUserIdOrFail(userId);
    return this.ensureForMember(profile.id);
  }

  /**
   * Replaces the card with a new version.
   *
   * Every copy of the previous QR — printed, screenshotted, forwarded — stops
   * verifying immediately, because the signature covers the version. Also
   * clears any revocation, so this doubles as reinstating a blocked card.
   */
  async regenerate(memberId: string): Promise<CardWithMember> {
    const { member } = await this.ensureForMember(memberId);

    const card = await this.prisma.membershipCard.update({
      where: { memberId },
      data: {
        version: { increment: 1 },
        issuedAt: new Date(),
        revokedAt: null,
        revokedReason: null,
      },
    });

    this.logger.log(`Regenerated membership card for member ${memberId} (version ${card.version})`);
    return { card, member };
  }

  async revoke(memberId: string, reason?: string): Promise<CardWithMember> {
    const loaded = await this.ensureForMember(memberId);

    if (loaded.card.revokedAt !== null) {
      throw new ConflictError(`The membership card for member '${memberId}' is already revoked`);
    }

    const card = await this.prisma.membershipCard.update({
      where: { memberId },
      data: { revokedAt: new Date(), revokedReason: reason ?? null },
    });

    this.logger.warn(
      `Revoked membership card for member ${memberId}${reason ? ` (${reason})` : ''}`,
    );
    return { card: card, member: loaded.member };
  }

  /** Looks up a card by the member a scanned token claims to belong to. */
  findByMemberId(memberId: string): Promise<MembershipCard | null> {
    return this.prisma.membershipCard.findUnique({ where: { memberId } });
  }

  /** Records that a card was used, inside the caller's transaction. */
  async markUsed(tx: Prisma.TransactionClient, memberId: string, at: Date): Promise<void> {
    await tx.membershipCard.update({ where: { memberId }, data: { lastUsedAt: at } });
  }

  private issue(memberId: string): Promise<MembershipCard> {
    return this.prisma.membershipCard.create({ data: { memberId } });
  }

  /** Used by the attendance service to turn a token's member id into a card. */
  async requireCard(memberId: string): Promise<MembershipCard> {
    const card = await this.findByMemberId(memberId);
    if (!card) throw new NotFoundError('Membership card for member', memberId);
    return card;
  }
}
