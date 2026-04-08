'use client';

import { useState } from 'react';
import './globals.css';

export default function Home() {
  const [provider, setProvider] = useState('microsoft');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [customClientId, setCustomClientId] = useState('');
  const [customClientSecret, setCustomClientSecret] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [authMode, setAuthMode] = useState<'auto' | 'password' | 'rt'>('auto');
  
  const handleSmartPaste = (val: string) => {
    if (val.includes('----')) {
      const parts = val.split('----').map(p => p.trim());
      if (parts.length >= 2) {
        setEmail(parts[0]);
        // 格式: 邮箱----GPT密码----邮箱密码----RT
        if (parts.length >= 3) setPassword(parts[2]); // 第三段是邮箱密码
        if (parts.length >= 4) setRefreshToken(parts[3]); // 第四段是RT(ChatGPT的)
        return;
      }
    }
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emails, setEmails] = useState<any[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setEmails([]);

    try {
      const res = await fetch('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider, 
          email, 
          password: password.trim() || undefined,
          refreshToken, 
          authMode,
          customClientId: customClientId.trim() || undefined, 
          customClientSecret: customClientSecret.trim() || undefined 
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        let errorMsg = json.error || '获取邮件失败 (Failed to fetch emails)。';
        if (json.details && json.details.error_description) {
          errorMsg += `\n详细报错 (Error): ${json.details.error_description}`;
        }
        errorMsg += `\n\n--- 原始返回 (Raw Payload) ---\n${JSON.stringify(json, null, 2)}`;
        throw new Error(errorMsg);
      }

      setEmails(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '600px', padding: '2rem', marginBottom: '2rem' }}>
        <h1 className="title">RT Mail Fetcher</h1>
        <p className="subtitle">通过 Refresh Token 或密码安全且极速地读取您的最新邮件</p>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          
          <div className="input-group" style={{ marginBottom: '1rem' }}>
            <label className="input-label" htmlFor="smart_paste" style={{ color: 'var(--success)' }}>⚡ 一键智能识别 (Smart Auto-Fill)</label>
            <input 
              id="smart_paste"
              className="input-field" 
              placeholder="粘贴组合串: 邮箱----密码----辅助箱----RT" 
              onChange={(e) => handleSmartPaste(e.target.value)}
              style={{ borderColor: 'rgba(16, 185, 129, 0.5)' }}
            />
          </div>

          {/* 认证模式选择 */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
            {[
              { key: 'auto', label: '🔄 自动 (Auto)' },
              { key: 'password', label: '🔑 密码登录' },
              { key: 'rt', label: '🎫 Refresh Token' },
            ].map(mode => (
              <button
                key={mode.key}
                type="button"
                onClick={() => setAuthMode(mode.key as any)}
                style={{
                  flex: 1, padding: '0.5rem', borderRadius: '6px', cursor: 'pointer',
                  background: authMode === mode.key ? 'rgba(139, 92, 246, 0.2)' : 'rgba(0,0,0,0.2)',
                  border: `1px solid ${authMode === mode.key ? 'rgb(139, 92, 246)' : 'var(--border)'}`,
                  color: authMode === mode.key ? '#fff' : '#94a3b8',
                  transition: 'all 0.2s', fontWeight: 500, fontSize: '0.8rem'
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="provider-selector" style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
            <button 
              type="button"
              onClick={() => setProvider('microsoft')}
              style={{
                flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer',
                background: provider === 'microsoft' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0,0,0,0.2)',
                border: `1px solid ${provider === 'microsoft' ? 'var(--accent)' : 'var(--border)'}`,
                color: provider === 'microsoft' ? '#fff' : '#94a3b8',
                transition: 'all 0.2s', fontWeight: 600
              }}
            >
              Microsoft / Outlook / Hotmail
            </button>
            <button 
              type="button"
              onClick={() => setProvider('google')}
              style={{
                flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer',
                background: provider === 'google' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0,0,0,0.2)',
                border: `1px solid ${provider === 'google' ? 'var(--success)' : 'var(--border)'}`,
                color: provider === 'google' ? '#fff' : '#94a3b8',
                transition: 'all 0.2s', fontWeight: 600
              }}
            >
              Google / Gmail
            </button>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="email">邮箱地址 (Email Address)</label>
            <input 
              id="email"
              type="email" 
              className="input-field" 
              placeholder={provider === 'microsoft' ? "例如: your_email@hotmail.com" : "例如: your_email@gmail.com"} 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {(authMode === 'password' || authMode === 'auto') && (
            <div className="input-group">
              <label className="input-label" htmlFor="pwd">密码 (Password)</label>
              <input 
                id="pwd"
                type="password" 
                className="input-field" 
                placeholder="邮箱密码（密码登录模式时使用）" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          
          {(authMode === 'rt' || authMode === 'auto') && (
            <div className="input-group">
              <label className="input-label" htmlFor="rt">刷新令牌 (Refresh Token)</label>
              <textarea 
                id="rt"
                className="input-field" 
                placeholder="在此输入您的 Refresh Token..." 
                rows={3}
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
          )}

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', color: '#cbd5e1', fontSize: '0.9rem', fontWeight: 500 }}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span>⚙️ 高级凭据设置 (OAuth Credentials)</span>
              <span>{showAdvanced ? '▴' : '▾'}</span>
            </div>
            
            {showAdvanced && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem', animation: 'fadeIn 0.3s ease forwards' }}>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  如果您留空，系统将自动使用内置的通用 Client ID 发起提取。如果您有特定的 OAuth 应用也可以在此覆写。
                </p>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" htmlFor="client_id">自定义 Client ID</label>
                  <input 
                    id="client_id"
                    type="text" 
                    className="input-field" 
                    placeholder="选填 (Optional)" 
                    value={customClientId}
                    onChange={(e) => setCustomClientId(e.target.value)}
                  />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" htmlFor="client_secret">自定义 Client Secret</label>
                  <input 
                    id="client_secret"
                    type="password" 
                    className="input-field" 
                    placeholder="选填 (Optional)" 
                    value={customClientSecret}
                    onChange={(e) => setCustomClientSecret(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
          
          <button type="submit" className="btn" disabled={loading} style={{ background: provider === 'google' ? 'var(--success)' : 'var(--accent)' }}>
            {loading ? (
              <><span className="spinner"></span> 正在为您拉取... (Fetching)</>
            ) : (
              '获取最新邮件 (Fetch Emails)'
            )}
          </button>
          
          {error && (
            <div style={{ color: 'var(--error)', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.9rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap', maxHeight: '300px', overflow: 'auto' }}>
              ⚠️ {error}
            </div>
          )}
        </form>
      </div>

      {emails.length > 0 && (
        <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#fff', marginBottom: '1rem', paddingLeft: '0.5rem' }}>最新收件箱 (Latest Emails): {emails.length} 封</h2>
          
          {emails.map((mail, idx) => (
            <div key={mail.id} className="glass-panel animate-fade-in" style={{ padding: '1.5rem', animationDelay: `${idx * 0.05}s` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '1.1rem' }}>{mail.subject}</div>
                  <div style={{ color: provider === 'google' ? 'var(--success)' : 'var(--accent)', fontSize: '0.9rem' }}>
                    {mail.senderName ? `${mail.senderName} (${mail.senderEmail})` : mail.senderEmail}
                  </div>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {new Date(mail.date).toLocaleString()}
                </div>
              </div>
              
              <div style={{ color: '#cbd5e1', fontSize: '0.95rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
                {mail.preview}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
