import { NextResponse } from 'next/server';
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
    const { email, rt, provider, client_id, folder, page } = body;

    // Validate required fields
    if (!email || !rt || !provider) {
      return NextResponse.json({ error: '缺少邮箱、刷新令牌或提供商' }, { status: 400 });
    }

    if (provider !== 'google' && provider !== 'microsoft') {
      return NextResponse.json({ error: '不支持的提供商，仅支持 google 或 microsoft' }, { status: 400 });
    }

    // Construct AccountRecord
    const user: AccountRecord = {
      email: (email as string).trim().toLowerCase(),
      rt: (rt as string).trim(),
      provider: provider as string,
      client_id: typeof client_id === 'string' ? client_id.trim() || undefined : undefined,
    };

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
