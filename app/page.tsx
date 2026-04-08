'use client';

import { useState } from 'react';
import './globals.css';

export default function Home() {
  const [provider, setProvider] = useState('microsoft');
  const [email, setEmail] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [customClientId, setCustomClientId] = useState('');
  const [customClientSecret, setCustomClientSecret] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const handleSmartPaste = (val: string) => {
    if (val.includes('----')) {
      const parts = val.split('----').map(p => p.trim());
      if (parts.length >= 2) {
        setEmail(parts[0]);
        // Usually, the RT is the last part
        setRefreshToken(parts[parts.length - 1]);
        return;
      }
    }
    // If not a combo string, just set the value normally based on context
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
          refreshToken, 
          customClientId: customClientId.trim() || undefined, 
          customClientSecret: customClientSecret.trim() || undefined 
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        let errorMsg = json.error || 'Failed to fetch emails.';
        if (json.details && json.details.error_description) {
          errorMsg += `\nDetailed Error: ${json.details.error_description}`;
        } else if (json.details) {
          errorMsg += `\nDetails: ${JSON.stringify(json.details)}`;
        }
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
        <p className="subtitle">Securely access your latest emails via Refresh Token</p>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          
          <div className="input-group" style={{ marginBottom: '1rem' }}>
            <label className="input-label" htmlFor="smart_paste" style={{ color: 'var(--success)' }}>⚡ Smart Auto-Fill (Optional)</label>
            <input 
              id="smart_paste"
              className="input-field" 
              placeholder="Paste combo here: email----pwd----recover----rt" 
              onChange={(e) => handleSmartPaste(e.target.value)}
              style={{ borderColor: 'rgba(16, 185, 129, 0.5)' }}
            />
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
            <label className="input-label" htmlFor="email">Email Address</label>
            <input 
              id="email"
              type="email" 
              className="input-field" 
              placeholder={provider === 'microsoft' ? "e.g. your_email@hotmail.com" : "e.g. your_email@gmail.com"} 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="input-group">
            <label className="input-label" htmlFor="rt">Refresh Token</label>
            <textarea 
              id="rt"
              className="input-field" 
              placeholder="Paste your long refresh token here..." 
              rows={4}
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              required
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', color: '#cbd5e1', fontSize: '0.9rem', fontWeight: 500 }}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span>⚙️ Advanced Settings (OAuth Credentials)</span>
              <span>{showAdvanced ? '▴' : '▾'}</span>
            </div>
            
            {showAdvanced && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem', animation: 'fadeIn 0.3s ease forwards' }}>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  If left blank, the system will use a built-in generic Client ID. Providing your own is recommended for stability.
                </p>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" htmlFor="client_id">Custom Client ID</label>
                  <input 
                    id="client_id"
                    type="text" 
                    className="input-field" 
                    placeholder="Optional" 
                    value={customClientId}
                    onChange={(e) => setCustomClientId(e.target.value)}
                  />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" htmlFor="client_secret">Custom Client Secret</label>
                  <input 
                    id="client_secret"
                    type="password" 
                    className="input-field" 
                    placeholder="Optional" 
                    value={customClientSecret}
                    onChange={(e) => setCustomClientSecret(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
          
          <button type="submit" className="btn" disabled={loading} style={{ background: provider === 'google' ? 'var(--success)' : 'var(--accent)' }}>
            {loading ? (
              <><span className="spinner"></span> Fetching Emails...</>
            ) : (
              'Fetch Emails'
            )}
          </button>
          
          {error && (
            <div style={{ color: 'var(--error)', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              ⚠️ {error}
            </div>
          )}
        </form>
      </div>

      {emails.length > 0 && (
        <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#fff', marginBottom: '1rem', paddingLeft: '0.5rem' }}>Latest Emails ({emails.length})</h2>
          
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
