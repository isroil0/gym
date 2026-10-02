import { Module } from '@nestjs/common';
import { TrainersService } from './trainers.service';
import { TrainersController } from './trainers.controller';
import { UsersModule } from '../users/users.module';
import { MembersModule } from '../members/members.module';

/**
 * Trainers module — trainer profiles (Phase 3).
 */
@Module({
  imports: [UsersModule, MembersModule],
  controllers: [TrainersController],
  providers: [TrainersService],
  exports: [TrainersService],
})
export class TrainersModule {}
