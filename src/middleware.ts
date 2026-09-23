import { NextResponse, type NextRequest } from 'next/server';
import { unsealData } from 'iron-session';
import { SESSION_COOKIE, type SessionData } from '@/lib/session';

const PUBLIC_PATHS = ['/login', '/api/cron/'];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let loggedIn = false;
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  if (cookie && secret && secret.length >= 32) {
    try {
      const data = await unsealData<SessionData>(cookie, { password: secret });
      loggedIn = Boolean(data.loggedIn);
    } catch {
      loggedIn = false;
    }
  }
  if (loggedIn) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Требуется вход в систему' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (pathname !== '/') url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Всё, кроме статики Next.js и публичных файлов
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|fonts/|robots.txt).*)'],
};
