import { drawCharacterFrame, drawMountFrame } from '@fenix/art';
import { DEFAULT_APPEARANCE, Direction, type MountKind } from '@fenix/shared';
import { writeFileSync } from 'node:fs';
const out: { w: number; h: number; d: number[] }[][] = [];
const push = (row: { w: number; h: number; d: number[] }[], i: { width: number; height: number; data: Uint8ClampedArray | number[] }) => row.push({ w: i.width, h: i.height, d: Array.from(i.data) });
const kinds: MountKind[] = ['horse-chestnut', 'horse-black', 'horse-gray', 'horse-pinto', 'llama', 'runner'];
// Fila por especie: de costado (NE), de frente-costado (E), de frente (SE), de espaldas (NW); idle
for (const k of kinds) { const row: never[] = []; for (const d of [Direction.NorthEast, Direction.East, Direction.SouthEast, Direction.SouthWest, Direction.NorthWest]) push(row as never, drawMountFrame(k, d, 'idle')); out.push(row as never); }
// Paso del caballo de costado 0..3 y galope 0..3
{ const row: never[] = []; for (const f of [0, 1, 2, 3] as const) push(row as never, drawMountFrame('horse-chestnut', Direction.NorthEast, f)); out.push(row as never); }
{ const row: never[] = []; for (const f of ['run-0', 'run-1', 'run-2', 'run-3'] as const) push(row as never, drawMountFrame('horse-chestnut', Direction.NorthEast, f)); out.push(row as never); }
// Jinetes
const eq = { torso: 'chainmail', cloak: 'cloak', rightHand: 'broadsword', legs: 'trousers', feet: 'boots' } as never;
{ const row: never[] = []; for (const d of [Direction.NorthEast, Direction.East, Direction.SouthEast, Direction.SouthWest, Direction.NorthWest]) push(row as never, drawCharacterFrame(DEFAULT_APPEARANCE, d, 'idle', eq, null, 'horse-black')); out.push(row as never); }
{ const row: never[] = []; for (const f of ['run-0', 'run-1', 'run-2', 'run-3', 'slash-1'] as const) push(row as never, drawCharacterFrame(DEFAULT_APPEARANCE, Direction.East, f, eq, null, 'horse-gray')); out.push(row as never); }
{ const row: never[] = []; for (const k of ['llama', 'runner', 'horse-pinto'] as MountKind[]) push(row as never, drawCharacterFrame({ ...DEFAULT_APPEARANCE, gender: 'female' }, Direction.East, 1, { torso: 'robe' } as never, null, k)); out.push(row as never); }
writeFileSync(process.env.OUT!, JSON.stringify(out));
