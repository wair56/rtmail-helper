export async function POST(req: Request) {
  try {
    const { provider, email, password, refreshToken, authMode, customClientId, customClientSecret } = await req.json();

    if (!provider || !email) {
      return new Response(JSON.stringify({ error: '缺少必要字段 (Missing required fields)' }), {
        status: 400,
      });
    }

    // 自动清理第三方系统添加的前缀标记 (Strip third-party prefixes)
    let cleanToken = (refreshToken || '').trim();
    if (cleanToken.startsWith('rt_')) {
      cleanToken = cleanToken.substring(3);
    }

    // 决定使用哪种认证方式
    let usePassword = false;
    if (authMode === 'password') {
      usePassword = true;
    } else if (authMode === 'rt') {
      usePassword = false;
    } else {
      // auto 模式：优先密码，如果有密码就用密码
      usePassword = !!password;
    }

    if (provider === 'microsoft') {
      const clientId = customClientId || 'dbc8e03a-b00c-46bd-ae65-b683e7707cb0';
      
      let tokenParams: URLSearchParams;

      if (usePassword && password) {
        // ROPC 密码登录流程
        tokenParams = new URLSearchParams({
          client_id: clientId,
          grant_type: 'password',
          username: email,
          password: password,
          scope: 'https://graph.microsoft.com/Mail.Read offline_access',
        });
      } else if (cleanToken) {
        // Refresh Token 流程
        tokenParams = new URLSearchParams({
          client_id: clientId,
          refresh_token: cleanToken,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/.default offline_access',
        });
      } else {
        return new Response(JSON.stringify({ error: '请提供密码或 Refresh Token (Please provide password or RT)' }), { status: 400 });
      }

      if (customClientSecret) tokenParams.append('client_secret', customClientSecret);

      const tokenRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString(),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        const method = usePassword ? '密码登录' : 'RT刷新';
        return new Response(JSON.stringify({ error: `通过${method}获取令牌失败 (Failed via ${usePassword ? 'ROPC' : 'RT'})`, details: tokenData }), { status: 401 });
      }

      const mailRes = await fetch('https://graph.microsoft.com/v1.0/me/messages?$top=20&$select=sender,subject,bodyPreview,receivedDateTime,body', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      });
      const mailData = await mailRes.json();
      if (!mailRes.ok) {
        return new Response(JSON.stringify({ error: '调用 Graph API 获取邮件失败 (Failed to fetch emails via Graph API)', details: mailData }), { status: 500 });
      }

      const formattedMails = (mailData.value || []).map((m: any) => ({
        id: m.id,
        subject: m.subject || '(无主题 / No Subject)',
        senderName: m.sender?.emailAddress?.name || '',
        senderEmail: m.sender?.emailAddress?.address || '',
        preview: m.bodyPreview || '暂无预览内容 (No preview available.)',
        date: m.receivedDateTime
      }));

      return new Response(JSON.stringify({ success: true, data: formattedMails }), { status: 200 });

    } else if (provider === 'google') {
      const clientId = customClientId || '228293309116.apps.googleusercontent.com';
      const tokenParams = new URLSearchParams({
        client_id: clientId,
        refresh_token: cleanToken,
        grant_type: 'refresh_token',
      });
      if (customClientSecret) {
        tokenParams.append('client_secret', customClientSecret);
      }

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        return new Response(JSON.stringify({ error: '从谷歌获取/刷新令牌失败 (Failed to obtain access token from Google)', details: tokenData }), { status: 401 });
      }

      const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      });
      const listData = await listRes.json();
      if (!listRes.ok) {
        return new Response(JSON.stringify({ error: '获取 Gmail 邮件列表失败 (Failed to list Gmail messages)', details: listData }), { status: 500 });
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
          const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '(无主题 / No Subject)';
          const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
          const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';
          
          let senderName = '';
          let senderEmail = from;
          const fromMatch = from.match(/^(.*?)\s*<(.+)>$/);
          if (fromMatch) {
            senderName = fromMatch[1].replace(/"/g, '').trim();
            senderEmail = fromMatch[2];
          }

          formattedMails.push({
            id: detailData.id,
            subject,
            senderName,
            senderEmail,
            preview: detailData.snippet || '暂无预览内容 (No preview available.)',
            date: new Date(date).toISOString()
          });
        }
      }

      return new Response(JSON.stringify({ success: true, data: formattedMails }), { status: 200 });

    } else {
      return new Response(JSON.stringify({ error: '不支持的服务商 (Unsupported provider)' }), { status: 400 });
    }

  } catch (error: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误 (Internal Server Error)', details: error.message }), {
      status: 500,
    });
  }
}
