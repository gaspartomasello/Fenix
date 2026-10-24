import {
  arcs,
  aura,
  burst,
  dust,
  explosion,
  fireColumn,
  flash,
  ground,
  meteors,
  mindWaves,
  nova,
  portal,
  projectile,
  shell,
  skyBolt,
  spiral,
  stream,
  vortex,
  type FxContext,
} from './painters';
import type { Layer, SpellFx } from './recipes';

/** Dibuja un momento (`c.t`) de un efecto: cada capa en su parte del tiempo. */
export function paintFx(fx: SpellFx, c: FxContext): void {
  for (const layer of fx.layers) {
    const [start, end] = layer.span ?? [0, 1];
    if (c.t < start || c.t >= end) continue;
    paintLayer(layer, { ...c, t: (c.t - start) / (end - start) });
  }
}

function paintLayer(layer: Layer, c: FxContext): void {
  switch (layer.kind) {
    case 'projectile':
      projectile(c, layer.spec);
      break;
    case 'burst':
      burst(c, layer.at === 'feet' ? c.feet : c.to, c.t, layer.spec, 11);
      break;
    case 'aura':
      aura(c, layer.spec);
      break;
    case 'ground':
      ground(c, layer.spec);
      break;
    case 'shell':
      shell(c, layer.spec);
      break;
    case 'spiral':
      spiral(c, layer.colors, layer.turns, layer.radius, layer.strands);
      break;
    case 'stream':
      stream(c, layer.color, layer.glow, layer.count);
      break;
    case 'sky-bolt':
      skyBolt(c, layer.spec);
      break;
    case 'arcs':
      arcs(c, layer.spec);
      break;
    case 'fire-column':
      fireColumn(c, layer.width, layer.height);
      break;
    case 'explosion':
      explosion(c, c.to, layer.size, c.t);
      break;
    case 'meteors':
      meteors(c, layer.count, layer.size);
      break;
    case 'portal':
      portal(c, layer.color, layer.glow, layer.height);
      break;
    case 'vortex':
      vortex(c, layer.colors, layer.radius, layer.height);
      break;
    case 'dust':
      dust(c, layer.color, layer.count, layer.spread);
      break;
    case 'flash':
      flash(c, layer.color, layer.radius);
      break;
    case 'nova':
      nova(c, layer.color, layer.glow, layer.rays, layer.reach);
      break;
    case 'mind-waves':
      mindWaves(c, layer.color);
      break;
  }
}
