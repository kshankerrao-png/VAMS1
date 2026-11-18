import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { changePasswordSchema, loginSchema } from '@vams/shared';
import type { Request, Response } from 'express';
import { APP_CONFIG, AppConfig } from '../config';
import { AuthService } from './auth.service';
import { CurrentUser, Public, requestContext } from '../common/decorators';
import { parseOrThrow } from '../common/validate';
import type { AuthUser } from '@vams/shared';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const dto = parseOrThrow(loginSchema, body);
    const context = requestContext(request);
    const { token, user } = await this.auth.login(dto.username, dto.password, context);
    response.cookie(this.config.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      path: '/',
      maxAge: this.config.sessionAbsoluteHours * 3_600_000,
    });
    return { user };
  }

  @Post('logout')
  logout(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = (request as Request & { cookies?: Record<string, string> }).cookies?.[
      this.config.cookieName
    ];
    this.auth.logout(token ?? null, user, requestContext(request));
    response.clearCookie(this.config.cookieName, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const dto = parseOrThrow(changePasswordSchema, body);
    const sessionId =
      (request as Request & { sessionId?: string }).sessionId ?? null;
    await this.auth.changePassword(
      user,
      dto.currentPassword,
      dto.newPassword,
      sessionId,
      requestContext(request),
    );
    return { ok: true };
  }
}
