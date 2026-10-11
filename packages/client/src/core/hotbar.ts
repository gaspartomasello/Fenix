import {
  ITEMS,
  SKILL_NAMES,
  SPELLS,
  isActiveSkill,
  isItemKind,
  isSpellKey,
  type BackpackItemSnapshot,
  type ActiveSkill,
  type ItemKind,
  type SpellKey,
} from '@fenix/shared';

/**
 * Barra de atajos: casilleros con un objeto (por tipo: "vendas", "poción de
 * curación") o un hechizo. Un objeto se busca en la mochila al usarlo, así el
 * atajo sigue sirviendo aunque la pila cambie. Es estado del jugador en este
 * navegador; no hay reglas de juego acá (el servidor decide todo).
 */
export type HotbarSlot =
  | { readonly type: 'item'; readonly kind: ItemKind }
  | { readonly type: 'spell'; readonly spell: SpellKey }
  | { readonly type: 'skill'; readonly skill: ActiveSkill }
  | null;

/** Diez casilleros: teclas 1 a 9 y 0. */
export const HOTBAR_SIZE = 10;

/** Para empezar: curarse y pelear sin abrir ninguna ventana. */
export function defaultHotbar(): HotbarSlot[] {
  const slots: HotbarSlot[] = [
    { type: 'item', kind: 'bandage' },
    { type: 'item', kind: 'healing-potion' },
    { type: 'item', kind: 'cure-potion' },
    { type: 'item', kind: 'refresh-potion' },
    { type: 'spell', spell: 'heal' },
    { type: 'spell', spell: 'magic-arrow' },
    { type: 'spell', spell: 'cure' },
    { type: 'skill', skill: 'hiding' },
  ];
  return [...slots, ...Array<HotbarSlot>(HOTBAR_SIZE - slots.length).fill(null)];
}

/** Cuatro atajos alrededor del botón de atacar (celular). */
export const ATTACK_RING_SIZE = 4;

/** Para empezar, alrededor de Atacar: curarse fuerte y pegar con magia. */
export function defaultAttackRing(): HotbarSlot[] {
  return [
    { type: 'item', kind: 'bandage' },
    { type: 'spell', spell: 'greater-heal' },
    { type: 'spell', spell: 'lightning' },
    { type: 'spell', spell: 'explosion' },
  ];
}

/**
 * Lo guardado en el navegador → casilleros válidos (lo que no se entiende
 * queda vacío). Sin nada guardado, los de `defaults`.
 */
export function parseHotbar(
  raw: string | null,
  size = HOTBAR_SIZE,
  defaults: () => HotbarSlot[] = defaultHotbar,
): HotbarSlot[] {
  if (!raw) return defaults();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return defaults();
  }
  if (!Array.isArray(value)) return defaults();
  return Array.from({ length: size }, (_, i) => parseSlot(value[i]));
}

function parseSlot(value: unknown): HotbarSlot {
  if (typeof value !== 'object' || value === null) return null;
  const slot = value as { type?: unknown; kind?: unknown; spell?: unknown };
  if (slot.type === 'item' && isItemKind(slot.kind)) return { type: 'item', kind: slot.kind };
  if (slot.type === 'spell' && isSpellKey(slot.spell)) return { type: 'spell', spell: slot.spell };
  const skill = (value as { skill?: unknown }).skill;
  if (slot.type === 'skill' && isActiveSkill(skill)) return { type: 'skill', skill };
  return null;
}

/** Nombre corto para mostrar en el casillero y en la ayuda. */
export function slotLabel(slot: HotbarSlot): string {
  if (!slot) return 'Vacío';
  if (slot.type === 'spell') return SPELLS[slot.spell].name;
  if (slot.type === 'skill') return SKILL_NAMES[slot.skill];
  return capitalize(ITEMS[slot.kind].plural);
}

/** El primer objeto de ese tipo en la mochila (el que se usa al tocar el atajo). */
export function findInBackpack(
  backpack: readonly BackpackItemSnapshot[],
  kind: ItemKind,
): BackpackItemSnapshot | undefined {
  return backpack.find((item) => item.kind === kind);
}

/** Cuántos hay de ese tipo en la mochila (sumando pilas). */
export function countInBackpack(backpack: readonly BackpackItemSnapshot[], kind: ItemKind): number {
  return backpack.reduce((sum, item) => sum + (item.kind === kind ? item.amount : 0), 0);
}

/** Objetos que tiene sentido poner en la barra: los que se usan (beber, vendar, comer…). */
export function isHotbarItem(kind: ItemKind): boolean {
  const use = ITEMS[kind].use;
  return use === 'drink' || use === 'bandage' || use === 'eat' || use === 'scroll';
}

/** Pone algo en el primer casillero libre (o reemplaza el último si están todos ocupados). */
export function addToHotbar(
  slots: readonly HotbarSlot[],
  slot: NonNullable<HotbarSlot>,
): HotbarSlot[] {
  const next = [...slots];
  const already = next.findIndex((s) => sameSlot(s, slot));
  if (already >= 0) return next;
  const free = next.findIndex((s) => s === null);
  next[free >= 0 ? free : next.length - 1] = slot;
  return next;
}

export function sameSlot(a: HotbarSlot, b: HotbarSlot): boolean {
  if (!a || !b) return a === b;
  if (a.type === 'item' && b.type === 'item') return a.kind === b.kind;
  if (a.type === 'spell' && b.type === 'spell') return a.spell === b.spell;
  if (a.type === 'skill' && b.type === 'skill') return a.skill === b.skill;
  return false;
}

/** Tecla de cada casillero: 1 a 9 y 0. */
export function hotbarKey(index: number): string {
  return index === 9 ? '0' : String(index + 1);
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
