import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokenService } from './token.service';
import { AuthCryptoModule } from './auth-crypto.module';
import { UsersModule } from '../users/users.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * Auth module — authentication, refresh tokens and password management (Phase 2).
 *
 * Registers JwtAuthGuard and RolesGuard globally: every route is authenticated
 * unless it opts out with @Public(), and @Roles() is enforced wherever present.
 * Guard order matters — JwtAuthGuard must populate `request.user` before
 * RolesGuard inspects it, and APP_GUARD providers run in declaration order.
 */
@Module({
  imports: [AuthCryptoModule, UsersModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
