import { Module } from '@nestjs/common';
import { PasswordService } from './password.service';

/**
 * Password hashing on its own, so UsersModule can hash credentials without
 * importing AuthModule (which depends on UsersModule).
 */
@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class AuthCryptoModule {}
