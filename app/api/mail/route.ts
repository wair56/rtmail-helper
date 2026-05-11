import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  type AccountRecord,
  getMailDetail,
  listMail,
  listMailByFolders,
  normalizeFolder,
  normalizeFolderSet,
} from '@/lib/mail';

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = db.prepare('SELECT * FROM accounts WHERE id = ?').get(session.id) as AccountRecord | undefined;
    if (!user || !user.rt) {
      return NextResponse.json({ error: '找不到该账号的刷新令牌' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const folderParam = searchParams.get('folder');
    const folderSet = normalizeFolderSet(folderParam);
    const folder = normalizeFolder(folderParam);
    const id = searchParams.get('id')?.trim();

    if (!folderSet) {
      return NextResponse.json({ error: 'folder 不能为空' }, { status: 400 });
    }

    if (id) {
      if (!folder) {
        return NextResponse.json({ error: '获取邮件详情时必须指定具体 folder' }, { status: 400 });
      }

      const detail = await getMailDetail(user, folder, id);
      return NextResponse.json({ success: true, data: detail, userEmail: user.email, provider: user.provider });
    }

    if (folderSet.mode === 'all') {
      const folders = await listMailByFolders(user, 'all');
      return NextResponse.json({
        success: true,
        mode: 'all',
        folders,
        userEmail: user.email,
        provider: user.provider,
      });
    }

    if (!folder) {
      return NextResponse.json({ error: 'folder 不能为空' }, { status: 400 });
    }

    const mails = await listMail(user, folder);
    return NextResponse.json({ success: true, data: mails, userEmail: user.email, provider: user.provider });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return NextResponse.json({ error: message || '服务器内部错误', details: message }, { status: 500 });
  }
}
