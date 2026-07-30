import { useState } from 'react';
import { DocumentUpload } from './components/DocumentUpload';
import { DocumentList } from './components/DocumentList';
import { ChatInterface } from './components/ChatInterface';
import { Database } from 'lucide-react';

function App() {
  const [refreshDocs, setRefreshDocs] = useState(0);

  const handleUploadComplete = () => {
    // Increment to trigger re-fetch in DocumentList
    setRefreshDocs(prev => prev + 1);
  };

  return (
    <div className="app-container">
      {/* Sidebar Area */}
      <div className="sidebar">
        <div className="brand-header">
          <div className="brand-logo">
            <Database size={24} />
          </div>
          <h1 className="brand-text">Doc RAG</h1>
        </div>
        
        <DocumentUpload onUploadComplete={handleUploadComplete} />
        
        <DocumentList refreshTrigger={refreshDocs} />
      </div>

      {/* Main Chat Area */}
      <div className="main-content">
        <ChatInterface />
      </div>
    </div>
  );
}

export default App;
