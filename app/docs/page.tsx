'use client';

import { useState } from 'react';

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<'api' | 'token'>('api');

  const copy = (text: string) => navigator.clipboard.writeText(text);

  const Code = ({ children }: { children: React.ReactNode }) => (
    <code style={{ background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85em', color: '#e2e8f0' }}>{children}</code>
  );

  const CopyBtn = ({ text }: { text: string }) => (
    <button onClick={() => copy(text)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#94a3b8', padding: '2px 10px', fontSize: '0.75rem', cursor: 'pointer', marginLeft: '8px' }}>复制</button>
  );

  const CodeBlock = ({ code, lang = 'bash' }: { code: string; lang?: string }) => (
    <div style={{ position: 'relative', margin: '0.75rem 0' }}>
      <pre style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '1rem', overflow: 'auto', fontSize: '0.85rem', lineHeight: 1.6, color: '#cbd5e1' }}><code>{code}</code></pre>
      <button onClick={() => copy(code)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#94a3b8', padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer' }}>复制</button>
    </div>
  );

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div id={id} style={{ marginBottom: '2.5rem' }}>
      <h3 style={{ fontSize: '1.3rem', color: '#fff', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{title}</h3>
      {children}
    </div>
  );

  const ParamTable = ({ rows }: { rows: { name: string; required: string; type: string; desc: string }[] }) => (
    <div style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', margin: '1rem 0' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>参数</th>
            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>必填</th>
            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>类型</th>
            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>说明</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#cbd5e1' }}>
              <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{row.name}</td>
              <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: row.required === '是' ? '#fca5a5' : '#94a3b8' }}>{row.required}</span></td>
              <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{row.type}</td>
              <td style={{ padding: '0.75rem 1rem' }}>{row.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <main style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#fff' }}>📖 API 接口文档</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <a href="/admin" style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer', textDecoration: 'none', fontSize: '0.9rem' }}>← 返回后台</a>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
        <button onClick={() => setActiveTab('api')} style={{ padding: '0.55rem 1.25rem', borderRadius: '8px', border: 'none', background: activeTab === 'api' ? 'rgba(108,92,231,0.2)' : 'rgba(255,255,255,0.05)', color: activeTab === 'api' ? '#a78bfa' : '#94a3b8', cursor: 'pointer', fontWeight: activeTab === 'api' ? 600 : 400 }}>📡 API 接口</button>
        <button onClick={() => setActiveTab('token')} style={{ padding: '0.55rem 1.25rem', borderRadius: '8px', border: 'none', background: activeTab === 'token' ? 'rgba(108,92,231,0.2)' : 'rgba(255,255,255,0.05)', color: activeTab === 'token' ? '#a78bfa' : '#94a3b8', cursor: 'pointer', fontWeight: activeTab === 'token' ? 600 : 400 }}>🔑 令牌申请指南</button>
      </div>

      {activeTab === 'token' && (
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <Section id="token-overview" title="OAuth Refresh Token 申请指南">
            <p style={{ color: '#cbd5e1', lineHeight: 1.8, marginBottom: '1rem' }}>
              本系统通过 OAuth Refresh Token (RT) 代理解读邮件。您需要为每个邮箱账号申请一个 RT，然后传入系统即可拉取邮件。
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
              目前支持 Google (Gmail) 和 Microsoft (Outlook/Hotmail/Live/Office365) 两大生态。
            </p>
          </Section>

          <Section id="token-google" title="Google (Gmail) RT 申请">
            <ol style={{ color: '#cbd5e1', lineHeight: 2.2, paddingLeft: '1.5rem' }}>
              <li>打开 <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>Google Cloud Console</a> 并创建项目</li>
              <li>前往 <strong>API 和服务 → 凭据</strong></li>
              <li>创建 OAuth 客户端 ID（应用类型选"桌面应用"或"Web 应用"）</li>
              <li>添加重定向 URI：<Code>http://localhost</Code></li>
              <li>记下生成的 <strong>Client ID</strong></li>
              <li>在 Google Cloud Console 中启用 <strong>Gmail API</strong></li>
              <li>使用以下链接获取授权码（替换 <Code>YOUR_CLIENT_ID</Code>）：</li>
            </ol>
            <CodeBlock code={'https://accounts.google.com/o/oauth2/v2/auth?\n  client_id=YOUR_CLIENT_ID&\n  redirect_uri=http://localhost&\n  response_type=code&\n  scope=https://mail.google.com/&\n  access_type=offline&\n  prompt=consent'} />

            <p style={{ color: '#cbd5e1', marginTop: '0.5rem' }}>8. 浏览器打开上述链接 → 授权后 URL 中获取 <Code>code</Code> 参数</p>
            <p style={{ color: '#cbd5e1' }}>9. 用 code 换取 Refresh Token：</p>
            <CodeBlock code={'curl -X POST https://oauth2.googleapis.com/token \\\n  -d "client_id=YOUR_CLIENT_ID" \\\n  -d "client_secret=YOUR_CLIENT_SECRET" \\\n  -d "code=上一步获取的code" \\\n  -d "redirect_uri=http://localhost" \\\n  -d "grant_type=authorization_code"'}/>

            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              ⚠️ 返回的 JSON 中的 <Code>refresh_token</Code> 就是本系统需要的 RT。如果没有返回 refresh_token，请检查 scope 是否包含 <Code>https://mail.google.com/</Code> 且 access_type=offline。
            </p>
          </Section>

          <Section id="token-microsoft" title="Microsoft (Outlook/Hotmail) RT 申请">
            <ol style={{ color: '#cbd5e1', lineHeight: 2.2, paddingLeft: '1.5rem' }}>
              <li>打开 <a href="https://portal.azure.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>Azure Portal</a> → <strong>Azure Active Directory</strong></li>
              <li>进入 <strong>应用注册</strong> → 新建注册</li>
              <li>名称随意，受支持的账户类型选"任何组织目录中的帐户和个人 Microsoft 帐户"</li>
              <li>重定向 URI 选 <Code>Web</Code>，填 <Code>http://localhost</Code></li>
              <li>注册后记下 <strong>应用程序(客户端) ID</strong>（即 Client ID）</li>
              <li>进入 <strong>证书和密码</strong> → 新建客户端密码，记下值</li>
              <li>进入 <strong>API 权限</strong> → 添加 Microsoft Graph 委托权限：
                <ul style={{ paddingLeft: '1.5rem', marginTop: '0.3rem' }}>
                  <li><Code>IMAP.AccessAsUser.All</Code></li>
                  <li><Code>offline_access</Code></li>
                  <li><Code>User.Read</Code></li>
                </ul>
              </li>
              <li>使用以下链接获取授权码（替换 <Code>YOUR_CLIENT_ID</Code>）：</li>
            </ol>
            <CodeBlock code={'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?\n  client_id=YOUR_CLIENT_ID&\n  redirect_uri=http://localhost&\n  response_type=code&\n  scope=openid%20offline_access%20IMAP.AccessAsUser.All&\n  response_mode=query'} />

            <p style={{ color: '#cbd5e1', marginTop: '0.5rem' }}>9. 授权后从 URL 获取 <Code>code</Code> 参数</p>
            <p style={{ color: '#cbd5e1' }}>10. 用 code 换取 Refresh Token：</p>
            <CodeBlock code={'curl -X POST https://login.microsoftonline.com/common/oauth2/v2.0/token \\\n  -d "client_id=YOUR_CLIENT_ID" \\\n  -d "client_secret=YOUR_CLIENT_SECRET" \\\n  -d "code=上一步获取的code" \\\n  -d "redirect_uri=http://localhost" \\\n  -d "grant_type=authorization_code"'}/>

            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              ⚠️ Microsoft 的 refresh_token 有效期最长为 90 天（无活动时），建议定期刷新。scope 必须包含 <Code>offline_access</Code> 才能获得 refresh_token。
            </p>
          </Section>

          <Section id="token-rt-note" title="RT 使用注意事项">
            <ul style={{ color: '#cbd5e1', lineHeight: 2, paddingLeft: '1.5rem' }}>
              <li>Google 的 RT 可能以 <Code>rt_</Code> 开头，系统会自动去除该前缀</li>
              <li>如果系统已有默认 Client ID，可以不传 <Code>client_id</Code> 参数</li>
              <li>RT 应妥善保管，泄露后任何人都能代您读取邮件</li>
              <li>建议在系统后台批量导入账号时一并录入 RT</li>
            </ul>
          </Section>
        </div>
      )}

      {activeTab === 'api' && (
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <Section id="api-fetch" title="API 1: POST /api/mail/fetch">
            <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>
              传入完整的邮箱凭据，系统代为拉取邮件。<strong style={{ color: '#fca5a5' }}>无需登录认证</strong>，调用方直接携带凭据即可使用。
            </p>

            <h4 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>请求体 (JSON)</h4>
            <ParamTable rows={[
              { name: 'email', required: '是', type: 'string', desc: '邮箱地址' },
              { name: 'rt', required: '是', type: 'string', desc: 'OAuth Refresh Token（自动处理 rt_ 前缀）' },
              { name: 'provider', required: '是', type: 'string', desc: '"google" 或 "microsoft"' },
              { name: 'client_id', required: '否', type: 'string', desc: 'OAuth Client ID（不传则用系统默认值）' },
              { name: 'folder', required: '否', type: 'string', desc: '"inbox"(默认), "trash", "all"' },
              { name: 'page', required: '否', type: 'number', desc: '页码，从1开始，默认1，每页最多5封' },
            ]} />

            <h4 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>请求示例</h4>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.3rem' }}>获取收件箱（第1页，每封含完整 html+text 正文）：</p>
            <CodeBlock code={`curl -X POST https://outlook.rdmail.cn/api/mail/fetch \\\n  -H "Content-Type: application/json" \\\n  -d '{\n  "email": "user@gmail.com",\n  "rt": "rt_xxxxx...",\n  "provider": "google",\n  "folder": "inbox"\n}'`} />

            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.3rem' }}>翻页（第2页）：</p>
            <CodeBlock code={`curl -X POST https://outlook.rdmail.cn/api/mail/fetch \\\n  -H "Content-Type: application/json" \\\n  -d '{\n  "email": "user@gmail.com",\n  "rt": "rt_xxxxx...",\n  "provider": "google",\n  "folder": "inbox",\n  "page": 2\n}'`} />

            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.3rem' }}>列出所有文件夹摘要（不返回正文）：</p>
            <CodeBlock code={`curl -X POST https://outlook.rdmail.cn/api/mail/fetch \\\n  -H "Content-Type: application/json" \\\n  -d '{\n  "email": "user@gmail.com",\n  "rt": "rt_xxxxx...",\n  "provider": "google",\n  "folder": "all"\n}'`} />

            <h4 style={{ color: '#e2e8f0', marginBottom: '0.5rem', marginTop: '1.5rem' }}>响应格式</h4>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.3rem' }}>单文件夹（返回含正文的邮件列表 + 翻页信息）：</p>
            <CodeBlock lang="json" code={`{\n  "success": true,\n  "data": [\n    {\n      "id": "123",\n      "folder": "inbox",\n      "subject": "您好",\n      "senderName": "张三",\n      "senderEmail": "zhangsan@example.com",\n      "preview": "预览...",\n      "date": "2026-07-25T10:00:00.000Z",\n      "html": "<div>邮件HTML内容...</div>",\n      "text": "邮件纯文本内容..."\n    }\n  ],\n  "pagination": {\n    "total": 20,\n    "page": 1,\n    "pageSize": 5,\n    "totalPages": 4\n  },\n  "userEmail": "user@gmail.com",\n  "provider": "google"\n}`} />

            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.3rem' }}>多文件夹（摘要列表，不含正文）：</p>
            <CodeBlock lang="json" code={`{\n  "success": true,\n  "mode": "all",\n  "folders": [\n    {\n      "folder": "inbox",\n      "label": "收件箱",\n      "mails": [\n        { "id": "123", "subject": "...", "senderName": "...", ... }\n      ]\n    }\n  ],\n  "userEmail": "user@gmail.com",\n  "provider": "google"\n}`} />

            <h4 style={{ color: '#e2e8f0', marginBottom: '0.5rem', marginTop: '1.5rem' }}>错误码</h4>
            <ParamTable rows={[
              { name: '400', required: '', type: '', desc: '缺少必填字段（email/rt/provider），或不支持的 provider' },
              { name: '500', required: '', type: '', desc: 'OAuth 令牌刷新失败、IMAP 连接异常、Gmail API 错误等' },
            ]} />
          </Section>

          <Section id="api-lookup" title="API 2: POST /api/mail/lookup">
            <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>
              传入系统中已维护的邮箱和密码，验证通过后使用该账号的 Refresh Token 拉取邮件。<strong style={{ color: '#34d399' }}>无需管理员权限</strong>，只需有该邮箱的正确密码即可。
            </p>

            <h4 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>请求体 (JSON)</h4>
            <ParamTable rows={[
              { name: 'email', required: '是', type: 'string', desc: '系统中已存在的邮箱地址' },
              { name: 'password', required: '是', type: 'string', desc: '该邮箱在系统中的密码，用于验证身份' },
              { name: 'folder', required: '否', type: 'string', desc: '"inbox"(默认), "trash", "all"' },
              { name: 'page', required: '否', type: 'number', desc: '页码，从1开始，默认1，每页最多5封' },
            ]} />

            <h4 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>请求示例</h4>
            <CodeBlock code={`curl -X POST https://outlook.rdmail.cn/api/mail/lookup \\\n  -H "Content-Type: application/json" \\\n  -d '{\n  "email": "user@outlook.com",\n  "password": "mypassword",\n  "folder": "inbox"\n}'`} />

            <h4 style={{ color: '#e2e8f0', marginBottom: '0.5rem', marginTop: '1.5rem' }}>响应格式</h4>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>与 <Code>POST /api/mail/fetch</Code> 完全一致。</p>

            <h4 style={{ color: '#e2e8f0', marginBottom: '0.5rem', marginTop: '1.5rem' }}>错误码</h4>
            <ParamTable rows={[
              { name: '400', required: '', type: '', desc: '缺少 email 或 password' },
              { name: '403', required: '', type: '', desc: '密码错误' },
              { name: '404', required: '', type: '', desc: '系统中找不到该账号，或该账号没有配置 Refresh Token' },
              { name: '500', required: '', type: '', desc: 'OAuth/IMAP/API 异常' },
            ]} />
          </Section>

          <Section id="api-common" title="通用说明">
            <ul style={{ color: '#cbd5e1', lineHeight: 2.2, paddingLeft: '1.5rem' }}>
              <li>单文件夹模式下，每封邮件直接返回完整 <Code>html</Code> + <Code>text</Code> 正文，无需分两步请求</li>
              <li>每页最多返回 <strong>5</strong> 封，通过 <Code>page</Code> 参数翻页（页码从1开始）</li>
              <li>响应中附带 <Code>pagination</Code> 信息：<Code>total</Code>(总数)、<Code>totalPages</Code>(总页数)</li>
              <li><Code>folder: "all"</Code> 模式为多文件夹摘要列表，不返回正文内容</li>
              <li>邮件 HTML 内容经过 XSS 清洗（移除 script/iframe/object/embed 等标签）</li>
              <li>Microsoft 邮箱通过 IMAP + XOAUTH2 协议拉取，Google 邮箱通过 Gmail REST API</li>
              <li>OAuth Token 自动缓存 <strong>8 分钟</strong>，减少重复认证请求</li>
            </ul>
          </Section>
        </div>
      )}

      <footer style={{ textAlign: 'center', marginTop: '2rem', color: '#4a5568', fontSize: '0.8rem' }}>
        RT Mail Helper API Documentation
      </footer>
    </main>
  );
}
