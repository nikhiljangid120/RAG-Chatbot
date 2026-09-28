import { useEffect, useState } from 'react';
import { FileText, Loader, Trash2 } from 'lucide-react';
import { api } from '../api';

interface Document { id: string; filename: string; status: string; pageCount: number; createdAt: string }
interface Props { refreshTrigger: number; selectedIds: string[]; onSelectionChange: (ids: string[]) => void; onDeleted: () => void }

export function DocumentList({ refreshTrigger, selectedIds, onSelectionChange, onDeleted }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/documents').then((response) => setDocuments(response.data.documents)).finally(() => setLoading(false));
  }, [refreshTrigger]);

  async function remove(document: Document) {
    if (!window.confirm(`Delete ${document.filename}?`)) return;
    await api.delete(`/documents/${document.id}`);
    onSelectionChange(selectedIds.filter((id) => id !== document.id));
    onDeleted();
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Loader className="animate-spin" /></div>;
  return (
    <div className="glass-panel" style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Library</h3>
        <button onClick={() => onSelectionChange([])} style={{ background: 'transparent', border: 0, color: 'var(--primary)', cursor: 'pointer' }}>Search all</button>
      </div>
      {documents.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No documents uploaded yet.</p> : (
        <div className="doc-list">{documents.map((document) => (
          <div key={document.id} className="doc-item">
            <input type="checkbox" checked={selectedIds.includes(document.id)} onChange={() => onSelectionChange(selectedIds.includes(document.id) ? selectedIds.filter((id) => id !== document.id) : [...selectedIds, document.id])} />
            <FileText className="doc-icon" size={20} />
            <div className="doc-info"><div className="doc-name" title={document.filename}>{document.filename}</div><div className="doc-meta"><span>{document.pageCount || '?'} pages</span><span className={`status-badge status-${document.status.toLowerCase()}`}>{document.status}</span></div></div>
            <button title="Delete" onClick={() => remove(document)} style={{ background: 'transparent', border: 0, color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={16} /></button>
          </div>
        ))}</div>
      )}
    </div>
  );
}
