import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './access.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthzService } from './authz.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthzService,
    PasswordService,
    SessionService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [AuthService, AuthzService, PasswordService, SessionService],
})
export class AuthModule {}
