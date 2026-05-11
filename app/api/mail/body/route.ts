import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';
import { type AccountRecord, getMailDetail, normalizeFolder } from '@/lib/mail';

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const folder = normalizeFolder(searchParams.get('folder'));

    if (!id) {
      return NextResponse.json({ error: '缺少邮件 ID' }, { status: 400 });
    }

    if (!folder) {
      return NextResponse.json({ error: 'folder 仅支持 inbox 或 trash' }, { status: 400 });
    }

    const user = db.prepare('SELECT * FROM accounts WHERE id = ?').get(session.id) as AccountRecord | undefined;
    if (!user || !user.rt) {
      return NextResponse.json({ error: '找不到该账号的刷新令牌' }, { status: 404 });
    }

    const detail = await getMailDetail(user, folder, id);
    return NextResponse.json({ success: true, data: detail });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return NextResponse.json({ error: message || '服务器内部错误', details: message }, { status: 500 });
  }
}
