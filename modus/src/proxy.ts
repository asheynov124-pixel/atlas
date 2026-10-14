import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, isValidSession } from '@/lib/auth';

const PUBLIC = [/^\/login$/, /^\/api\/auth(\/|$)/, /^\/manifest\.webmanifest$/, /^\/icon\.svg$/, /^\/sw\.js$/, /^\/offline$/];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (await isValidSession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone(); url.pathname = '/login'; url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
