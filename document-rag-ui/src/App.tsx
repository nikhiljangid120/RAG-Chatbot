import { useCallback, useEffect, useState } from 'react';
import { Database, LogOut } from 'lucide-react';
import { DocumentUpload } from './components/DocumentUpload';
import { DocumentList } from './components/DocumentList';
import { ChatInterface } from './components/ChatInterface';
import { AuthScreen } from './components/AuthScreen';
import { Conversation, ConversationList } from './components/ConversationList';
import { api, clearToken, getToken } from './api';

function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [refreshDocs, setRefreshDocs] = useState(0);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    const response = await api.get('/chats');
    setConversations(response.data);
    setSessionId((current) => current ?? response.data[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (!getToken()) { setChecking(false); return; }
    api.get('/auth/me').then((response) => { setEmail(response.data.email); return loadConversations(); }).catch(() => clearToken()).finally(() => setChecking(false));
  }, [loadConversations]);

  async function createConversation() {
    const response = await api.post('/chats');
    setSessionId(response.data.id);
    await loadConversations();
    setSessionId(response.data.id);
  }

  async function deleteConversation(id: string) {
    await api.delete(`/chats/${id}`);
    if (sessionId === id) setSessionId(null);
    await loadConversations();
  }

  if (checking) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading…</div>;
  if (!email) return <AuthScreen onAuthenticated={(value) => { setEmail(value); loadConversations(); }} />;

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="brand-header">
          <div className="brand-logo"><Database size={24} /></div>
          <div><h1 className="brand-text">Doc RAG</h1><small style={{ color: 'var(--text-secondary)' }}>{email}</small></div>
          <button title="Sign out" onClick={() => { clearToken(); setEmail(null); }} style={{ marginLeft: 'auto', background: 'transparent', border: 0, color: 'var(--text-secondary)', cursor: 'pointer' }}><LogOut size={18} /></button>
        </div>
        <ConversationList conversations={conversations} selectedId={sessionId} onSelect={setSessionId} onCreate={createConversation} onDelete={deleteConversation} />
        <DocumentUpload onUploadComplete={() => setRefreshDocs((value) => value + 1)} />
        <DocumentList refreshTrigger={refreshDocs} selectedIds={selectedDocumentIds} onSelectionChange={setSelectedDocumentIds} onDeleted={() => setRefreshDocs((value) => value + 1)} />
      </div>
      <div className="main-content"><ChatInterface documentIds={selectedDocumentIds} sessionId={sessionId} onSessionCreated={setSessionId} onSessionUpdated={loadConversations} /></div>
    </div>
  );
}

export default App;
