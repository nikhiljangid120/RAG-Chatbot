import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { ChatsService } from './chats.service';

@Controller('chats')
@UseGuards(AuthGuard)
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}
  @Post() create(@CurrentUser() user: AuthUser) { return this.chats.create(user.id); }
  @Get() list(@CurrentUser() user: AuthUser) { return this.chats.list(user.id); }
  @Get(':id') get(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.chats.get(id, user.id); }
  @Delete(':id') async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { await this.chats.remove(id, user.id); return { success: true }; }
}
