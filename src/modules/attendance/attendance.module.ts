import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { MembershipCardsService } from './membership-cards.service';
import { MembershipCardsController } from './membership-cards.controller';

/**
 * Attendance module — check-in/out and QR membership cards (Phase 6).
 *
 * Depends on MembershipsModule for the entry decision and the visit decrement,
 * and on MembersModule for the member-visibility rule.
 */
@Module({
  imports: [MembersModule, MembershipsModule],
  controllers: [AttendanceController, MembershipCardsController],
  providers: [AttendanceService, MembershipCardsService],
  exports: [AttendanceService, MembershipCardsService],
})
export class AttendanceModule {}
