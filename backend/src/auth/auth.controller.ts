import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthGuard } from '@nestjs/passport';
import { AuthRateLimitGuard } from '../common/rate-limit/rate-limit.guard';

type RefreshTokenRequest = Request & {
  cookies?: {
    refreshToken?: string;
  };
};

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    email: string;
  };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthRateLimitGuard)
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @Post('refresh')
  async refresh(
    @Req() req: RefreshTokenRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'NO_REFRESH_TOKEN',
        message: 'Refresh token bulunamadı.',
      });
    }

    const result = await this.authService.refreshTokens(refreshToken);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return {
      accessToken: result.accessToken,
    };
  }

  // Mobile clients cannot rely on browser-managed HttpOnly cookies.
  // These endpoints return/accept the refresh token in the HTTPS request body;
  // the Android app must keep it in encrypted local storage.
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @Post('mobile/login')
  async mobileLogin(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @Post('mobile/refresh')
  async mobileRefresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @Post('mobile/logout')
  async mobileLogout(@Body() dto: RefreshTokenDto) {
    return this.authService.logoutWithRefreshToken(dto.refreshToken);
  }

  @UseGuards(AuthGuard('jwt'), AuthRateLimitGuard)
  @Post('logout')
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    await this.authService.logout(userId);

    res.clearCookie('refreshToken');

    return { message: 'Başarıyla çıkış yapıldı.' };
  }
}
