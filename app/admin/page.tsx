'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Account = {
  id: number;
  email: string;
  password: string;
  provider?: string;
  role?: string;
  client_id?: string;
  rt?: string;
  last_login_at?: string;
};

export default function AdminPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [importData, setImportData] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const router = useRouter();

  useEffect(() => {
    void fetchAccounts(page, pageSize);
  }, [page, pageSize]);

  const fetchAccounts = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/accounts?page=${targetPage}&pageSize=${targetPageSize}`);
      if (res.status === 401) {
        router.push('/');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data);
        if (data.pagination) {
          setTotal(data.pagination.total);
          setPage(data.pagination.page);
          setPageSize(data.pagination.pageSize);
          setTotalPages(data.pagination.totalPages);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openImportModal = () => {
    setMessage(null);
    setImportOpen(true);
  };

  const closeImportModal = () => {
    if (importing) return;
    setImportOpen(false);
    setMessage(null);
    setImportData('');
  };

  const handleImport = async () => {
    if (!importData.trim()) return;
    setImporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawData: importData })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `成功导入 ${data.imported} 条数据，失败 ${data.failed} 条。` });
        setImportData('');
        setImportOpen(false);
        setPage(1);
        await fetchAccounts(1, pageSize);
      } else {
        setMessage({ type: 'error', text: data.error || '导入失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '导入失败' });
    } finally {
      setImporting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  };

  const fetchAllAccounts = async () => {
    const res = await fetch('/api/admin/accounts?all=1');
    if (!res.ok) throw new Error('导出前获取账号失败');
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data)) throw new Error(data.error || '导出前获取账号失败');
    return data.data as Account[];
  };

  const handleExportTxt = async () => {
    const allAccounts = await fetchAllAccounts();
    const content = allAccounts.map(acc =>
      `${acc.email}----${acc.password}----${acc.client_id || ''}----${acc.rt || ''}`
    ).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async () => {
    const allAccounts = await fetchAllAccounts();
    const headers = ['ID', 'Email', 'Password', 'Provider', 'Client ID', 'Refresh Token', 'Last Login At'];
    const rows = allAccounts.map(acc => [
      acc.id,
      acc.email,
      acc.password,
      acc.provider,
      acc.client_id,
      acc.rt,
      acc.last_login_at ? new Date(acc.last_login_at).toLocaleString() : ''
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row: unknown[]) => row.map((cell: unknown) => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#fff' }}>🛡️ 管理后台</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <a href="https://example.com" target="_blank" rel="noopener noreferrer" style={{ color: '#94a3b8', fontSize: '0.9rem', textDecoration: 'none' }}>官方网站</a>
          <button onClick={handleLogout} style={{ padding: '0.5rem 1rem', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', cursor: 'pointer' }}>退出</button>
        </div>
      </div>

      {message && !importOpen && (
        <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '8px', background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: message.type === 'success' ? '#34d399' : '#fca5a5', border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}` }}>
          {message.text}
        </div>
      )}

      <div className="glass-panel" style={{ padding: '2rem', overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.2rem', color: '#fff' }}>账号列表 ({total})</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={openImportModal} style={{ padding: '0.55rem 1rem', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>批量导入</button>
            <button onClick={handleExportTxt} disabled={total === 0} style={{ padding: '0.55rem 1rem', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: total === 0 ? 'not-allowed' : 'pointer' }}>📥 导出为导入格式</button>
            <button onClick={handleExportCsv} disabled={total === 0} style={{ padding: '0.55rem 1rem', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: total === 0 ? 'not-allowed' : 'pointer' }}>📊 导出 CSV</button>
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>加载中...</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', minWidth: '800px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '1rem 0.5rem' }}>ID</th>
                  <th style={{ padding: '1rem 0.5rem' }}>邮箱 (Email)</th>
                  <th style={{ padding: '1rem 0.5rem' }}>密码 (Password)</th>
                  <th style={{ padding: '1rem 0.5rem' }}>Provider</th>
                  <th style={{ padding: '1rem 0.5rem' }}>Refresh Token</th>
                  <th style={{ padding: '1rem 0.5rem' }}>最后登录时间</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(acc => (
                  <tr key={acc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#cbd5e1' }}>
                    <td style={{ padding: '1rem 0.5rem' }}>{acc.id}</td>
                    <td style={{ padding: '1rem 0.5rem', fontWeight: 600 }}>{acc.email}</td>
                    <td style={{ padding: '1rem 0.5rem', color: '#fca5a5' }}>{acc.password}</td>
                    <td style={{ padding: '1rem 0.5rem' }}><span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>{acc.provider || acc.role}</span></td>
                    <td style={{ padding: '1rem 0.5rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={acc.rt}>{acc.rt || '-'}</td>
                    <td style={{ padding: '1rem 0.5rem', color: '#94a3b8', fontSize: '0.8rem' }}>{acc.last_login_at ? new Date(acc.last_login_at).toLocaleString() : '从未登录'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', gap: '1rem', flexWrap: 'wrap', color: '#94a3b8' }}>
              <div>第 {page} / {totalPages} 页，每页
                <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} style={{ margin: '0 0.5rem', background: 'rgba(0,0,0,0.3)', color: '#cbd5e1', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.35rem 0.5rem' }}>
                  {[25, 50, 100, 200].map(size => <option key={size} value={size}>{size}</option>)}
                </select>条，共 {total} 条</div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button onClick={() => setPage(1)} disabled={page <= 1} style={{ padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>首页</button>
                <button onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1} style={{ padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>上一页</button>
                <button onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} disabled={page >= totalPages} style={{ padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>下一页</button>
                <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} style={{ padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>末页</button>
              </div>
            </div>
          </>
        )}
      </div>

      {importOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }} onClick={closeImportModal}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '860px', padding: '2rem', boxShadow: '0 25px 80px rgba(0,0,0,0.45)' }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#fff', margin: 0 }}>批量导入账号</h2>
              <button onClick={closeImportModal} disabled={importing} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.8rem', cursor: importing ? 'not-allowed' : 'pointer' }}>×</button>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1rem' }}>每行一条数据，格式：<code style={{ background: '#000', padding: '2px 6px', borderRadius: '4px' }}>邮箱----密码----clientid(可选)----rt(可选)</code></p>
            <textarea value={importData} onChange={e => setImportData(e.target.value)} placeholder="user@example.com----pass123----id123----rt123..." style={{ width: '100%', height: '260px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', padding: '1rem', fontFamily: 'monospace', marginBottom: '1rem', resize: 'vertical' }} />
            {message && (
              <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '8px', background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: message.type === 'success' ? '#34d399' : '#fca5a5', border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}` }}>{message.text}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={closeImportModal} disabled={importing} style={{ padding: '0.75rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: importing ? 'not-allowed' : 'pointer' }}>取消</button>
              <button onClick={handleImport} disabled={importing || !importData.trim()} style={{ background: 'var(--success)', color: '#fff', padding: '0.75rem 1.5rem', border: 'none', borderRadius: '8px', cursor: importing || !importData.trim() ? 'not-allowed' : 'pointer', fontWeight: 600 }}>{importing ? '导入中...' : '开始批量导入'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
