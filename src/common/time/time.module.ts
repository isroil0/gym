import { Global, Module } from '@nestjs/common';
import { GymTimeService } from './gym-time.service';

/**
 * Global so every module that buckets by day or month shares one notion of the
 * gym's calendar. Two modules disagreeing about when a day ends would make
 * their figures impossible to reconcile.
 */
@Global()
@Module({
  providers: [GymTimeService],
  exports: [GymTimeService],
})
export class TimeModule {}
