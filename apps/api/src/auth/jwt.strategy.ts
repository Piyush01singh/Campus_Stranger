import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { IUser } from '@campus-stranger/shared-types';
import type { Request } from 'express';

export interface JwtPayload {
  sub: string;
  displayName: string;
  accountType: 'guest' | 'authenticated';
  sessionId?: string;
}

const extractJwtFromCookieOrHeader = (req: Request): string | null => {
  // 1. Check req.cookies if cookie-parser is present
  const reqAny = req as unknown as { cookies?: Record<string, string> };
  if (reqAny?.cookies?.cs_auth_token) {
    return reqAny.cookies.cs_auth_token;
  }
  if (reqAny?.cookies?.session_token) {
    return reqAny.cookies.session_token;
  }

  // 2. Fallback check on raw Cookie header string
  if (req.headers && req.headers.cookie) {
    const rawCookie = req.headers.cookie;
    const match = rawCookie.match(/(?:^|;\s*)(?:cs_auth_token|session_token)=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractJwtFromCookieOrHeader,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'sessionSecret',
        'dev_session_secret_at_least_32_chars_long_placeholder',
      ),
    });
  }

  async validate(payload: JwtPayload): Promise<IUser> {
    const user = await this.authService.validateTokenUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
