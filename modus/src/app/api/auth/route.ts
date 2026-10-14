import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, passwordMatches, sessionToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const pw = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '/');
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  if (!process.env.APP_PASSWORD || !passwordMatches(pw)) {
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(safeNext)}`, req.url), 303);
  }
  const res = NextResponse.redirect(new URL(safeNext, req.url), 303);
  res.cookies.set(COOKIE, await sessionToken(), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 90 });
  return res;
}
export async function DELETE(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
