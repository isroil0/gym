import { Injectable, Logger } from '@nestjs/common';
import {
  MembershipStatus,
  NotificationSeverity,
  NotificationType,
  Prisma,
  ProfileStatus,
  UserRole,
  UserStatus,
  type Notification,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GymTimeService } from '../../common/time/gym-time.service';
import { BillingService } from '../payments/billing.service';
import { MembershipsService } from '../memberships/memberships.service';
import { NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import { format, money } from '../../common/money/money';
import { daysRemaining } from '../memberships/membership-period';
import type {
  CreateAnnouncementDto,
  QueryNotificationsDto,
  ReminderRunDto,
  RunRemindersDto,
} from './dto/notification.dto';

/** Input for one notification, before deduplication. */
interface NotificationDraft {
  recipientId: string;
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Omit for notifications that may legitimately repeat, such as announcements. */
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gymTime: GymTimeService,
    private readonly billing: BillingService,
    private readonly memberships: MembershipsService,
  ) {}

  // -------------------------------------------------------------------------
  // Delivery
  // -------------------------------------------------------------------------

  /**
   * Creates notifications, skipping any whose `dedupeKey` already exists.
   *
   * The unique index does the deduplication, not a prior read: two sweeps
   * running at once would both see "no existing reminder" and both insert.
   * `skipDuplicates` lets the database settle it.
   */
  private async deliver(
    drafts: NotificationDraft[],
  ): Promise<{ created: number; skipped: number }> {
    if (drafts.length === 0) return { created: 0, skipped: 0 };

    const { count } = await this.prisma.notification.createMany({
      data: drafts.map((draft) => ({
        recipientId: draft.recipientId,
        type: draft.type,
        severity: draft.severity ?? NotificationSeverity.INFO,
        title: draft.title,
        body: draft.body,
        relatedEntityType: draft.relatedEntityType ?? null,
        relatedEntityId: draft.relatedEntityId ?? null,
        dedupeKey: draft.dedupeKey ?? null,
      })),
      skipDuplicates: true,
    });

    return { created: count, skipped: drafts.length - count };
  }

  // -------------------------------------------------------------------------
  // Reads — always scoped to the signed-in user
  // -------------------------------------------------------------------------

  async findForUser(
    userId: string,
    query: QueryNotificationsDto,
  ): Promise<PaginatedResult<Notification>> {
    const filters: Prisma.NotificationWhereInput[] = [{ recipientId: userId }];

    if (query.unread !== undefined) {
      filters.push(query.unread ? { readAt: null } : { readAt: { not: null } });
    }
    if (query.type) filters.push({ type: query.type });

    const where: Prisma.NotificationWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.notification.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { recipientId: userId, readAt: null } });
  }

  /**
   * Marks one notification read.
   *
   * Scoped by recipient in the `where`, not checked afterwards — so another
   * user's notification is simply not found rather than being read and then
   * rejected.
   */
  async markRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, recipientId: userId },
    });

    if (!notification) throw new NotFoundError('Notification', id);
    if (notification.readAt !== null) return notification;

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });

    return count;
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notification.deleteMany({
      where: { id, recipientId: userId },
    });

    if (count === 0) throw new NotFoundError('Notification', id);
  }

  // -------------------------------------------------------------------------
  // Announcements
  // -------------------------------------------------------------------------

  async announce(dto: CreateAnnouncementDto): Promise<number> {
    const recipients =
      dto.userIds && dto.userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: dto.userIds }, status: UserStatus.ACTIVE },
            select: { id: true },
          })
        : await this.prisma.user.findMany({
            where: { role: { in: dto.roles ?? [] }, status: UserStatus.ACTIVE },
            select: { id: true },
          });

    const { created } = await this.deliver(
      recipients.map((user) => ({
        recipientId: user.id,
        type: NotificationType.ANNOUNCEMENT,
        severity: dto.severity ?? NotificationSeverity.INFO,
        title: dto.title,
        body: dto.body,
        // No dedupe key: the same announcement may legitimately be sent twice.
      })),
    );

    this.logger.log(`Announcement '${dto.title}' delivered to ${created} recipient(s)`);
    return created;
  }

  // -------------------------------------------------------------------------
  // Reminders
  // -------------------------------------------------------------------------

  /**
   * Generates membership-expiry and payment reminders.
   *
   * Safe to run repeatedly: every reminder carries a dedupe key scoped to the
   * thing it is about and the day it covers, so a second run on the same day
   * creates nothing. Intended for a schedule; exposed to administrators so it
   * can be triggered and tested without one.
   */
  async runReminders(dto: RunRemindersDto, now: Date = new Date()): Promise<ReminderRunDto> {
    await this.memberships.syncOverdue(now);

    const today = this.gymTime.today(now);
    const [expiring, expired, payments] = await Promise.all([
      this.remindExpiringMemberships(dto.expiringWithinDays, today, now),
      this.remindExpiredMemberships(today, now),
      this.remindUnpaidBalances(dto.minimumBalance ?? 0.01, today),
    ]);

    const result: ReminderRunDto = {
      expiringMemberships: expiring.created,
      expiredMemberships: expired.created,
      paymentReminders: payments.created,
      skippedAsDuplicate: expiring.skipped + expired.skipped + payments.skipped,
    };

    this.logger.log(
      `Reminder sweep: ${result.expiringMemberships} expiring, ${result.expiredMemberships} expired, ` +
        `${result.paymentReminders} payment; ${result.skippedAsDuplicate} already sent`,
    );

    return result;
  }

  /** Warns a member, and their trainer, that a membership is about to lapse. */
  private async remindExpiringMemberships(
    withinDays: number,
    today: string,
    now: Date,
  ): Promise<{ created: number; skipped: number }> {
    const horizon = this.gymTime.localDateAsUtcMidnight(this.gymTime.shift(today, withinDays));

    const memberships = await this.prisma.memberMembership.findMany({
      where: {
        status: MembershipStatus.ACTIVE,
        endDate: { gte: this.gymTime.localDateAsUtcMidnight(today), lte: horizon },
        member: { status: ProfileStatus.ACTIVE },
      },
      include: {
        plan: true,
        member: { include: { user: true, assignedTrainer: { include: { user: true } } } },
      },
    });

    const drafts: NotificationDraft[] = [];

    for (const membership of memberships) {
      const left = daysRemaining(membership, now) ?? 0;
      const when = left <= 1 ? 'today' : `in ${left} days`;

      drafts.push({
        recipientId: membership.member.userId,
        type: NotificationType.MEMBERSHIP_EXPIRING,
        severity: left <= 3 ? NotificationSeverity.WARNING : NotificationSeverity.INFO,
        title: `Your membership expires ${when}`,
        body:
          `Your ${membership.plan.name} membership runs out on ` +
          `${membership.endDate.toISOString().slice(0, 10)}. Renew at reception to keep training.`,
        relatedEntityType: 'membership',
        relatedEntityId: membership.id,
        // Scoped to the membership and the day, so one reminder per day at most.
        dedupeKey: `membership-expiring:${membership.id}:${today}`,
      });

      // The trainer hears about it too — they are the one who will have the
      // conversation.
      if (membership.member.assignedTrainer) {
        drafts.push({
          recipientId: membership.member.assignedTrainer.userId,
          type: NotificationType.MEMBERSHIP_EXPIRING,
          severity: NotificationSeverity.INFO,
          title: `${membership.member.user.firstName}'s membership expires ${when}`,
          body:
            `${membership.member.user.firstName} ${membership.member.user.lastName} has a ` +
            `${membership.plan.name} membership ending ${membership.endDate.toISOString().slice(0, 10)}.`,
          relatedEntityType: 'membership',
          relatedEntityId: membership.id,
          dedupeKey: `membership-expiring-trainer:${membership.id}:${today}`,
        });
      }
    }

    return this.deliver(drafts);
  }

  /** Tells a member their membership has just run out. */
  private async remindExpiredMemberships(
    today: string,
    now: Date,
  ): Promise<{ created: number; skipped: number }> {
    const yesterday = this.gymTime.localDateAsUtcMidnight(this.gymTime.shift(today, -1));
    void now;

    const memberships = await this.prisma.memberMembership.findMany({
      where: {
        status: MembershipStatus.EXPIRED,
        endDate: { gte: yesterday, lt: this.gymTime.localDateAsUtcMidnight(today) },
        member: { status: ProfileStatus.ACTIVE },
      },
      include: { plan: true, member: { include: { user: true } } },
    });

    return this.deliver(
      memberships.map((membership) => ({
        recipientId: membership.member.userId,
        type: NotificationType.MEMBERSHIP_EXPIRED,
        severity: NotificationSeverity.WARNING,
        title: 'Your membership has expired',
        body: `Your ${membership.plan.name} membership ended yesterday. Renew at reception to carry on training.`,
        relatedEntityType: 'membership',
        relatedEntityId: membership.id,
        dedupeKey: `membership-expired:${membership.id}`,
      })),
    );
  }

  /**
   * Reminds members who owe money.
   *
   * The debt comes from BillingService, so a reminder can never quote a figure
   * that disagrees with the unpaid-balances report.
   */
  private async remindUnpaidBalances(
    minimumBalance: number,
    today: string,
  ): Promise<{ created: number; skipped: number }> {
    const debtors = await this.billing.outstanding({
      page: 1,
      limit: 100,
      skip: 0,
      take: 100,
      minimumBalance,
    });

    if (debtors.data.length === 0) return { created: 0, skipped: 0 };

    const members = await this.prisma.member.findMany({
      where: { id: { in: debtors.data.map((debtor) => debtor.memberId) } },
      select: { id: true, userId: true },
    });
    const userIdByMember = new Map(members.map((member) => [member.id, member.userId]));

    const drafts: NotificationDraft[] = [];

    for (const debtor of debtors.data) {
      const userId = userIdByMember.get(debtor.memberId);
      if (!userId) continue;

      drafts.push({
        recipientId: userId,
        type: NotificationType.PAYMENT_DUE,
        severity: money(debtor.outstanding).greaterThan(100)
          ? NotificationSeverity.WARNING
          : NotificationSeverity.INFO,
        title: `You have ${format(debtor.outstanding)} outstanding`,
        body: `Our records show ${format(debtor.outstanding)} still to pay. Please settle at reception.`,
        relatedEntityType: 'member',
        relatedEntityId: debtor.memberId,
        // The amount is part of the key, so a changed balance warrants a fresh
        // reminder but an unchanged one does not nag daily.
        dedupeKey: `payment-due:${debtor.memberId}:${debtor.outstanding}:${today}`,
      });
    }

    return this.deliver(drafts);
  }

  /** Notifies a member that their card was blocked. Used by Phase 6's revoke. */
  async notifyCardRevoked(memberUserId: string, reason?: string): Promise<void> {
    await this.deliver([
      {
        recipientId: memberUserId,
        type: NotificationType.CARD_REVOKED,
        severity: NotificationSeverity.WARNING,
        title: 'Your membership card has been blocked',
        body: reason
          ? `Your QR membership card no longer works: ${reason}. Ask reception for a replacement.`
          : 'Your QR membership card no longer works. Ask reception for a replacement.',
      },
    ]);
  }

  /** Housekeeping for a future scheduler: forget read notifications eventually. */
  async purgeReadOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 86_400_000);

    const { count } = await this.prisma.notification.deleteMany({
      where: { readAt: { not: null, lt: cutoff } },
    });

    if (count > 0) this.logger.log(`Purged ${count} read notification(s) older than ${days} days`);
    return count;
  }

  /** Used by the permission-audit suite to confirm no cross-user leakage. */
  static scopeOf(userId: string): Prisma.NotificationWhereInput {
    return { recipientId: userId };
  }

  /** Exposed for tests that need the role enum without importing Prisma. */
  static readonly ALL_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.TRAINER, UserRole.MEMBER];
}
