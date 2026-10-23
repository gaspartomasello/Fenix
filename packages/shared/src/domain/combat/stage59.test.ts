import { describe, expect, it } from 'vitest';
import { RECIPES } from '../economy/crafting';
import { VENDORS } from '../economy/vendors';
import { ITEMS } from '../items/item-catalog';
import type { ItemKind } from '../items/item-catalog';
import { armorOf, weaponByKind, wearsMetalArmor } from './weapons';

const PLATE = {
  head: 'plate-helm',
  neck: 'plate-gorget',
  torso: 'plate-chest',
  arms: 'plate-arms',
  hands: 'plate-gloves',
  legs: 'plate-legs',
} as const;

const SETS = {
  samurái: {
    head: 'samurai-kabuto',
    neck: 'samurai-mempo',
    torso: 'samurai-do',
    arms: 'samurai-sode',
    legs: 'samurai-haidate',
    feet: 'samurai-suneate',
  },
  legionario: {
    head: 'legion-helm',
    torso: 'legion-cuirass',
    arms: 'legion-arms',
    legs: 'legion-greaves',
  },
  templario: {
    head: 'templar-helm',
    torso: 'templar-hauberk',
    arms: 'templar-sleeves',
    hands: 'templar-gauntlets',
    legs: 'templar-chausses',
  },
} as const;

describe('etapa 59: mangual, escudos grandes y armaduras samurái, legionaria y templaria', () => {
  it('cada juego protege casi lo mismo que el juego completo de placas', () => {
    const plate = armorOf(PLATE);
    for (const look of Object.values(SETS)) {
      const total = armorOf(look);
      expect(total).toBeGreaterThanOrEqual(plate - 4);
      expect(total).toBeLessThanOrEqual(plate);
      expect(wearsMetalArmor(look)).toBe(true);
    }
  });

  it('cada pieza va en su lugar del cuerpo, se forja en la herrería y la vende el herrero', () => {
    const pieces: ItemKind[] = [
      ...Object.values(SETS).flatMap((set) => Object.values(set) as ItemKind[]),
      'legion-shield',
      'templar-shield',
      'flail',
    ];
    for (const kind of pieces) {
      expect(RECIPES.some((r) => r.result === kind && r.skill === 'blacksmithy')).toBe(true);
      expect(VENDORS.blacksmith.sells.some((o) => o.kind === kind)).toBe(true);
    }
    for (const [slot, kind] of Object.entries(SETS.samurái))
      expect(ITEMS[kind as ItemKind].slot).toBe(slot);
    expect(ITEMS['legion-shield'].slot).toBe('leftHand');
  });

  it('el mangual es un arma de maza', () => {
    expect(weaponByKind('flail')?.skill).toBe('mace-fighting');
  });
});
