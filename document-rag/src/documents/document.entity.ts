import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import {ChunkEntity} from './chunk.entity';

@Entity('documents')
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  filename: string;

  // We use a hash to prevent uploading the exact same file multiple times
  @Column({ unique: true })
  hash: string;

  // Tracks the background AI processing status (PENDING, PROCESSING, COMPLETED, FAILED)
  @Column({ default: 'PENDING' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // One Document has Many Chunks.
  @OneToMany(() => ChunkEntity, (chunk) => chunk.document)
  chunks: ChunkEntity[];
}
