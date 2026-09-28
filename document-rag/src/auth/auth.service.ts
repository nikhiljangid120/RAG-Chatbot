import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { UserEntity } from './user.entity';

export interface AuthUser { id: string; email: string }

@Injectable()
export class AuthService {
  private readonly secret: string;

  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('AUTH_SECRET') ?? '';
    if (this.secret.length < 32) throw new Error('AUTH_SECRET must contain at least 32 characters.');
  }

  async register(email: string, password: string) {
    const normalized = email.trim().toLowerCase();
    if (await this.users.findOne({ where: { email: normalized } })) {
      throw new ConflictException('An account with this email already exists.');
    }
    const passwordSalt = randomBytes(16).toString('hex');
    const user = await this.users.save(this.users.create({
      email: normalized,
      passwordSalt,
      passwordHash: this.hashPassword(password, passwordSalt),
    }));
    return this.authResponse(user);
  }

  async login(email: string, password: string) {
    const user = await this.users.findOne({ where: { email: email.trim().toLowerCase() } });
    if (!user || !this.passwordMatches(password, user)) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    return this.authResponse(user);
  }

  verifyToken(token: string): AuthUser {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) throw new UnauthorizedException('Invalid token.');
    const expected = createHmac('sha256', this.secret).update(`${header}.${payload}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException('Invalid token.');
    }
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as AuthUser & { exp: number };
    if (!parsed.sub && !(parsed as any).id) throw new UnauthorizedException('Invalid token.');
    if (parsed.exp < Math.floor(Date.now() / 1000)) throw new UnauthorizedException('Token expired.');
    return { id: (parsed as any).sub ?? (parsed as any).id, email: parsed.email };
  }

  private authResponse(user: UserEntity) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    })).toString('base64url');
    const unsigned = `${header}.${payload}`;
    const signature = createHmac('sha256', this.secret).update(unsigned).digest('base64url');
    return { token: `${unsigned}.${signature}`, user: { id: user.id, email: user.email } };
  }

  private hashPassword(password: string, salt: string) {
    return scryptSync(password, salt, 64).toString('hex');
  }

  private passwordMatches(password: string, user: UserEntity) {
    const actual = Buffer.from(this.hashPassword(password, user.passwordSalt), 'hex');
    const expected = Buffer.from(user.passwordHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
