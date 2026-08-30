import {
  BadRequestException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const state = req.query?.state || req.query?.token;
    return state ? { state: String(state) } : {};
  }

  canActivate(context: ExecutionContext) {
    const clientId = this.configService.get<string>('google.clientId');
    const clientSecret = this.configService.get<string>('google.clientSecret');

    if (
      !clientId ||
      !clientSecret ||
      clientId === 'UNCONFIGURED_GOOGLE_CLIENT_ID' ||
      clientSecret === 'UNCONFIGURED_GOOGLE_CLIENT_SECRET'
    ) {
      throw new BadRequestException(
        'Google OAuth 2.0 credentials are not configured in the environment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env, or use POST /api/auth/google/mock-link for local development/testing.',
      );
    }

    return super.canActivate(context);
  }
}
