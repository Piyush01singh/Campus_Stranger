import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

export interface GoogleValidatedUser {
  googleId: string;
  email?: string;
  displayName?: string;
  state?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(private readonly configService: ConfigService) {
    const clientID =
      configService.get<string>('google.clientId') || 'UNCONFIGURED_GOOGLE_CLIENT_ID';
    const clientSecret =
      configService.get<string>('google.clientSecret') || 'UNCONFIGURED_GOOGLE_CLIENT_SECRET';
    const callbackURL =
      configService.get<string>('google.callbackUrl') ||
      'http://localhost:3001/api/auth/google/callback';

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: { query?: Record<string, unknown> },
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const { id, displayName, emails } = profile;
    const email = emails && emails[0] ? emails[0].value : undefined;

    const validatedUser: GoogleValidatedUser = {
      googleId: id,
      email,
      displayName,
      state: typeof req.query?.state === 'string' ? req.query.state : undefined,
    };

    done(null, validatedUser);
  }
}
