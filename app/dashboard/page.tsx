'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type MailFolder = string;

interface MailItem {
  id: string;
  folder: MailFolder;
  subject: string;
  senderName: string;
  senderEmail: string;
  preview: string;
  date: string;
}

interface UserInfo {
  email: string;
  provider: string;
}

interface MailDetail {
  html: string;
  text: string;
}

interface FolderResult {
  folder: MailFolder;
  label: string;
  mails: MailItem[];
  error?: string;
}

const FOLDER_OPTIONS: Array<{ key: MailFolder; label: string }> = [
  { key: 'inbox', label: '收件箱' },
  { key: 'trash', label: '垃圾箱' },
];

export default function Dashboard() {
  const [folder, setFolder] = useState<MailFolder>('inbox');
  const [emails, setEmails] = useState<MailItem[]>([]);
  const [folderResults, setFolderResults] = useState<FolderResult[]>([]);
  const [folderOptions, setFolderOptions] = useState(FOLDER_OPTIONS);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMail, setSelectedMail] = useState<MailItem | null>(null);
  const [mailBody, setMailBody] = useState<MailDetail | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [bodyError, setBodyError] = useState('');
  const router = useRouter();

  const fetchMails = useCallback(async (targetFolder: MailFolder) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/mail?folder=all', { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          router.push('/');
          return;
        }

        throw new Error(data.error || '获取邮件失败');
      }

      if (Array.isArray(data.folders)) {
        const results = data.folders as FolderResult[];
        const options = results.map((result) => ({ key: result.folder, label: result.label || result.folder }));
        const preferredInbox = results.find((result) => result.label === '收件箱' || result.folder.toLowerCase() === 'inbox');
        const activeFolder = results.find((result) => result.folder === targetFolder)
          ? targetFolder
          : preferredInbox?.folder || options[0]?.key || 'inbox';
        const activeResult = results.find((result) => result.folder === activeFolder);

        setFolderResults(results);
        setFolderOptions(options.length > 0 ? options : FOLDER_OPTIONS);
        if (activeFolder !== targetFolder) {
          setFolder(activeFolder);
        }
        setEmails(activeResult?.mails || []);
      } else {
        setFolderResults([]);
        setFolderOptions(FOLDER_OPTIONS);
        setEmails(Array.isArray(data.data) ? data.data : []);
      }
      setUserInfo({ email: data.userEmail, provider: data.provider });
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取邮件失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void fetchMails(folder);
  }, [fetchMails, folder]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  };

  const getOfficialUrl = () => {
    if (!userInfo) return '#';
    return userInfo.provider === 'google' ? 'https://mail.google.com' : 'https://outlook.live.com';
  };

  const handleOpenMail = async (mail: MailItem) => {
    setSelectedMail(mail);
    setMailBody(null);
    setBodyError('');
    setBodyLoading(true);

    try {
      const res = await fetch(`/api/mail?id=${encodeURIComponent(mail.id)}&folder=${mail.folder}`, {
        cache: 'no-store',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '获取邮件正文失败');
      }

      setMailBody(data.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取邮件正文失败';
      setBodyError(message);
    } finally {
      setBodyLoading(false);
    }
  };

  const closeMailModal = () => {
    setSelectedMail(null);
    setMailBody(null);
    setBodyError('');
    setBodyLoading(false);
  };

  const htmlDoc = useMemo(() => {
    if (!mailBody?.html) return '';

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none';" />
    <style>
      body {
        margin: 0;
        padding: 16px;
        color: #0f172a;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        line-height: 1.6;
        word-break: break-word;
      }
      img {
        max-width: 100%;
        height: auto;
      }
      pre {
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>${mailBody.html}</body>
</html>`;
  }, [mailBody]);

  const activeFolderResult = folderResults.find((result) => result.folder === folder);
  const folderLabel = folderOptions.find((option) => option.key === folder)?.label || '收件箱';

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#fff', marginBottom: '0.25rem' }}>
            {folderLabel}（最近 5 封）
          </h1>
          <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            当前邮箱: {userInfo?.email || '正在读取...'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <a href={getOfficialUrl()} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: '0.9rem', textDecoration: 'none', padding: '0.5rem 1rem', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
            官方登录
          </a>
          <button
            onClick={handleLogout}
            style={{ padding: '0.5rem 1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', cursor: 'pointer' }}
          >
            退出
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {folderOptions.map((option) => {
          const result = folderResults.find((item) => item.folder === option.key);
          const active = option.key === folder;

          return (
            <button
              key={option.key}
              onClick={() => {
                setFolder(option.key);
                closeMailModal();
              }}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '999px',
                border: active ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid rgba(148, 163, 184, 0.2)',
                background: active ? 'rgba(56, 189, 248, 0.16)' : 'rgba(15, 23, 42, 0.55)',
                color: active ? '#e0f2fe' : '#cbd5e1',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {option.label}（{result?.mails?.length ?? 0}）
              {result?.error ? ' ⚠️' : ''}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <span className="spinner" style={{ display: 'inline-block', marginRight: '10px' }}></span> 正在安全拉取邮件...
        </div>
      ) : error ? (
        <div style={{ color: 'var(--error)', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          ⚠️ {error}
        </div>
      ) : activeFolderResult?.error ? (
        <div style={{ color: 'var(--error)', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', wordBreak: 'break-word' }}>
          ⚠️ {folderLabel} 获取失败：{activeFolderResult.error}
        </div>
      ) : emails.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          当前 {folderLabel} 没有任何邮件。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {emails.map((mail, idx) => (
            <div
              key={`${mail.folder}-${mail.id}-${idx}`}
              className="glass-panel animate-fade-in"
              style={{ padding: '1.5rem', animationDelay: `${idx * 0.05}s`, cursor: 'pointer', transition: 'all 0.2s' }}
              onClick={() => void handleOpenMail(mail)}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '1.1rem' }}>{mail.subject}</div>
                  <div style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>
                    {mail.senderName ? `${mail.senderName} (${mail.senderEmail})` : mail.senderEmail}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.25rem', lineHeight: 1.5 }}>
                    {mail.preview || '暂无预览'}
                  </div>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {new Date(mail.date).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedMail && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem' }} onClick={closeMailModal}>
          <div style={{ background: '#0f172a', borderRadius: '12px', width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #334155', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }} onClick={(event) => event.stopPropagation()}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ color: '#f8fafc', fontSize: '1.25rem', marginBottom: '0.5rem' }}>{selectedMail.subject}</h2>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                  发件人：{selectedMail.senderName ? `${selectedMail.senderName} <${selectedMail.senderEmail}>` : selectedMail.senderEmail}
                </div>
                <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                  {new Date(selectedMail.date).toLocaleString()}
                </div>
              </div>
              <button onClick={closeMailModal} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem', background: '#fff' }}>
              {bodyLoading ? (
                <div style={{ color: '#64748b', textAlign: 'center', marginTop: '2rem' }}>加载正文中...</div>
              ) : bodyError ? (
                <div style={{ color: 'red', textAlign: 'center' }}>{bodyError}</div>
              ) : htmlDoc ? (
                <iframe
                  title="mail-html-body"
                  srcDoc={htmlDoc}
                  style={{ width: '100%', height: '600px', border: 'none' }}
                  sandbox=""
                />
              ) : (
                <div style={{ color: '#334155', whiteSpace: 'pre-wrap', fontFamily: 'sans-serif' }}>
                  {mailBody?.text || '该邮件无正文内容'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
