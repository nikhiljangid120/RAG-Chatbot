import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, User, Bot, Layers } from 'lucide-react';

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
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
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/qa/ask`, {
        question: userMessage.content,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.data.answer,
          sources: response.data.sources,
        },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Error: ${error.response?.data?.message || 'Failed to get answer. Please try again.'}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div>
          <h2 className="chat-title">RAG Assistant</h2>
          <p className="chat-subtitle">Ask questions based on your uploaded documents</p>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role} animate-fade-in`}>
            <div className={`avatar ${msg.role}`}>
              {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
            </div>
            <div className="message-content">
              <div className="message-bubble">{msg.content}</div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="sources-container">
                  {msg.sources.map((source, idx) => (
                    <div key={idx} className="source-tag" title={`Score: ${source.similarityScore}`}>
                      <Layers size={12} />
                      {source.filename} (Chunk {source.chunkIndex})
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message assistant animate-fade-in">
            <div className="avatar assistant"><Bot size={20} /></div>
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
          <button className="send-btn" onClick={handleSend} disabled={isLoading || !input.trim()}>
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
