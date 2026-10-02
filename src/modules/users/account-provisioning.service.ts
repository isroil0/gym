import { Injectable } from '@nestjs/common';
import { Prisma, UserRole, type User } from '@prisma/client';
import { UsersService } from './users.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/app.exception';

/** The account half of a create-profile request. */
export interface AccountInput {
  userId?: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export type ProfileKind = 'member' | 'trainer';

const ROLE_FOR_PROFILE: Record<ProfileKind, UserRole> = {
  member: UserRole.MEMBER,
  trainer: UserRole.TRAINER,
};

/**
 * Resolves the login account a new profile will hang off, in one of two modes:
 *
 * - **link**: `userId` names an existing account, which must carry the right
 *   role and must not already have a profile of this kind;
 * - **create**: no `userId`, so the account is provisioned from the supplied
 *   credentials.
 *
 * Always runs inside the caller's transaction, so a failure anywhere in
 * profile creation rolls the account back with it.
 */
@Injectable()
export class AccountProvisioningService {
  constructor(private readonly users: UsersService) {}

  async resolve(
    tx: Prisma.TransactionClient,
    kind: ProfileKind,
    input: AccountInput,
  ): Promise<User> {
    return input.userId
      ? this.linkExisting(tx, kind, input.userId)
      : this.createNew(tx, kind, input);
  }

  private async linkExisting(
    tx: Prisma.TransactionClient,
    kind: ProfileKind,
    userId: string,
  ): Promise<User> {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    const requiredRole = ROLE_FOR_PROFILE[kind];
    if (user.role !== requiredRole) {
      throw new BusinessRuleError(
        `Account '${user.email}' has role ${user.role}; a ${kind} profile requires role ${requiredRole}`,
        [{ field: 'userId', messages: [`account must have role ${requiredRole}`] }],
      );
    }

    const existing =
      kind === 'member'
        ? await tx.member.findUnique({ where: { userId }, select: { id: true } })
        : await tx.trainer.findUnique({ where: { userId }, select: { id: true } });

    if (existing) {
      throw new ConflictError(`Account '${user.email}' already has a ${kind} profile`, [
        { field: 'userId', messages: [`already linked to a ${kind} profile`] },
      ]);
    }

    return user;
  }

  private async createNew(
    tx: Prisma.TransactionClient,
    kind: ProfileKind,
    input: AccountInput,
  ): Promise<User> {
    // The DTO's conditional validation guarantees these are present when
    // userId is absent; this is the belt-and-braces check.
    if (!input.email || !input.password || !input.firstName || !input.lastName) {
      throw new BusinessRuleError(
        'Provide either userId to link an existing account, or email, password, firstName and lastName to create one',
      );
    }

    return this.users.create(
      {
        email: input.email,
        password: input.password,
        role: ROLE_FOR_PROFILE[kind],
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
      },
      tx,
    );
  }
}
