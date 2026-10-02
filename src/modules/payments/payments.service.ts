import { Injectable, Logger } from '@nestjs/common';
import { PaymentStatus, Prisma, UserRole, type Payment, type Refund } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembersService } from '../members/members.service';
import { AccountingService } from '../accounting/accounting.service';
import { BusinessRuleError, NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import { format, money, sum } from '../../common/money/money';
import { toDateOnly } from '../memberships/membership-period';
import { refundableAmount } from './billing-math';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type { PaymentWithRelations } from './dto/payment.dto';
import type { CreatePaymentDto, CreateRefundDto, QueryPaymentsDto } from './dto/payment.dto';

const PAYMENT_INCLUDE = {
  member: { include: { user: true } },
  membership: { include: { plan: true } },
  refunds: { orderBy: { refundedAt: 'desc' } },
  recordedBy: true,
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly accounting: AccountingService,
  ) {}

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Records money received and posts the matching INCOME entry.
   *
   * Both writes happen in one transaction, and `accounting_entries.payment_id`
   * is unique — so a payment can never exist without its ledger entry, and a
   * retry or a concurrent duplicate can never post the income twice. That is
   * what "safely" means here: the invariant is enforced by the database, not
   * by call-site discipline.
   */
  async create(dto: CreatePaymentDto, actor: AuthenticatedUser): Promise<PaymentWithRelations> {
    const member = await this.members.findOneOrFail(dto.memberId);
    const amount = money(dto.amount);
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    if (dto.membershipId) {
      const membership = await this.prisma.memberMembership.findUnique({
        where: { id: dto.membershipId },
        select: { id: true, memberId: true },
      });

      if (!membership) throw new NotFoundError('Membership', dto.membershipId);

      if (membership.memberId !== dto.memberId) {
        throw new BusinessRuleError('That membership belongs to a different member', [
          { field: 'membershipId', messages: ['must belong to the member being paid for'] },
        ]);
      }
    }

    const description = dto.membershipId
      ? `Membership payment — ${member.user.firstName} ${member.user.lastName}`
      : `Member payment — ${member.user.firstName} ${member.user.lastName}`;

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          memberId: dto.memberId,
          membershipId: dto.membershipId ?? null,
          amount,
          method: dto.method,
          paidAt,
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          recordedByUserId: actor.id,
        },
      });

      await this.accounting.postPaymentIncome(tx, {
        paymentId: created.id,
        amount,
        occurredOn: paidAt,
        description,
        method: dto.method,
        recordedByUserId: actor.id,
      });

      return created;
    });

    this.logger.log(
      `Payment ${payment.id}: ${format(amount)} by ${dto.method} from member ${dto.memberId}; income posted`,
    );

    return this.findOneOrFail(payment.id);
  }

  /**
   * Returns money against a payment and posts the matching REFUND entry, again
   * in one transaction with a unique link so it cannot double-post.
   *
   * The refund can never exceed what is left of the payment.
   */
  async refund(
    paymentId: string,
    dto: CreateRefundDto,
    actor: AuthenticatedUser,
  ): Promise<PaymentWithRelations> {
    const payment = await this.findOneOrFail(paymentId);
    const amount = money(dto.amount);

    const alreadyRefunded = (payment.refunds ?? []).map((refund) => refund.amount);
    const available = refundableAmount(payment.amount, alreadyRefunded);

    if (available.isZero()) {
      throw new BusinessRuleError(`Payment '${paymentId}' has already been refunded in full`, [
        { field: 'amount', messages: ['nothing left to refund'] },
      ]);
    }

    if (amount.greaterThan(available)) {
      throw new BusinessRuleError(
        `Refund of ${format(amount)} exceeds the ${format(available)} still refundable on this payment`,
        [{ field: 'amount', messages: [`must not exceed ${format(available)}`] }],
      );
    }

    const refundedAt = dto.refundedAt ? new Date(dto.refundedAt) : new Date();
    const method = dto.method ?? payment.method;
    const totalAfter = sum([...alreadyRefunded, amount]);
    const status = totalAfter.equals(payment.amount)
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED;

    await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          paymentId,
          amount,
          method,
          reason: dto.reason,
          refundedAt,
          recordedByUserId: actor.id,
        },
      });

      await tx.payment.update({ where: { id: paymentId }, data: { status } });

      await this.accounting.postRefund(tx, {
        refundId: refund.id,
        amount,
        occurredOn: refundedAt,
        description: `Refund — ${dto.reason}`,
        method,
        recordedByUserId: actor.id,
      });

      return refund;
    });

    this.logger.log(
      `Refunded ${format(amount)} of payment ${paymentId} (${status}); ledger entry posted`,
    );

    return this.findOneOrFail(paymentId);
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /**
   * Restricts payment queries by role.
   *
   * Synchronous, unlike the member scope: a trainer is denied outright rather
   * than narrowed to their assigned members, so there is nothing to look up.
   */
  private scopeFor(principal: AuthenticatedUser): Prisma.PaymentWhereInput {
    if (principal.role === UserRole.ADMIN) return {};
    if (principal.role === UserRole.TRAINER) {
      // Trainers have no business reading money records. Fail closed.
      return { id: '00000000-0000-0000-0000-000000000000' };
    }
    return { member: { userId: principal.id } };
  }

  async findMany(
    query: QueryPaymentsDto,
    principal: AuthenticatedUser,
  ): Promise<PaginatedResult<PaymentWithRelations>> {
    const filters: Prisma.PaymentWhereInput[] = [this.scopeFor(principal)];

    if (query.memberId) filters.push({ memberId: query.memberId });
    if (query.membershipId) filters.push({ membershipId: query.membershipId });
    if (query.method) filters.push({ method: query.method });
    if (query.status) filters.push({ status: query.status });
    if (query.from) filters.push({ paidAt: { gte: toDateOnly(new Date(query.from)) } });
    if (query.to) {
      // Inclusive of the whole `to` day.
      const end = toDateOnly(new Date(query.to));
      filters.push({ paidAt: { lt: new Date(end.getTime() + 86_400_000) } });
    }

    const where: Prisma.PaymentWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: PAYMENT_INCLUDE,
        skip: query.skip,
        take: query.take,
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.payment.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findOneScoped(id: string, principal: AuthenticatedUser): Promise<PaymentWithRelations> {
    const payment = await this.prisma.payment.findFirst({
      where: { AND: [{ id }, this.scopeFor(principal)] },
      include: PAYMENT_INCLUDE,
    });

    if (!payment) throw new NotFoundError('Payment', id);
    return payment;
  }

  async findOneOrFail(id: string): Promise<PaymentWithRelations> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: PAYMENT_INCLUDE,
    });

    if (!payment) throw new NotFoundError('Payment', id);
    return payment;
  }

  /** Gross and refunded totals for one membership, used by billing. */
  async totalsForMembership(
    membershipId: string,
  ): Promise<{ paid: Prisma.Decimal[]; refunded: Prisma.Decimal[] }> {
    const payments = await this.prisma.payment.findMany({
      where: { membershipId },
      select: { amount: true, refunds: { select: { amount: true } } },
    });

    return {
      paid: payments.map((payment) => payment.amount),
      refunded: payments.flatMap((payment) => payment.refunds.map((refund) => refund.amount)),
    };
  }

  /** Every refund recorded against a payment. */
  async findRefunds(paymentId: string): Promise<Refund[]> {
    return this.prisma.refund.findMany({
      where: { paymentId },
      orderBy: { refundedAt: 'desc' },
    });
  }

  static isFullyRefunded(payment: Payment, refunds: Refund[]): boolean {
    return sum(refunds.map((refund) => refund.amount)).equals(payment.amount);
  }
}
