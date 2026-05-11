'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import './globals.css';

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '登录失败');
      }

      if (data.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        <h1 className="title" style={{ textAlign: 'center' }}>系统登录</h1>
        <p className="subtitle" style={{ textAlign: 'center', marginBottom: '2rem' }}>欢迎使用 RT Mail 系统</p>
        
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div className="input-group">
            <label className="input-label" htmlFor="email">账号 (Email)</label>
            <input 
              id="email"
              type="text" 
              className="input-field" 
              placeholder="请输入账号或邮箱" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="password">密码 (Password)</label>
            <input 
              id="password"
              type="password" 
              className="input-field" 
              placeholder="请输入密码" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn" disabled={loading} style={{ marginTop: '1rem', background: 'var(--accent)' }}>
            {loading ? <span className="spinner"></span> : '登 录'}
          </button>
          
          {error && (
            <div style={{ color: 'var(--error)', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.9rem', textAlign: 'center' }}>
              ⚠️ {error}
            </div>
          )}
        </form>
        
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <a href="https://example.com" target="_blank" rel="noopener noreferrer" style={{ color: '#94a3b8', fontSize: '0.85rem', textDecoration: 'none', borderBottom: '1px solid #94a3b8' }}>
            访问官方网站
          </a>
        </div>
      </div>
    </main>
  );
}
