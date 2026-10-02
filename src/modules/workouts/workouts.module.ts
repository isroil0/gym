import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { MemberAccessService } from './member-access.service';
import { WorkoutPlansService } from './workout-plans.service';
import { WorkoutPlansController } from './workout-plans.controller';
import { MeasurementsService } from './measurements.service';
import { MeasurementsController } from './measurements.controller';
import { TrainingSessionsService } from './training-sessions.service';
import { TrainingSessionsController } from './training-sessions.controller';

/**
 * Workouts module — trainer work (Phase 7): workout plans with their days and
 * exercises, body measurements and the progress derived from them, and personal
 * training sessions.
 *
 * All three share MemberAccessService, so "a trainer may only touch their
 * assigned members" is stated once and enforced identically everywhere.
 */
@Module({
  imports: [MembersModule],
  controllers: [WorkoutPlansController, MeasurementsController, TrainingSessionsController],
  providers: [
    MemberAccessService,
    WorkoutPlansService,
    MeasurementsService,
    TrainingSessionsService,
  ],
  exports: [MemberAccessService, WorkoutPlansService, MeasurementsService, TrainingSessionsService],
})
export class WorkoutsModule {}
