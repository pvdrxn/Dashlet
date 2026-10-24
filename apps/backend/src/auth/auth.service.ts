import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { UserDto, RegisterDto, LoginDto, AuthResponseDto, SessionDto, ChangePasswordDto, ChangeEmailDto } from '@widget-master/shared';

@Injectable()
export class AuthService {
  private readonly jwtSecret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
  private readonly accessTokenExpiry = '15m';
  private readonly refreshTokenExpiry = '7d';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, password: passwordHash },
    });

    return this.generateAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateAuthResponse(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const session = await this.prisma.session.findUnique({ where: { token: refreshToken } });
    if (!session || session.expiresAt < new Date()) {
      if (session) await this.prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException('Refresh token expired or invalid');
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.prisma.session.delete({ where: { id: session.id } });
    return this.generateAuthResponse(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { token: refreshToken } });
  }

  async getMe(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.toUserDto(user);
  }

  async getSessions(userId: string): Promise<SessionDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map(this.toSessionDto);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId, userId } });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('New passwords do not match');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    });

    // Revoke all other sessions (keep current one by not deleting it here)
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async changeEmail(userId: string, dto: ChangeEmailDto): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.newEmail === user.email) {
      throw new BadRequestException('New email must be different from current email');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.newEmail } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { email: dto.newEmail },
    });

    // Revoke all sessions to force re-login with new email
    await this.prisma.session.deleteMany({ where: { userId } });

    return this.toUserDto(updated);
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Password is incorrect');
    }

    // Delete all sessions first
    await this.prisma.session.deleteMany({ where: { userId } });

    // Delete user (cascade will handle related data)
    await this.prisma.user.delete({ where: { id: userId } });
  }

  private async generateAuthResponse(user: { id: string; email: string }): Promise<AuthResponseDto> {
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      { secret: this.jwtSecret, expiresIn: this.accessTokenExpiry },
    );

    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      { secret: this.jwtSecret, expiresIn: this.refreshTokenExpiry },
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.session.create({
      data: { userId: user.id, token: refreshToken, expiresAt },
    });

    const userDto = await this.getMe(user.id);
    return { user: userDto, accessToken, refreshToken };
  }

  private toUserDto(user: Record<string, unknown>): UserDto {
    return {
      id: user.id as string,
      email: user.email as string,
      createdAt: new Date(user.createdAt as string | Date).toISOString(),
      updatedAt: new Date(user.updatedAt as string | Date).toISOString(),
    };
  }

  private toSessionDto(session: Record<string, unknown>): SessionDto {
    return {
      id: session.id as string,
      userId: session.userId as string,
      expiresAt: new Date(session.expiresAt as string | Date).toISOString(),
      createdAt: new Date(session.createdAt as string | Date).toISOString(),
    };
  }
}