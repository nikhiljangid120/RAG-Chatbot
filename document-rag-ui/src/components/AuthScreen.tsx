import { FormEvent, useState } from 'react';
import { api, setToken } from '../api';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (email: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      const response = await api.post(`/auth/${mode}`, { email, password });
      setToken(response.data.token);
      onAuthenticated(response.data.user.email);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Authentication failed.');
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <form className="glass-panel" onSubmit={submit} style={{ width: '100%', maxWidth: 420, padding: 32, display: 'grid', gap: 16 }}>
        <h1 style={{ margin: 0 }}>Doc RAG</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{mode === 'login' ? 'Sign in to your private document workspace.' : 'Create your private document workspace.'}</p>
        <input className="chat-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="chat-input" type="password" placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
        <button className="send-btn" type="submit" disabled={loading} style={{ width: '100%' }}>{loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} style={{ border: 0, background: 'transparent', color: 'var(--primary)', cursor: 'pointer' }}>
          {mode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}
        </button>
      </form>
    </div>
  );
}
