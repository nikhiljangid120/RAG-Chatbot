import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ChatSessionEntity } from './chat-session.entity';

@Entity('chat_messages')
export class ChatMessageEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) role: 'user' | 'assistant';
  @Column('text') content: string;
  @Column({ type: 'jsonb', nullable: true }) sources: unknown[] | null;
  @CreateDateColumn() createdAt: Date;
  @ManyToOne(() => ChatSessionEntity, (session) => session.messages, { onDelete: 'CASCADE' }) session: ChatSessionEntity;
}
