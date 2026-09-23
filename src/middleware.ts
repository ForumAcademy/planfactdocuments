import { NextResponse, type NextRequest } from 'next/server';
import { unsealData } from 'iron-session';
import { SESSION_COOKIE, type SessionData } from '@/lib/session';
import { isSessionCurrent } from '@/lib/app-version';

const PUBLIC_PATHS = ['/login', '/api/cron/', '/api/version', '/api/logout'];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let loggedIn = false;
  let outdated = false;
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  if (cookie && secret && secret.length >= 32) {
    try {
      const data = await unsealData<SessionData>(cookie, { password: secret });
      loggedIn = isSessionCurrent(data);
      // Вход был, но на старой версии сайта — сессия завершается
      outdated = Boolean(data.loggedIn) && !loggedIn;
    } catch {
      loggedIn = false;
    }
  }
  if (loggedIn) return NextResponse.next();

  let res: NextResponse;
  if (pathname.startsWith('/api/')) {
    res = NextResponse.json(
      { error: outdated ? 'Сайт обновлён — войдите снова' : 'Требуется вход в систему' },
      { status: 401 },
    );
  } else {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (outdated) url.searchParams.set('reason', 'updated');
    else if (pathname !== '/') url.searchParams.set('next', pathname + search);
    res = NextResponse.redirect(url);
  }
  if (outdated) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  // Всё, кроме статики Next.js и публичных файлов
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|fonts/|robots.txt).*)'],
};
