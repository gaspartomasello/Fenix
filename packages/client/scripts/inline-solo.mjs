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

// La misma etiqueta de pantalla que index.html: sin ella el celular arma la
// página a 980 px de ancho y queda alejada (o acercada al girarlo).
const viewport = html.match(/<meta\s+name="viewport"[^>]*>/s)?.[0];
if (!viewport) throw new Error('No se encontró la etiqueta viewport en index.html');

// Las etiquetas que hacen de la página una aplicación al agregarla a la
// pantalla de inicio (sin barras del navegador, con su ícono): las mismas de
// index.html, más el manifiesto y el ícono, que se publican al lado.
const appMeta = [
  ...html.matchAll(
    /<meta\s+name="(?:mobile-web-app-capable|apple-mobile-web-app-[a-z-]+|theme-color)"[^>]*>/gs,
  ),
]
  .map((m) => m[0].replace(/\s+/g, ' '))
  .join('\n');

const page = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Fenix</title>
<meta name="description" content="Fenix — MMORPG web, modo solo" />
${viewport.replace(/\s+/g, ' ')}
${appMeta}
<link rel="manifest" href="manifest.webmanifest" />
<link rel="apple-touch-icon" href="icons/fenix-180.png" />
<link rel="icon" href="favicon.svg" type="image/svg+xml" />
<style>
${style}
</style>
</head>
<body>
<div id="game"></div>
<div id="ui"></div>
<script type="module">
${script}
</script>
</body>
</html>
`;

const out = join(dist, 'fenix.html');
await writeFile(out, page);
console.info(`[solo] ${out} (${(Buffer.byteLength(page) / 1024).toFixed(0)} KB)`);
