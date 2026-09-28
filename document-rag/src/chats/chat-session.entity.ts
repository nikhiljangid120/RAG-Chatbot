import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ChatMessageEntity } from './chat-message.entity';

@Entity('chat_sessions')
export class ChatSessionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) ownerId: string;
  @Column({ default: 'New conversation' }) title: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
  @OneToMany(() => ChatMessageEntity, (message) => message.session) messages: ChatMessageEntity[];
}
