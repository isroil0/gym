import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembersService } from '../members/members.service';
import { ForbiddenError, NotFoundError } from '../../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

/**
 * The single answer to "may this caller touch this member's training data?".
 *
 * Everything in Phase 7 — plans, measurements, sessions — routes through here,
 * so the rule *a trainer may only reach their assigned members* is stated once
 * and reuses the member-visibility rule from Phase 3 rather than restating it.
 *
 * Out of reach reads as **not found**, matching the rest of the API, so a
 * trainer cannot discover which member ids exist by probing.
 */
@Injectable()
export class MemberAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
  ) {}

  /**
   * Asserts the caller may create or change training data for this member.
   *
   * A member can never write their own training data: a plan the member could
   * edit is not a plan their trainer wrote.
   */
  async assertCanManage(memberId: string, principal: AuthenticatedUser): Promise<void> {
    if (principal.role === UserRole.MEMBER) {
      throw new ForbiddenError('A member cannot change their own training data');
    }

    const visible = await this.prisma.member.findFirst({
      where: { AND: [{ id: memberId }, await this.members.scopeFor(principal)] },
      select: { id: true },
    });

    if (!visible) throw new NotFoundError('Member', memberId);
  }

  /** The `where` fragment limiting which members' data the caller may read. */
  async readScope(principal: AuthenticatedUser): Promise<Prisma.MemberWhereInput> {
    if (principal.role === UserRole.MEMBER) {
      return { userId: principal.id };
    }
    return this.members.scopeFor(principal);
  }

  /** The member profile belonging to the signed-in member. */
  async ownMemberId(userId: string): Promise<string> {
    const profile = await this.members.findByUserIdOrFail(userId);
    return profile.id;
  }

  /** The trainer profile belonging to the signed-in trainer, if they have one. */
  async ownTrainerId(userId: string): Promise<string | null> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { userId },
      select: { id: true },
    });

    return trainer?.id ?? null;
  }
}
