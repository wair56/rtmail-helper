import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { setSessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: '请提供邮箱和密码' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM accounts WHERE LOWER(email) = ?').get(cleanEmail) as any;

    if (!user || user.password !== password) {
      console.log(`[Login Failed] Email: ${cleanEmail}`);
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    // 更新最后登录时间
    db.prepare('UPDATE accounts SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // 设置会话 Cookie
    await setSessionCookie({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({ success: true, role: user.role });
  } catch (error: any) {
    return NextResponse.json({ error: '内部服务器错误', details: error.message }, { status: 500 });
  }
}
