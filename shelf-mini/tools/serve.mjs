// Minimal static server for local use. No dependencies.
//   node tools/serve.mjs            -> http://localhost:8000
//   PORT=5000 node tools/serve.mjs  -> http://localhost:5000
// HOST=0.0.0.0 makes it reachable from a phone on the same Wi-Fi.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8000;
const host = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

export function startServer({ port: listenPort = port, host: listenHost = host } = {}) {
  const server = createServer(async (request, response) => {
    try {
      const { pathname } = new URL(request.url, 'http://localhost');
      const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
      const file = join(root, relative.endsWith(sep) || relative === '' ? join(relative, 'index.html') : relative);
      if (!file.startsWith(root)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });
  return new Promise((resolve) => server.listen(listenPort, listenHost, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  const { port: actual } = server.address();
  console.log(`Shelf Mini is running at http://${host === '0.0.0.0' ? 'localhost' : host}:${actual}`);
}
