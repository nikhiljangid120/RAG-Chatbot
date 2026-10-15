import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Layers, Zap } from 'lucide-react';

interface Source {
  filename: string;
  chunkIndex: number;
  similarityScore: number;
}

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  searchMode?: string;
  isStreaming?: boolean; // true while tokens are still arriving
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I am your RAG Assistant. Upload a document and ask me anything about it.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const question = input.trim();

    // Add the user message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
    };

    // Add a placeholder assistant message that we'll stream into
    const assistantId = (Date.now() + 1).toString();
    const assistantPlaceholder: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setInput('');
    setIsLoading(true);

    try {
      // ── STREAMING via fetch + ReadableStream ────────────────────────────────
      // We use the native fetch API instead of axios because axios doesn't expose
      // the response body as a ReadableStream in the browser.
      //
      // SSE event format from our backend:
      //   data: {"type":"sources","sources":[...]}\n\n
      //   data: {"type":"token","token":"The "}\n\n
      //   data: [DONE]\n\n
      const response = await fetch(`${API_BASE_URL}/qa/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, searchMode: 'hybrid' }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode raw bytes and append to line buffer
        buffer += decoder.decode(value, { stream: true });

        // Split on double-newline (SSE event boundary)
        const events = buffer.split('\n\n');

        // Keep the last (potentially incomplete) event in the buffer
        buffer = events.pop() ?? '';

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith('data: ')) continue;

          const payload = line.slice(6); // strip 'data: '

          // End of stream
          if (payload === '[DONE]') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m,
              ),
            );
            break;
          }

          try {
            const parsed = JSON.parse(payload);

            if (parsed.type === 'sources') {
              // Sources arrive before any tokens — render badges immediately
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, sources: parsed.sources, searchMode: parsed.searchMode }
                    : m,
                ),
              );
            } else if (parsed.type === 'token') {
              // Append each token to the streaming message bubble
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.token }
                    : m,
                ),
              );
            } else if (parsed.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `Error: ${parsed.message}`, isStreaming: false }
                    : m,
                ),
              );
            }
          } catch {
            // Malformed JSON event — skip
          }
        }
      }
    } catch (error: any) {
      // Replace the streaming placeholder with an error message
      setMessages((prev) =>
        prev
          .map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Error: ${error.message || 'Failed to connect to the server.'}`,
                  isStreaming: false,
                }
              : m,
          )
          .concat(
            prev.find((m) => m.role === 'assistant' && m.isStreaming)
              ? []
              : [
                  {
                    id: (Date.now() + 2).toString(),
                    role: 'assistant' as const,
                    content: `Error: ${error.message || 'Failed to get answer.'}`,
                  },
                ],
          ),
      );
    } finally {
      // Mark the streaming message as done (in case of early error)
      setMessages((prev) =>
        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div>
          <h2 className="chat-title">RAG Assistant</h2>
          <p className="chat-subtitle">
            Ask questions based on your uploaded documents
          </p>
        </div>
        {/* Streaming indicator badge */}
        <div className="stream-badge" title="Streaming mode active">
          <Zap size={12} />
          <span>Live</span>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role} animate-fade-in`}>
            <div className={`avatar ${msg.role}`}>
              {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
            </div>

            <div className="message-content">
              <div className={`message-bubble ${msg.isStreaming ? 'streaming' : ''}`}>
                {msg.content}
                {/* Blinking cursor while streaming */}
                {msg.isStreaming && <span className="stream-cursor">▊</span>}
              </div>

              {/* Source citations — rendered as soon as sources event arrives */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="sources-container">
                  {msg.sources.map((source, idx) => (
                    <div
                      key={idx}
                      className="source-tag"
                      title={`Relevance: ${source.similarityScore.toFixed(2)}%`}
                    >
                      <Layers size={12} />
                      {source.filename} · Chunk {source.chunkIndex}
                      <span className="source-score">{source.similarityScore.toFixed(1)}%</span>
                    </div>
                  ))}
                  {msg.searchMode && (
                    <span className="search-mode-badge">{msg.searchMode}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Classic typing indicator only shown while waiting for first token */}
        {isLoading && messages[messages.length - 1]?.content === '' && (
          <div className="message assistant animate-fade-in">
            <div className="avatar assistant">
              <Bot size={20} />
            </div>
            <div className="typing-indicator">
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="input-wrapper">
          <input
            type="text"
            className="chat-input"
            placeholder="Ask a question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
