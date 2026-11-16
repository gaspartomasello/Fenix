/**
 * Hacia dónde apunta cada rumbo en la pantalla: el juego está girado como el
 * minimapa (el norte, arriba a la derecha).
 */
export const ARROWS: Readonly<Record<string, string>> = {
  norte: '↗',
  noreste: '→',
  este: '↘',
  sureste: '↓',
  sur: '↙',
  suroeste: '←',
  oeste: '↖',
  noroeste: '↑',
};

/** Un renglón del cartel: el rumbo (si lo dice) y adónde lleva. */
export interface SignLine {
  readonly heading: string | null;
  readonly arrow: string | null;
  readonly text: string;
}

/**
 * Lo que dice un cartel, ordenado: el nombre del cruce (si es una
 * encrucijada) y un renglón por rama. «Desvío al este: Torre Hueca.» queda
 * como un renglón con rumbo; «Camino a Roca Alta» queda tal cual.
 */
export function readSign(text: string): { title: string; lines: SignLine[] } {
  const rows = text
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
  const branch =
    /^(?:Al|al|Desvío al) (norte|noreste|este|sureste|sur|suroeste|oeste|noroeste): (.+?)\.?$/;
  const first = rows[0] ?? '';
  const titled = rows.length > 1 && !branch.test(first);
  const title = titled ? first : first.startsWith('Desvío') ? 'Desvío' : 'Cartel';
  const lines = (titled ? rows.slice(1) : rows).map((row): SignLine => {
    const m = branch.exec(row);
    if (!m) return { heading: null, arrow: null, text: row.replace(/\.$/, '') };
    const heading = m[1] ?? '';
    return { heading: `Al ${heading}`, arrow: ARROWS[heading] ?? null, text: m[2] ?? '' };
  });
  return { title, lines };
}
