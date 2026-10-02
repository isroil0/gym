import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { MembershipPlansService } from './membership-plans.service';
import { MembershipPlansController } from './membership-plans.controller';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';

/**
 * Memberships module — membership plans and member memberships (Phase 4).
 *
 * Depends on MembersModule for the member-visibility rule, so a trainer sees
 * memberships for exactly the members they can already see.
 */
@Module({
  imports: [MembersModule],
  controllers: [MembershipPlansController, MembershipsController],
  providers: [MembershipPlansService, MembershipsService],
  exports: [MembershipPlansService, MembershipsService],
})
export class MembershipsModule {}
