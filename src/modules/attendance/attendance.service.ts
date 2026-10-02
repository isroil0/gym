import { Injectable, Logger } from '@nestjs/common';
import { CheckInMethod, Prisma, UserRole, type Attendance } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/configuration';
import { MembersService } from '../members/members.service';
import { MembershipsService } from '../memberships/memberships.service';
import { MembershipCardsService } from './membership-cards.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import { daysRemaining, toDateOnly, visitsRemaining } from '../memberships/membership-period';
import { GymTimeService } from '../../common/time/gym-time.service';
import {
  ENTRY_DENIAL_MESSAGES,
  EntryDenialReason,
  decideEntry,
  type EntryDecision,
} from './entry-eligibility';
import { parseCardToken } from './membership-card-token';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type { AttendanceWithRelations, QueryAttendanceDto } from './dto/attendance.dto';

const ATTENDANCE_INCLUDE = {
  member: { include: { user: true } },
  membership: { include: { plan: true } },
  recordedBy: true,
} satisfies Prisma.AttendanceInclude;

/** Postgres unique-violation code, raised by the one-open-visit index. */
const UNIQUE_VIOLATION = 'P2002';

export interface CheckInOutcome {
  attendance: AttendanceWithRelations;
  visitsRemaining: number | null;
  membershipDaysRemaining: number | null;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly members: MembersService,
    private readonly memberships: MembershipsService,
    private readonly cards: MembershipCardsService,
    private readonly gymTime: GymTimeService,
  ) {}

  // -------------------------------------------------------------------------
  // Check-in
  // -------------------------------------------------------------------------

  /** Front-desk check-in, where staff have identified the member themselves. */
  async checkInManually(
    memberId: string,
    actor: AuthenticatedUser,
    notes?: string,
  ): Promise<CheckInOutcome> {
    return this.admit(memberId, CheckInMethod.MANUAL, { actorId: actor.id, notes });
  }

  /**
   * Check-in by scanning a QR membership card.
   *
   * The signature is verified before the database is touched, so a forged or
   * foreign QR never becomes a lookup. Card currency — revoked, superseded by a
   * newer version — is then checked against the stored card.
   */
  async checkInByCard(token: string, actor: AuthenticatedUser): Promise<CheckInOutcome> {
    const parsed = parseCardToken(token, this.config.qrSecret);

    if (!parsed.ok) {
      this.logger.warn(`Rejected QR scan: ${parsed.reason}`);
      throw AttendanceService.denied(EntryDenialReason.CARD_INVALID);
    }

    const card = await this.cards.findByMemberId(parsed.payload.memberId);

    if (!card) {
      throw AttendanceService.denied(EntryDenialReason.CARD_NOT_ISSUED);
    }

    if (card.revokedAt !== null) {
      this.logger.warn(`Rejected revoked card for member ${card.memberId}`);
      throw AttendanceService.denied(EntryDenialReason.CARD_REVOKED);
    }

    if (card.version !== parsed.payload.version) {
      this.logger.warn(
        `Rejected superseded card for member ${card.memberId} ` +
          `(presented v${parsed.payload.version}, current v${card.version})`,
      );
      throw AttendanceService.denied(EntryDenialReason.CARD_SUPERSEDED);
    }

    return this.admit(card.memberId, CheckInMethod.QR, { actorId: actor.id, markCardUsed: true });
  }

  /**
   * The single path into the gym, shared by both check-in methods so the
   * membership rules cannot drift between the door and the front desk.
   */
  private async admit(
    memberId: string,
    method: CheckInMethod,
    options: { actorId?: string; notes?: string; markCardUsed?: boolean } = {},
  ): Promise<CheckInOutcome> {
    const member = await this.members.findOneOrFail(memberId);
    const membership = await this.memberships.findRelevantForEntry(memberId);
    const openVisit = await this.findOpenVisit(memberId);

    const decision: EntryDecision = decideEntry({
      memberStatus: member.status,
      accountStatus: member.user.status,
      membership: membership
        ? {
            id: membership.id,
            status: membership.status,
            visitLimit: membership.visitLimit,
            visitsUsed: membership.visitsUsed,
          }
        : null,
      alreadyInside: openVisit !== null,
    });

    if (!decision.allowed) {
      this.logger.warn(`Entry refused for member ${memberId}: ${decision.reason}`);
      throw AttendanceService.denied(decision.reason);
    }

    const checkedInAt = new Date();

    let created: Attendance;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const attendance = await tx.attendance.create({
          data: {
            memberId,
            membershipId: decision.membershipId,
            checkedInAt,
            method,
            visitDeducted: decision.deductsVisit,
            recordedByUserId: options.actorId ?? null,
            notes: options.notes ?? null,
          },
        });

        if (decision.deductsVisit) {
          await this.memberships.consumeVisit(tx, decision.membershipId);
        }

        if (options.markCardUsed) {
          await this.cards.markUsed(tx, memberId, checkedInAt);
        }

        return attendance;
      });
    } catch (error) {
      // The partial unique index is the real guard against a double check-in:
      // two concurrent scans can both pass the check above, but only one row
      // can exist with checked_out_at null.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw AttendanceService.denied(EntryDenialReason.ALREADY_INSIDE);
      }
      throw error;
    }

    this.logger.log(
      `Checked in member ${memberId} by ${method}` +
        (decision.deductsVisit ? `; ${decision.visitsRemainingAfter} visit(s) left` : ''),
    );

    return {
      attendance: await this.findOneOrFail(created.id),
      visitsRemaining: decision.visitsRemainingAfter,
      membershipDaysRemaining: membership ? daysRemaining(membership) : null,
    };
  }

  // -------------------------------------------------------------------------
  // Check-out
  // -------------------------------------------------------------------------

  async checkOutMember(memberId: string): Promise<AttendanceWithRelations> {
    await this.members.findOneOrFail(memberId);

    const open = await this.findOpenVisit(memberId);
    if (!open) {
      throw new ConflictError('This member is not currently checked in', [
        { field: 'memberId', messages: ['no open visit to close'] },
      ]);
    }

    return this.closeVisit(open.id);
  }

  /** Check-out by scanning the same card used to get in. */
  async checkOutByCard(token: string): Promise<AttendanceWithRelations> {
    const parsed = parseCardToken(token, this.config.qrSecret);

    if (!parsed.ok) {
      throw AttendanceService.denied(EntryDenialReason.CARD_INVALID);
    }

    // A revoked or superseded card may still close a visit: the member is
    // inside and must be able to leave, and nothing is granted by letting them.
    return this.checkOutMember(parsed.payload.memberId);
  }

  async checkOutById(attendanceId: string): Promise<AttendanceWithRelations> {
    const attendance = await this.findOneOrFail(attendanceId);

    if (attendance.checkedOutAt !== null) {
      throw new ConflictError(`Visit '${attendanceId}' is already checked out`);
    }

    return this.closeVisit(attendanceId);
  }

  private async closeVisit(attendanceId: string): Promise<AttendanceWithRelations> {
    const closed = await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: { checkedOutAt: new Date() },
      include: ATTENDANCE_INCLUDE,
    });

    this.logger.log(`Checked out member ${closed.memberId} (visit ${attendanceId})`);
    return closed;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  findOpenVisit(memberId: string): Promise<Attendance | null> {
    return this.prisma.attendance.findFirst({
      where: { memberId, checkedOutAt: null },
      orderBy: { checkedInAt: 'desc' },
    });
  }

  /** Restricts attendance queries by who may see the owning member. */
  private async scopeFor(principal: AuthenticatedUser): Promise<Prisma.AttendanceWhereInput> {
    if (principal.role === UserRole.ADMIN) return {};
    if (principal.role === UserRole.TRAINER) {
      return { member: await this.members.scopeFor(principal) };
    }
    return { member: { userId: principal.id } };
  }

  async findMany(
    query: QueryAttendanceDto,
    principal: AuthenticatedUser,
  ): Promise<PaginatedResult<AttendanceWithRelations>> {
    const filters: Prisma.AttendanceWhereInput[] = [await this.scopeFor(principal)];

    if (query.memberId) filters.push({ memberId: query.memberId });
    if (query.method) filters.push({ method: query.method });
    if (query.from) filters.push({ checkedInAt: { gte: toDateOnly(new Date(query.from)) } });
    if (query.to) {
      const end = toDateOnly(new Date(query.to));
      filters.push({ checkedInAt: { lt: new Date(end.getTime() + 86_400_000) } });
    }

    const where: Prisma.AttendanceWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: ATTENDANCE_INCLUDE,
        skip: query.skip,
        take: query.take,
        orderBy: [{ checkedInAt: 'desc' }],
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findOneScoped(id: string, principal: AuthenticatedUser): Promise<AttendanceWithRelations> {
    const attendance = await this.prisma.attendance.findFirst({
      where: { AND: [{ id }, await this.scopeFor(principal)] },
      include: ATTENDANCE_INCLUDE,
    });

    if (!attendance) throw new NotFoundError('Attendance record', id);
    return attendance;
  }

  async findOneOrFail(id: string): Promise<AttendanceWithRelations> {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      include: ATTENDANCE_INCLUDE,
    });

    if (!attendance) throw new NotFoundError('Attendance record', id);
    return attendance;
  }

  /** Everyone who came in on a given day, and who is still inside. */
  async forDay(day: Date): Promise<{
    date: string;
    visits: AttendanceWithRelations[];
    currentlyInside: number;
  }> {
    // The gym's day, not UTC's: a 22:00 check-in belongs to the day the member
    // thinks they came in on.
    const localDate = this.gymTime.localDateOf(day);
    const { start, end } = this.gymTime.day(localDate);

    const [visits, currentlyInside] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where: { checkedInAt: { gte: start, lt: end } },
        include: ATTENDANCE_INCLUDE,
        orderBy: [{ checkedInAt: 'desc' }],
      }),
      this.prisma.attendance.count({ where: { checkedOutAt: null } }),
    ]);

    return { date: localDate, visits, currentlyInside };
  }

  /** Visits remaining on the membership a member would use next. */
  async visitsRemainingForMember(memberId: string): Promise<number | null> {
    const membership = await this.memberships.findRelevantForEntry(memberId);
    if (!membership) return null;

    return visitsRemaining(membership.visitLimit, membership.visitsUsed);
  }

  /**
   * Turns a denial reason into the API error.
   *
   * The reason code travels in `details` so a door terminal can branch on it,
   * while `message` stays readable for the person at the desk.
   */
  private static denied(reason: EntryDenialReason): BusinessRuleError {
    return new BusinessRuleError(ENTRY_DENIAL_MESSAGES[reason], [
      { field: 'reason', messages: [reason] },
    ]);
  }
}
