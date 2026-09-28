import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ChunkEntity } from './chunk.entity';

@Entity('documents')
@Index(['ownerId', 'hash'], { unique: true })
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() filename: string;
  @Column() hash: string;
  @Column({ type: 'uuid', nullable: true }) ownerId: string | null;
  @Column({ default: 'PENDING' }) status: string;
  @Column({ type: 'int', default: 0 }) pageCount: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
  @OneToMany(() => ChunkEntity, (chunk) => chunk.document) chunks: ChunkEntity[];
}
