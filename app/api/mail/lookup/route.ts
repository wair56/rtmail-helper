import { NextResponse } from 'next/server';
import db from '@/lib/db';
import {
  type AccountRecord,
  listMailPage,
  listMailByFolders,
  normalizeFolder,
  normalizeFolderSet,
} from '@/lib/mail';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, folder, page } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json({ error: '缺少邮箱或密码' }, { status: 400 });
    }

    // Look up account from DB by email
    const user = db
      .prepare('SELECT * FROM accounts WHERE LOWER(email) = ?')
      .get((email as string).trim().toLowerCase()) as (AccountRecord & { password?: string }) | undefined;

    if (!user) {
      return NextResponse.json({ error: '找不到该账号' }, { status: 404 });
    }

    // Verify password
    if (user.password !== (password as string).trim()) {
      return NextResponse.json({ error: '密码错误' }, { status: 403 });
    }

    if (!user.rt) {
      return NextResponse.json({ error: '该账号未配置刷新令牌' }, { status: 404 });
    }

    // Folder normalization
    const folderParam = typeof folder === 'string' ? folder : null;
    const folderSet = normalizeFolderSet(folderParam);
    const normalizedFolder = normalizeFolder(folderParam);

    if (!folderSet) {
      return NextResponse.json({ error: 'folder 不能为空' }, { status: 400 });
    }

    // All folders mode (keeps original behavior)
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

    // Single folder → paginated detail mode
    if (!normalizedFolder) {
      return NextResponse.json({ error: 'folder 不能为空' }, { status: 400 });
    }

    const pageNum = typeof page === 'number' && page > 0 ? page : 1;
    const result = await listMailPage(user, normalizedFolder, pageNum);
    return NextResponse.json({
      success: true,
      data: result.mails,
      pagination: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
      userEmail: user.email,
      provider: user.provider,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return NextResponse.json({ error: message || '服务器内部错误', details: message }, { status: 500 });
  }
}
