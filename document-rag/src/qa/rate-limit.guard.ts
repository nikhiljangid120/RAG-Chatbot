import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly requests = new Map<string, number[]>();

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const key = request.user?.id ?? request.ip;
    const now = Date.now();
    const recent = (this.requests.get(key) ?? []).filter((time) => now - time < 60_000);
    if (recent.length >= 20) {
      throw new HttpException('Rate limit exceeded. Try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.requests.set(key, recent);
    return true;
  }
}
