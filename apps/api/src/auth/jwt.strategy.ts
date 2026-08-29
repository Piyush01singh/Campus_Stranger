import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { IUser } from '@campus-stranger/shared-types';

export interface JwtPayload {
  sub: string;
  displayName: string;
  accountType: 'guest' | 'authenticated';
  sessionId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
