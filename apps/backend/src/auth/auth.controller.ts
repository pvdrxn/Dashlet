import { Controller, Post, Get, Delete, Patch, Body, Param, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, AuthResponseDto, UserDto, SessionDto, ChangePasswordDto, ChangeEmailDto } from '@widget-master/shared';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @SkipThrottle({ default: true, auth: false })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle({ default: true, auth: false })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle({ default: false })
  async refresh(@Body('refreshToken') refreshToken: string): Promise<AuthResponseDto> {
    return this.authService.refresh(refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle({ default: false })
  async logout(@Body('refreshToken') refreshToken: string): Promise<void> {
    return this.authService.logout(refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: Request & { user: { sub: string } }): Promise<UserDto> {
    return this.authService.getMe(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async sessions(@Req() req: Request & { user: { sub: string } }): Promise<SessionDto[]> {
    return this.authService.getSessions(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  async revokeSession(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string): Promise<void> {
    return this.authService.revokeSession(req.user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password')
  @HttpCode(HttpStatus.OK)
  async changePassword(@Req() req: Request & { user: { sub: string } }, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.authService.changePassword(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('email')
  @HttpCode(HttpStatus.OK)
  async changeEmail(@Req() req: Request & { user: { sub: string } }, @Body() dto: ChangeEmailDto): Promise<UserDto> {
    return this.authService.changeEmail(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('account')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@Req() req: Request & { user: { sub: string } }, @Body('password') password: string): Promise<void> {
    return this.authService.deleteAccount(req.user.sub, password);
  }
}