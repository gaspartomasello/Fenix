/**
 * Genera el mundo del modo solo una vez, al compilar, y lo deja comprimido al
 * lado de la página (dist-solo/mundo.bin). Así el navegador no tiene que
 * armarlo: lo descarga y lo lee en un par de segundos.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  encodeWorldFile,
  packBlueprint,
  planSoloWorld,
  soloWorldKey,
} from '@fenix/server/embedded';

const started = Date.now();
const bytes = encodeWorldFile(packBlueprint(planSoloWorld()), soloWorldKey());
const zipped = gzipSync(bytes, { level: 9 });
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-solo', 'mundo.bin');
await writeFile(out, zipped);
console.info(
  `[solo] ${out} (${(zipped.length / 1024).toFixed(0)} KB, armado en ${((Date.now() - started) / 1000).toFixed(1)} s)`,
);
