import { useEffect, useRef, useState } from 'react';
import { Bot, Layers, Send, User } from 'lucide-react';
import { api } from '../api';

interface Source { documentId: string; filename: string; pageNumber: number | null; excerpt: string; similarityScore: number }
interface Message { id: string; role: 'user' | 'assistant'; content: string; sources?: Source[] }
interface Props { documentIds: string[]; sessionId: string | null; onSessionCreated: (id: string) => void; onSessionUpdated: () => void }
const welcome: Message = { id: 'welcome', role: 'assistant', content: 'Upload documents, choose specific files if needed, and ask a grounded question.' };

export function ChatInterface({ documentIds, sessionId, onSessionCreated, onSessionUpdated }: Props) {
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) { setMessages([welcome]); return; }
    api.get(`/chats/${sessionId}`).then((response) => setMessages(response.data.messages.length ? response.data.messages : [welcome]));
  }, [sessionId]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const created = await api.post('/chats');
      activeSessionId = created.data.id;
      onSessionCreated(activeSessionId!);
    }
    setMessages((current) => [...current.filter((message) => message.id !== 'welcome'), { id: `${Date.now()}-user`, role: 'user', content: question }]);
    setInput(''); setLoading(true);
    try {
      const response = await api.post('/qa/ask', { question, documentIds, sessionId: activeSessionId });
      setMessages((current) => [...current, { id: `${Date.now()}-assistant`, role: 'assistant', content: response.data.answer, sources: response.data.sources }]);
      onSessionUpdated();
    } catch (error: any) {
      setMessages((current) => [...current, { id: `${Date.now()}-error`, role: 'assistant', content: `Error: ${error.response?.data?.message ?? 'Unable to answer right now.'}` }]);
    } finally { setLoading(false); }
  }

  return (
    <div className="chat-container">
      <div className="chat-header"><div><h2 className="chat-title">RAG Assistant</h2><p className="chat-subtitle">{documentIds.length ? `Searching ${documentIds.length} selected document${documentIds.length === 1 ? '' : 's'}` : 'Searching your entire private library'}</p></div></div>
      <div className="chat-messages">
        {messages.map((message) => <div key={message.id} className={`message ${message.role} animate-fade-in`}><div className={`avatar ${message.role}`}>{message.role === 'user' ? <User size={20} /> : <Bot size={20} />}</div><div className="message-content"><div className="message-bubble">{message.content}</div>{!!message.sources?.length && <div className="sources-container">{message.sources.map((source, index) => <details key={`${source.documentId}-${index}`} className="source-tag"><summary><Layers size={12} /> {source.filename}{source.pageNumber ? ` · page ${source.pageNumber}` : ''} · {source.similarityScore}%</summary><p style={{ marginTop: 8 }}>{source.excerpt}</p></details>)}</div>}</div></div>)}
        {loading && <div className="message assistant"><div className="avatar assistant"><Bot size={20} /></div><div className="typing-indicator"><div className="dot" /><div className="dot" /><div className="dot" /></div></div>}
        <div ref={end} />
      </div>
      <div className="chat-input-area"><div className="input-wrapper"><input className="chat-input" placeholder="Ask a question…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} disabled={loading} /><button className="send-btn" onClick={send} disabled={loading || !input.trim()}><Send size={18} /></button></div></div>
    </div>
  );
}
