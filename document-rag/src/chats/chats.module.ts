import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ChatSessionEntity } from './chat-session.entity';
import { ChatMessageEntity } from './chat-message.entity';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatSessionEntity, ChatMessageEntity]), AuthModule],
  controllers: [ChatsController],
  providers: [ChatsService],
  exports: [ChatsService],
})
export class ChatsModule {}
