/**
 * El mundo del modo solo ya armado, publicado al lado de la página
 * (`mundo.bin`, comprimido con gzip): bajarlo y leerlo tarda un par de
 * segundos, contra el minuto que puede tardar un celular en generarlo.
 * Devuelve null si no está (al abrir la página como archivo suelto, o sin
 * conexión): entonces el juego lo genera como antes.
 */
export async function downloadWorld(): Promise<Uint8Array | null> {
  if (window.location.protocol === 'file:' || typeof DecompressionStream === 'undefined')
    return null;
  try {
    const response = await fetch('mundo.bin', { cache: 'no-cache' });
    if (!response.ok || !response.body) return null;
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}
