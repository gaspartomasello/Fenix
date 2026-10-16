import { generateDungeon } from '../server/src/infrastructure/content/dungeon-map';
const d = generateDungeon({ width: 60, height: 60, seed: Number(process.argv[2] ?? 2004) });
const g = Array.from({ length: d.height }, (_, y) => Array.from({ length: d.width }, (_, x) => (d.terrain[y * d.width + x] === 6) ? '.' : ' '));
const sym: Record<string, string> = { 'cave-wall': '#', brazier: 'B', stalagmite: 'A', bones: ',', ladder: 'L' };
for (const s of d.statics) { const row = g[s.y]; if (row) row[s.x] = sym[s.kind] ?? (s.kind.includes('door') ? (s.kind.endsWith('-l') ? '[' : ']') : '?'); }
console.log(g.map((r) => r.join('')).join('\n'));
