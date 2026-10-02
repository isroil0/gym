import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { UsersModule } from '../users/users.module';

/**
 * Members module — member profiles and trainer assignment (Phase 3).
 *
 * Does not depend on TrainersModule: the few trainer lookups it needs go
 * through Prisma directly, which keeps the dependency one-directional
 * (trainers → members) and avoids a forwardRef.
 */
@Module({
  imports: [UsersModule],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
