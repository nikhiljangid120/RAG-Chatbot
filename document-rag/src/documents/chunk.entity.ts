import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { DocumentEntity } from './document.entity';

@Entity('chunks')
export class ChunkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The actual text paragraph
  @Column('text')
  content: string;

  // Crucial for understanding the order of paragraphs in the original document
  @Column({ type: 'int' })
  chunkIndex: number;

  // Flexible metadata for EXPLAINABILITY (e.g. { "pageNumber": 12, "section": "Cafeteria" })
  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  // The AI embedding. 384 dimensions for MiniLM.
  @Column({ type: 'vector', length: 384, nullable: true })
  embedding: number[];

  // The Many-to-One relationship.
  // onDelete: 'CASCADE' means if the parent document is deleted, these chunks die with it automatically.
  @ManyToOne(() => DocumentEntity, (document) => document.chunks, { onDelete: 'CASCADE' })
  document: DocumentEntity;
}
