import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema as s } from '@/db';
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const id = Number(form.get('id')); const action = String(form.get('action'));
  if (!Number.isInteger(id) || !['resolved', 'dismissed', 'open'].includes(action)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  await db.update(s.reviewQueue).set({ status: action as 'resolved' | 'dismissed' | 'open', resolvedAt: action === 'open' ? null : new Date() }).where(eq(s.reviewQueue.id, id));
  return NextResponse.redirect(new URL('/review', req.url), 303);
}
