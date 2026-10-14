import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import postgres from 'postgres';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

function make() {
  if (/neon\.tech/.test(url!)) return drizzleNeon(neon(url!), { schema });
  const client = postgres(url!, { max: 5, prepare: false });
  return drizzlePg(client, { schema });
}

declare global { var __modusDb: ReturnType<typeof make> | undefined; }
export const db = globalThis.__modusDb ?? make();
if (process.env.NODE_ENV !== 'production') globalThis.__modusDb = db;
export { schema };

import type { SQL } from 'drizzle-orm';
/** Driver-agnostic raw query: postgres.js returns an array, neon-http returns { rows }. */
export async function raw<T = Record<string, unknown>>(q: SQL): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = await (db as any).execute(q);
  return (Array.isArray(r) ? r : r.rows) as T[];
}
