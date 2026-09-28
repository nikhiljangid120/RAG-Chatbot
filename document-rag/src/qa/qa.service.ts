import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { RetrievedChunk, RetrievalService } from '../retrieval/retrieval.service';
import { ChatsService } from '../chats/chats.service';
import { PromptBuilderService } from './prompt-builder.service';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct';

@Injectable()
export class QaService {
  private readonly logger = new Logger(QaService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly minimumSimilarity: number;

  constructor(
    private readonly embeddings: EmbeddingsService,
    private readonly retrieval: RetrievalService,
    private readonly prompts: PromptBuilderService,
    private readonly chats: ChatsService,
    config: ConfigService,
  ) {
    this.apiKey = config.get<string>('OPENROUTER_API_KEY') ?? '';
    this.model = config.get<string>('OPENROUTER_MODEL') ?? DEFAULT_MODEL;
    this.minimumSimilarity = Number(config.get<string>('MINIMUM_SIMILARITY') ?? '0.25');
    if (!this.apiKey) throw new Error('OPENROUTER_API_KEY is required.');
  }

  async askQuestion(question: string, ownerId: string, documentIds: string[], sessionId?: string) {
    const { cleanQuestion, chunks } = await this.prepare(question, ownerId, documentIds, sessionId);
    if (!chunks.length) return this.noContext(cleanQuestion, ownerId, sessionId);
    try {
      const response = await axios.post(OPENROUTER_API_URL, this.requestBody(cleanQuestion, chunks, false), {
        headers: this.headers(), timeout: 30000,
      });
      const answer = response.data.choices[0]?.message?.content;
      if (!answer) throw new Error('The model returned an empty response.');
      const sources = this.toSources(chunks);
      if (sessionId) await this.chats.addMessage(sessionId, ownerId, 'assistant', answer, sources);
      return { answer, question: cleanQuestion, sources, model: this.model, chunksUsed: chunks.length };
    } catch (error) { throw this.openRouterError(error); }
  }

  async streamQuestion(
    question: string,
    ownerId: string,
    documentIds: string[],
    sessionId: string | undefined,
    onToken: (content: string) => void,
  ) {
    const { cleanQuestion, chunks } = await this.prepare(question, ownerId, documentIds, sessionId);
    if (!chunks.length) {
      const result = await this.noContext(cleanQuestion, ownerId, sessionId);
      onToken(result.answer);
      return result;
    }

    try {
      const response = await axios.post(OPENROUTER_API_URL, this.requestBody(cleanQuestion, chunks, true), {
        headers: this.headers(), responseType: 'stream', timeout: 60000,
      });
      let answer = '';
      let buffer = '';
      await new Promise<void>((resolve, reject) => {
        response.data.on('data', (data: Buffer) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const token = JSON.parse(raw).choices?.[0]?.delta?.content;
              if (token) { answer += token; onToken(token); }
            } catch { /* wait for the next complete event */ }
          }
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });
      if (!answer) throw new Error('The model returned an empty response.');
      const sources = this.toSources(chunks);
      if (sessionId) await this.chats.addMessage(sessionId, ownerId, 'assistant', answer, sources);
      return { answer, question: cleanQuestion, sources, model: this.model, chunksUsed: chunks.length };
    } catch (error) { throw this.openRouterError(error); }
  }

  private async prepare(question: string, ownerId: string, documentIds: string[], sessionId?: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) throw new BadRequestException('Question cannot be empty.');
    if (sessionId) await this.chats.addMessage(sessionId, ownerId, 'user', cleanQuestion);
    const queryEmbedding = await this.embeddings.generateEmbedding(cleanQuestion);
    const candidates = await this.retrieval.findSimilarChunks(queryEmbedding, ownerId, documentIds, 5);
    return { cleanQuestion, chunks: candidates.filter((chunk) => Number(chunk.similarityScore) >= this.minimumSimilarity) };
  }

  private async noContext(question: string, ownerId: string, sessionId?: string) {
    const answer = 'I could not find enough relevant information in the selected documents to answer this question.';
    if (sessionId) await this.chats.addMessage(sessionId, ownerId, 'assistant', answer, []);
    return { answer, question, sources: [], model: this.model, chunksUsed: 0 };
  }

  private requestBody(question: string, chunks: RetrievedChunk[], stream: boolean) {
    return {
      model: this.model,
      messages: [
        { role: 'system', content: this.prompts.buildSystemPrompt() },
        { role: 'user', content: this.prompts.buildUserPrompt(question, chunks) },
      ],
      temperature: 0.1,
      max_tokens: 1024,
      stream,
    };
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:3000',
      'X-Title': 'Document RAG System',
    };
  }

  private toSources(chunks: RetrievedChunk[]) {
    return chunks.map((chunk) => ({
      documentId: chunk.documentId,
      filename: chunk.documentFilename,
      pageNumber: chunk.metadata?.pageNumber ?? null,
      excerpt: chunk.content.slice(0, 220),
      similarityScore: Number((Number(chunk.similarityScore) * 100).toFixed(2)),
    }));
  }

  private openRouterError(error: unknown) {
    const message = axios.isAxiosError(error) ? error.response?.data?.error?.message ?? error.message : error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`OpenRouter call failed: ${message}`);
    return new InternalServerErrorException(`Failed to get answer from LLM: ${message}`);
  }
}
