import { describe, expect, it } from 'vitest';
import { ITEMS } from '../items/item-catalog';
import { CRAFT_SKILLS, CRAFT_TOOLS, RECIPES, recipeByKey, recipesOf } from './crafting';
import { VENDORS } from './vendors';

describe('oficios', () => {
  it('cada oficio tiene herramienta y recetas', () => {
    for (const skill of CRAFT_SKILLS) {
      expect(ITEMS[CRAFT_TOOLS[skill]].crafts).toBe(skill);
      expect(recipesOf(skill).length).toBeGreaterThan(0);
    }
  });

  it('las claves de receta no se repiten', () => {
    expect(new Set(RECIPES.map((r) => r.key)).size).toBe(RECIPES.length);
  });

  it('los pergaminos llevan pergamino en blanco, reactivos y maná', () => {
    const recipe = recipeByKey('scroll-fireball');
    expect(recipe?.skill).toBe('inscription');
    expect(recipe?.materials.map((m) => m.kind)).toEqual(['blank-scroll', 'black-pearl']);
    expect(recipe?.mana).toBe(9);
  });

  it('las herramientas de cada oficio se consiguen en alguna tienda o fabricándolas', () => {
    const sold = new Set(Object.values(VENDORS).flatMap((v) => v.sells.map((o) => o.kind)));
    const made = new Set(RECIPES.map((r) => r.result));
    for (const tool of Object.values(CRAFT_TOOLS)) {
      expect(sold.has(tool) || made.has(tool)).toBe(true);
    }
  });

  it('no se compra más barato de lo que se vende', () => {
    for (const vendor of Object.values(VENDORS)) {
      for (const offer of vendor.buys) {
        const sale = vendor.sells.find((o) => o.kind === offer.kind);
        if (sale) expect(sale.price).toBeGreaterThan(offer.price);
      }
    }
  });
});
