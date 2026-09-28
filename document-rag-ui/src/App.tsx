import { useEffect, useState } from 'react';
import { Database, LogOut } from 'lucide-react';
import { DocumentUpload } from './components/DocumentUpload';
import { DocumentList } from './components/DocumentList';
import { ChatInterface } from './components/ChatInterface';
import { AuthScreen } from './components/AuthScreen';
import { api, clearToken, getToken } from './api';

function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [refreshDocs, setRefreshDocs] = useState(0);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);

  useEffect(() => {
    if (!getToken()) { setChecking(false); return; }
    api.get('/auth/me').then((response) => setEmail(response.data.email)).catch(() => clearToken()).finally(() => setChecking(false));
  }, []);

  if (checking) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading…</div>;
  if (!email) return <AuthScreen onAuthenticated={setEmail} />;

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="brand-header">
          <div className="brand-logo"><Database size={24} /></div>
          <div><h1 className="brand-text">Doc RAG</h1><small style={{ color: 'var(--text-secondary)' }}>{email}</small></div>
          <button title="Sign out" onClick={() => { clearToken(); setEmail(null); }} style={{ marginLeft: 'auto', background: 'transparent', border: 0, color: 'var(--text-secondary)', cursor: 'pointer' }}><LogOut size={18} /></button>
        </div>
        <DocumentUpload onUploadComplete={() => setRefreshDocs((value) => value + 1)} />
        <DocumentList refreshTrigger={refreshDocs} selectedIds={selectedDocumentIds} onSelectionChange={setSelectedDocumentIds} onDeleted={() => setRefreshDocs((value) => value + 1)} />
      </div>
      <div className="main-content"><ChatInterface documentIds={selectedDocumentIds} /></div>
    </div>
  );
}

export default App;
