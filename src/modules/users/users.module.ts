import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { AccountProvisioningService } from './account-provisioning.service';
import { UsersController } from './users.controller';
import { AuthCryptoModule } from '../auth/auth-crypto.module';

/**
 * Users module — login accounts and role assignment (Phase 2).
 */
@Module({
  imports: [AuthCryptoModule],
  controllers: [UsersController],
  providers: [UsersService, AccountProvisioningService],
  exports: [UsersService, AccountProvisioningService],
})
export class UsersModule {}
