import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatSessionEntity } from './chat-session.entity';
import { ChatMessageEntity } from './chat-message.entity';

@Injectable()
export class ChatsService {
  constructor(
    @InjectRepository(ChatSessionEntity) private readonly sessions: Repository<ChatSessionEntity>,
    @InjectRepository(ChatMessageEntity) private readonly messages: Repository<ChatMessageEntity>,
  ) {}

  async create(ownerId: string) {
    return this.sessions.save(this.sessions.create({ ownerId }));
  }

  list(ownerId: string) {
    return this.sessions.find({ where: { ownerId }, order: { updatedAt: 'DESC' } });
  }

  async get(id: string, ownerId: string) {
    const session = await this.sessions.findOne({ where: { id, ownerId }, relations: { messages: true } });
    if (!session) throw new NotFoundException('Conversation not found.');
    session.messages = [...(session.messages ?? [])].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return session;
  }

  async remove(id: string, ownerId: string) {
    const session = await this.get(id, ownerId);
    await this.sessions.remove(session);
  }

  async addMessage(id: string, ownerId: string, role: 'user' | 'assistant', content: string, sources: unknown[] | null = null) {
    const session = await this.sessions.findOne({ where: { id, ownerId } });
    if (!session) throw new NotFoundException('Conversation not found.');
    if (role === 'user' && session.title === 'New conversation') {
      session.title = content.slice(0, 60);
    }
    await this.sessions.save(session);
    return this.messages.save(this.messages.create({ session, role, content, sources }));
  }
}
