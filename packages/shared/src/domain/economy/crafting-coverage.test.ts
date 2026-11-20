import { describe, expect, it } from 'vitest';
import { armorRating, weaponByKind } from '../combat/weapons';
import { BASE_ITEM_KINDS, ITEMS, type BaseItemKind } from '../items/item-catalog';
import { RECIPES } from './crafting';

/** Lo que no se fabrica a propósito: las armaduras de hueso (falta el material) y el libro de hechizos. */
const NOT_CRAFTED: ReadonlySet<BaseItemKind> = new Set<BaseItemKind>([
  'bone-helm',
  'bone-armor',
  'bone-leggings',
  'bone-arms',
  'bone-gloves',
  'tribal-mask',
  'spellbook',
  'red-feather-hat',
  'ramiro-banner',
  // Arma única: únicamente botín raro de dragón.
  'the-redeemer',
  'paladin-fork',
]);

describe('etapa 149: los oficios fabrican todo lo que se puede llevar', () => {
  it('toda arma, armadura, prenda, herramienta, instrumento, recipiente y mueble tiene receta', () => {
    const made = new Set(RECIPES.map((r) => r.result));
    const missing = BASE_ITEM_KINDS.filter((kind) => {
      if (NOT_CRAFTED.has(kind) || made.has(kind)) return false;
      const d = ITEMS[kind];
      const wearable =
        d.slot !== undefined || weaponByKind(kind) !== undefined || armorRating(kind) > 0;
      const useful = ['tool', 'craft', 'dig', 'lockpick', 'music', 'container', 'dye', 'furniture'];
      return (wearable || useful.includes(d.use)) && !d.fixed;
    });
    expect(missing).toEqual([]);
  });

  it('cada receta es de un oficio y pide algo', () => {
    for (const recipe of RECIPES) {
      expect(recipe.materials.length).toBeGreaterThan(0);
      expect(recipe.minSkill).toBeGreaterThanOrEqual(0);
      expect(recipe.minSkill).toBeLessThanOrEqual(1000);
    }
  });
});
