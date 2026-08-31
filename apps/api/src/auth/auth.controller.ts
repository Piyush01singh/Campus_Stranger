import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Post,
  Req,
  Res,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService, AuthSessionResponse } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';
import { GoogleValidatedUser } from './google.strategy';
import { IApiSuccessResponse, IUser } from '@campus-stranger/shared-types';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateGuestDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(50)
  displayName?: string;
}

export class MockLinkGoogleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  googleId!: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  displayName?: string;
}

export class TestLoginDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  displayName?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  googleId?: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('guest')
  async createGuest(
    @Body() dto: CreateGuestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IApiSuccessResponse<AuthSessionResponse>> {
    const session = await this.authService.createGuest(dto.displayName);
    const nodeEnv = this.configService.get<string>('nodeEnv', 'development');
    const isProd = nodeEnv === 'production';

    res.cookie('cs_auth_token', session.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    });

    return {
      success: true,
      data: session,
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Request() req: { user: IUser }): Promise<IApiSuccessResponse<IUser>> {
    return {
      success: true,
      data: req.user,
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('session')
  async getSession(@Request() req: { user: IUser }): Promise<IApiSuccessResponse<IUser>> {
    return {
      success: true,
      data: req.user,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('logout')
  async logout(@Res() res: Response): Promise<void> {
    const nodeEnv = this.configService.get<string>('nodeEnv', 'development');
    const isProd = nodeEnv === 'production';

    res.clearCookie('cs_auth_token', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
    });

    res.status(200).json({
      success: true,
      data: { loggedOut: true },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Production Google OAuth 2.0 initiation.
   * Redirects user to Google Consent Screen.
   * Optional query param `token` passes guest JWT session in OAuth state for linking.
   */
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  async googleAuth(@Req() _req: unknown) {
    // Handled by Passport GoogleStrategy
  }

  /**
   * Production Google OAuth 2.0 callback route.
   * Exchanges authorization code, links/creates user, sets session cookie, and redirects to frontend.
   */
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleAuthCallback(
    @Req() req: { user?: GoogleValidatedUser; query?: Record<string, unknown>; cookies?: Record<string, string>; headers?: Record<string, string> },
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('frontendUrl', 'http://localhost:3000');
    const nodeEnv = this.configService.get<string>('nodeEnv', 'development');
    const isProd = nodeEnv === 'production';

    if (!req.user || !req.user.googleId) {
      this.logger.error('Google OAuth callback failed: Google user profile was not returned from provider');
      return res.redirect(`${frontendUrl}/?error=oauth_failed`);
    }

    try {
      const stateParam =
        typeof req.query?.state === 'string'
          ? req.query.state
          : typeof req.user?.state === 'string'
            ? req.user.state
            : undefined;

      const stateData = stateParam ? this.authService.extractStateData(stateParam) : {};

      // Identify guest userId from OAuth state OR from incoming cs_auth_token cookie
      let guestUserId = stateData.userId;
      if (!guestUserId) {
        const rawCookie = req.cookies?.cs_auth_token || req.headers?.cookie;
        if (rawCookie) {
          const cookieMatch = typeof rawCookie === 'string' && rawCookie.includes('cs_auth_token=')
            ? rawCookie.match(/(?:^|;\s*)cs_auth_token=([^;]+)/)?.[1]
            : req.cookies?.cs_auth_token;
          if (cookieMatch) {
            const decodedFromCookie = this.authService.extractStateData(cookieMatch);
            if (decodedFromCookie.userId) {
              guestUserId = decodedFromCookie.userId;
            }
          }
        }
      }

      const session = await this.authService.findOrCreateGoogleUser(
        {
          id: req.user.googleId,
          email: req.user.email,
          displayName: req.user.displayName,
        },
        guestUserId,
      );

      this.logger.log(
        `Google OAuth authenticated successfully for user ${session.user.displayName} (${session.user.id})`,
      );

      // Issue cross-site compatible HttpOnly session cookie
      res.cookie('cs_auth_token', session.accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: '/',
      });

      if (stateData.conversationId) {
        return res.redirect(
          `${frontendUrl}/chat?return_conv=${encodeURIComponent(stateData.conversationId)}`,
        );
      } else if (stateData.returnUrl) {
        return res.redirect(`${frontendUrl}${stateData.returnUrl}`);
      } else {
        return res.redirect(`${frontendUrl}/`);
      }
    } catch (err) {
      this.logger.error(
        `Error processing Google OAuth user session: ${err instanceof Error ? err.stack : err}`,
      );
      return res.redirect(`${frontendUrl}/?error=oauth_processing_error`);
    }
  }

  /**
   * Safe local development endpoint to link Google OAuth without external credential dependencies.
   * Strictly disabled in production to prevent identity spoofing.
   */
  @UseGuards(JwtAuthGuard)
  @Post('google/mock-link')
  async mockLinkGoogle(
    @Request() req: { user: IUser },
    @Body() dto: MockLinkGoogleDto,
  ): Promise<IApiSuccessResponse<AuthSessionResponse>> {
    const nodeEnv = this.configService.get<string>('nodeEnv', 'development');
    if (nodeEnv === 'production') {
      throw new ForbiddenException(
        'Mock Google authentication linking is strictly disabled in production. Use standard OAuth 2.0 flow.',
      );
    }

    const session = await this.authService.linkGoogleAccount(req.user.id, {
      id: dto.googleId,
      email: dto.email,
      displayName: dto.displayName,
    });
    return {
      success: true,
      data: session,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Safe development & automated testing login endpoint.
   * Directly authenticates as a named user and issues standard HttpOnly session cookie.
   * Strictly disabled in production.
   */
  @Post('test-login')
  async testLogin(
    @Body() dto: TestLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IApiSuccessResponse<AuthSessionResponse>> {
    const nodeEnv = this.configService.get<string>('nodeEnv', 'development');
    if (nodeEnv === 'production') {
      throw new ForbiddenException(
        'Test login endpoint is strictly disabled in production environments.',
      );
    }

    const session = await this.authService.createTestAuthenticatedUser(
      dto.displayName,
      dto.email,
      dto.googleId,
    );

    res.cookie('cs_auth_token', session.accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return {
      success: true,
      data: session,
      timestamp: new Date().toISOString(),
    };
  }
}
