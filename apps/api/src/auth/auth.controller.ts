import { Body, Controller, ForbiddenException, Get, Logger, Post, Req, Res, Request, UseGuards } from '@nestjs/common';
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
  ): Promise<IApiSuccessResponse<AuthSessionResponse>> {
    const session = await this.authService.createGuest(dto.displayName);
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
   * Exchanges authorization code, links/creates user, and redirects to frontend with token.
   */
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleAuthCallback(
    @Req() req: { user?: GoogleValidatedUser; query?: Record<string, unknown> },
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('frontendUrl', 'http://localhost:3000');

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

      const session = await this.authService.findOrCreateGoogleUser(
        {
          id: req.user.googleId,
          email: req.user.email,
          displayName: req.user.displayName,
        },
        stateData.userId,
      );

      this.logger.log(
        `Google OAuth authenticated successfully for user ${session.user.displayName} (${session.user.id})`,
      );

      if (stateData.conversationId) {
        return res.redirect(
          `${frontendUrl}/chat?auth_token=${encodeURIComponent(session.accessToken)}&return_conv=${encodeURIComponent(stateData.conversationId)}`,
        );
      } else {
        return res.redirect(`${frontendUrl}/saved?auth_token=${encodeURIComponent(session.accessToken)}`);
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
}
