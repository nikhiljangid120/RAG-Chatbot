import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthDto } from './auth.dto';
import { AuthService, AuthUser } from './auth.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register') register(@Body() body: AuthDto) { return this.auth.register(body.email, body.password); }
  @Post('login') login(@Body() body: AuthDto) { return this.auth.login(body.email, body.password); }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) { return user; }
}
