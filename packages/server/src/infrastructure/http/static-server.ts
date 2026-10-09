import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Servidor HTTP que entrega el cliente compilado y un endpoint de salud.
 * Si `staticDir` es null (modo desarrollo) solo responde /health: el cliente
 * lo sirve Vite.
 */
export function createHttpServer(staticDir: string | null): Server {
  const root = staticDir ? resolve(staticDir) : null;

  return createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      console.error('[http] error:', error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (!root || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404);
      res.end();
      return;
    }

    const file = await resolveFile(root, decodeURIComponent(url.pathname));
    if (!file) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': file.includes(`${sep}assets${sep}`)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  }
}

/** Resuelve la ruta pedida dentro de `root`, sin permitir salir de ella. */
async function resolveFile(root: string, pathname: string): Promise<string | null> {
  const candidate = normalize(join(root, pathname));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;

  for (const path of [candidate, join(candidate, 'index.html')]) {
    try {
      if ((await stat(path)).isFile()) return path;
    } catch {
      // Sigue con la siguiente opción.
    }
  }
  return null;
}
