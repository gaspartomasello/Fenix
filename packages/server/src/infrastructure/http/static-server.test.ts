import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpServer } from './static-server';

describe('createHttpServer', () => {
  let base: string;
  let dir: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fenix-static-'));
    await mkdir(join(dir, 'public'));
    await writeFile(join(dir, 'public', 'index.html'), '<h1>Fenix</h1>');
    await writeFile(join(dir, 'secreto.txt'), 'no');
    const server = createHttpServer(join(dir, 'public'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((resolve) => server.close(() => resolve()));
  });

  afterAll(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  it('sirve el index y el endpoint de salud', async () => {
    const index = await fetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(await index.text()).toBe('<h1>Fenix</h1>');
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ status: 'ok' });
  });

  it('no permite salir de la carpeta pública', async () => {
    const response = await fetch(`${base}/%2e%2e/secreto.txt`);
    expect(response.status).toBe(404);
  });
});
