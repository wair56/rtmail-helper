import { ImapFlow } from 'imapflow';

// IMAP 服务器配置映射
const IMAP_SERVERS: Record<string, { host: string; port: number }> = {
  'hotmail.com': { host: 'outlook.office365.com', port: 993 },
  'outlook.com': { host: 'outlook.office365.com', port: 993 },
  'live.com': { host: 'outlook.office365.com', port: 993 },
  'msn.com': { host: 'outlook.office365.com', port: 993 },
  'gmail.com': { host: 'imap.gmail.com', port: 993 },
  'yahoo.com': { host: 'imap.mail.yahoo.com', port: 993 },
};

function getImapServer(email: string) {
  const domain = email.split('@')[1]?.toLowerCase();
  return IMAP_SERVERS[domain] || { host: 'outlook.office365.com', port: 993 };
}

export async function POST(req: Request) {
  try {
    const { provider, email, refreshToken, customClientId, customClientSecret } = await req.json();

    if (!provider || !email || !refreshToken) {
      return new Response(JSON.stringify({ error: '缺少必要字段: email 或 refreshToken' }), { status: 400 });
    }

    // 自动清理前缀
    let cleanToken = (refreshToken || '').trim();
    if (cleanToken.startsWith('rt_')) cleanToken = cleanToken.substring(3);

    // ===== RT 模式: 通过 OAuth API / IMAP XOAUTH2 =====
    if (provider === 'microsoft') {
      const clientId = customClientId || 'dbc8e03a-b00c-46bd-ae65-b683e7707cb0';
      const tokenParams = new URLSearchParams({
        client_id: clientId,
        refresh_token: cleanToken,
        grant_type: 'refresh_token',
      });
      if (customClientSecret) tokenParams.append('client_secret', customClientSecret);

      // 使用 login.live.com 来兼容所有早期 OAuth2 或不带作用域的令牌提取
      const tokenRes = await fetch('https://login.live.com/oauth20_token.srf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        return new Response(JSON.stringify({ error: '通过 RT 刷新令牌失败 (Failed via RT)', details: tokenData }), { status: 401 });
      }

      // 以 IMAP XOAUTH2 模式拉取邮件，避开 Graph API 的风控和 Scope 限制
      const server = getImapServer(email);
      const client = new ImapFlow({
        host: server.host,
        port: server.port,
        secure: true,
        auth: {
          user: email,
          accessToken: tokenData.access_token,
        },
        logger: false,
      });

      try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        const formattedMails: any[] = [];
        try {
          const totalMessages = (client.mailbox as any)?.exists || 0;
          if (totalMessages > 0) {
            const startSeq = Math.max(1, totalMessages - 4);
            for await (const message of client.fetch(`${startSeq}:*`, { envelope: true } as any)) {
              const env = message.envelope;
              formattedMails.push({
                id: message.uid?.toString() || message.seq?.toString(),
                subject: env?.subject || '(无主题 / No Subject)',
                senderName: env?.from?.[0]?.name || '',
                senderEmail: env?.from?.[0]?.address || '',
                preview: env?.subject || '暂无预览',
                date: env?.date?.toISOString() || new Date().toISOString(),
              });
            }
          }
        } finally {
          lock.release();
        }
        await client.logout();
        formattedMails.reverse();
        return new Response(JSON.stringify({ success: true, data: formattedMails }), { status: 200 });
      } catch (imapErr: any) {
        try { await client.logout(); } catch {}
        return new Response(JSON.stringify({ 
          error: 'IMAP XOAUTH2 登录失败 (IMAP XOAUTH2 login failed)', 
          details: { message: imapErr.message, code: imapErr.code }
        }), { status: 401 });
      }

    } else if (provider === 'google') {
      const clientId = customClientId || '228293309116.apps.googleusercontent.com';
      const tokenParams = new URLSearchParams({
        client_id: clientId,
        refresh_token: cleanToken,
        grant_type: 'refresh_token',
      });
      if (customClientSecret) tokenParams.append('client_secret', customClientSecret);

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        return new Response(JSON.stringify({ error: '从谷歌获取令牌失败', details: tokenData }), { status: 401 });
      }

      const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      });
      const listData = await listRes.json();
      if (!listRes.ok) {
        return new Response(JSON.stringify({ error: '获取 Gmail 列表失败', details: listData }), { status: 500 });
      }

      const messages = listData.messages || [];
      const formattedMails = [];
      for (const msg of messages) {
        const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
        });
        const detailData = await detailRes.json();
        if (detailRes.ok) {
          const headers = detailData.payload?.headers || [];
          const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '(无主题)';
          const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
          const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';
          let senderName = '', senderEmail = from;
          const m = from.match(/^(.*?)\s*<(.+)>$/);
          if (m) { senderName = m[1].replace(/"/g, '').trim(); senderEmail = m[2]; }
          formattedMails.push({ id: detailData.id, subject, senderName, senderEmail, preview: detailData.snippet || '', date: new Date(date).toISOString() });
        }
      }
      return new Response(JSON.stringify({ success: true, data: formattedMails }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: '不支持的 provider (Unsupported provider)' }), { status: 400 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误 (Internal Server Error)', details: error.message }), { status: 500 });
  }
}
