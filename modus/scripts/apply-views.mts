import { config } from 'dotenv'; config({ path: '.env.local' });
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const text = readFileSync(join(process.cwd(), 'src/db/sql/views.sql'), 'utf8');
await sql.unsafe(text);
console.log('views applied');
await sql.end();
