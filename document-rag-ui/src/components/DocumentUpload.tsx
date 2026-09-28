import { useRef, useState } from 'react';
import { UploadCloud, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { api } from '../api';

export function DocumentUpload({ onUploadComplete }: { onUploadComplete: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('PDF must be 10 MB or smaller.'); return; }
    setError(null); setSuccess(null); setIsUploading(true);
    const data = new FormData(); data.append('file', file);
    try {
      const response = await api.post('/documents/upload', data);
      setSuccess(`Uploaded ${response.data.filename} (${response.data.chunksCreated} chunks).`);
      onUploadComplete();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Upload failed.'); }
    finally { setIsUploading(false); }
  }

  return (
    <div className="glass-panel" style={{ padding: 24 }}>
      <h3 style={{ marginBottom: 16, fontSize: '1.1rem' }}>Upload Document</h3>
      <div className={`upload-zone ${isDragging ? 'drag-active' : ''}`} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }} onClick={() => input.current?.click()}>
        <input type="file" ref={input} hidden accept="application/pdf" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {isUploading ? <><Loader className="upload-icon animate-spin" size={40} /><p>Processing PDF…</p></> : <><UploadCloud className="upload-icon" size={48} /><p>Drag and drop a PDF</p><small>or click to browse</small></>}
      </div>
      {error && <div style={{ marginTop: 12, color: 'var(--danger)', display: 'flex', gap: 8 }}><AlertCircle size={18} />{error}</div>}
      {success && <div style={{ marginTop: 12, color: 'var(--success)', display: 'flex', gap: 8 }}><CheckCircle size={18} />{success}</div>}
    </div>
  );
}
