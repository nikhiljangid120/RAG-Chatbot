import { useEffect, useState } from 'react';
import axios from 'axios';
import { FileText, Loader } from 'lucide-react';

interface Document {
  id: string;
  filename: string;
  status: string;
  createdAt: string;
}

interface DocumentListProps {
  refreshTrigger: number;
}

export function DocumentList({ refreshTrigger }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await axios.get('http://localhost:3000/documents');
        setDocuments(response.data.documents);
      } catch (error) {
        console.error('Failed to fetch documents', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDocuments();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
        <Loader className="animate-spin" size={24} color="var(--primary)" />
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>Library</h3>
      
      {documents.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', marginTop: '24px' }}>
          No documents uploaded yet.
        </p>
      ) : (
        <div className="doc-list">
          {documents.map((doc) => (
            <div key={doc.id} className="doc-item">
              <FileText className="doc-icon" size={20} />
              <div className="doc-info">
                <div className="doc-name" title={doc.filename}>{doc.filename}</div>
                <div className="doc-meta">
                  <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                  <span className={`status-badge status-${doc.status.toLowerCase()}`}>
                    {doc.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
