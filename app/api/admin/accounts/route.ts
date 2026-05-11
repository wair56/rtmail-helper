import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';
import { buildAccountPaginationMeta, parseAccountPagination } from '@/lib/adminAccounts';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  if (searchParams.get('all') === '1') {
    const accounts = db.prepare('SELECT id, email, password, client_id, rt, provider, role, created_at, updated_at, last_login_at FROM accounts ORDER BY id DESC').all();
    return NextResponse.json({ success: true, data: accounts });
  }

  const pagination = parseAccountPagination(searchParams);
  const total = db.prepare('SELECT COUNT(*) as total FROM accounts').get() as { total: number };
  const accounts = db.prepare(`
    SELECT id, email, password, client_id, rt, provider, role, created_at, updated_at, last_login_at
    FROM accounts
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(pagination.pageSize, pagination.offset);

  return NextResponse.json({
    success: true,
    data: accounts,
    pagination: buildAccountPaginationMeta(total.total, pagination.page, pagination.pageSize),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const { rawData } = await req.json();
    if (!rawData) {
      return NextResponse.json({ error: '数据为空' }, { status: 400 });
    }

    const lines = rawData.split('\n').map((l: string) => l.trim()).filter(Boolean);
    let imported = 0;
    let failed = 0;

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO accounts (email, password, client_id, rt, provider)
      VALUES (?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const line of lines) {
        const parts = line.split('----').map((p: string) => p.trim());
        if (parts.length >= 2) {
          const email = parts[0];
          const password = parts[1];
          const clientId = parts[2] || '';
          const rt = parts[3] || '';
          
          let provider = 'microsoft';
          if (email.endsWith('@gmail.com')) {
            provider = 'google';
          }

          try {
            insertStmt.run(email, password, clientId, rt, provider);
            imported++;
          } catch (err) {
            failed++;
          }
        } else {
          failed++;
        }
      }
    })();

    return NextResponse.json({ success: true, imported, failed });
  } catch (error: any) {
    return NextResponse.json({ error: '内部服务器错误', details: error.message }, { status: 500 });
  }
}
