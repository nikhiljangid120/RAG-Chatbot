import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const value = request.headers.authorization as string | undefined;
    if (!value?.startsWith('Bearer ')) throw new UnauthorizedException('Authentication required.');
    request.user = this.auth.verifyToken(value.slice(7));
    return true;
  }
}
