/**
 * Convierte el build de modo solo en un único HTML autocontenido
 * (dist-solo/fenix.html), con el JS y el CSS incrustados. Sirve para
 * publicarlo como página sin servidor.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-solo');
const html = await readFile(join(dist, 'index.html'), 'utf8');

const scriptSrc = html.match(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/)?.[1];
const styleHref = html.match(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/)?.[1];
if (!scriptSrc) throw new Error('No se encontró el script del build');

const script = (await readFile(join(dist, scriptSrc), 'utf8')).replaceAll('</script', '<\\/script');
const style = styleHref ? await readFile(join(dist, styleHref), 'utf8') : '';

const page = `<title>Fenix</title>
<meta name="description" content="Fenix — MMORPG web, modo solo" />
<style>
${style}
</style>
<div id="game"></div>
<div id="ui"></div>
<script type="module">
${script}
</script>
`;

const out = join(dist, 'fenix.html');
await writeFile(out, page);
console.info(`[solo] ${out} (${(Buffer.byteLength(page) / 1024).toFixed(0)} KB)`);
