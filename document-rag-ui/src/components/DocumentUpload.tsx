import { useState, useRef } from 'react';
import axios from 'axios';
import { UploadCloud, FileType, CheckCircle, AlertCircle, Loader } from 'lucide-react';

interface DocumentUploadProps {
  onUploadComplete: () => void;
}

export function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:3000/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSuccess(`Uploaded ${response.data.filename} successfully (${response.data.chunksCreated} chunks)`);
      onUploadComplete();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>Upload Document</h3>
      
      <div 
        className={`upload-zone ${isDragging ? 'drag-active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept="application/pdf"
          onChange={(e) => e.target.files && handleFile(e.target.files[0])}
        />
        
        {isUploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Loader className="upload-icon animate-spin" size={40} />
            <p style={{ color: 'var(--text-secondary)' }}>Processing PDF & Generating Embeddings...</p>
          </div>
        ) : (
          <>
            <UploadCloud className="upload-icon" size={48} />
            <p style={{ color: 'var(--text-secondary)' }}>Drag & drop your PDF here</p>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', marginTop: '8px' }}>or click to browse</p>
          </>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {success && (
        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(16,185,129,0.1)', color: 'var(--success)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
          <CheckCircle size={18} />
          {success}
        </div>
      )}
    </div>
  );
}
