import {
  DEFAULT_APPEARANCE,
  STARTING_BANK_GOLD,
  Terrain,
  TileMap,
  startingKit,
  validateCreation,
  type CharacterCreation,
  type CreationSkills,
} from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import {
  FakeCharacterStore,
  FakeClock,
  FixedRandom,
  RecordingNotifier,
  SequentialIds,
} from '../test-support/fakes';
import { GameApplication } from './game-application';
import type { AccountRecord, AccountStore, PasswordHasher } from './ports';

class MemoryAccountStore implements AccountStore {
  private readonly accounts = new Map<string, AccountRecord>();
  find(name: string): AccountRecord | undefined {
    return this.accounts.get(name.toLowerCase());
  }
  save(account: AccountRecord): void {
    this.accounts.set(account.name.toLowerCase(), account);
  }
}

const plainHasher: PasswordHasher = {
  hash: (password) => `plano:${password}`,
  verify: (password, hash) => hash === `plano:${password}`,
};

function createServer(characters = new FakeCharacterStore(), accounts = new MemoryAccountStore()) {
  const map = new TileMap({
    width: 12,
    height: 12,
    terrain: new Array<Terrain>(144).fill(Terrain.Grass),
  });
  const world = new World(map, { x: 4, y: 4 });
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock: new FakeClock(0),
    ids: new SequentialIds(),
    random: new FixedRandom(0.2),
    notifier: new RecordingNotifier(),
    characters,
    accounts,
    passwords: plainHasher,
  });
  return { app, world, characters, accounts };
}

const creation = (
  name: string,
  skills: CreationSkills = ['magery', 'meditation', 'healing', 'anatomy'],
): CharacterCreation => ({
  name,
  appearance: DEFAULT_APPEARANCE,
  attributes: { strength: 40, dexterity: 30, intelligence: 50 },
  skills,
});

describe('cuentas', () => {
  it('se crea con contraseña y después se entra solo con la correcta', () => {
    const { app } = createServer();
    expect(app.accounts.login('Gaspar', 'secreta1', false).ok).toBe(false);
    const created = app.accounts.login('Gaspar', 'secreta1', true);
    expect(created.ok).toBe(true);
    expect(app.accounts.login('gaspar', 'otra-clave', false)).toEqual({
      ok: false,
      reason: 'Contraseña incorrecta.',
    });
    expect(app.accounts.login('gaspar', 'secreta1', false).ok).toBe(true);
  });

  it('un mago nuevo trae su libro y 150 de cada reactivo, que no se pueden tirar ni vender', () => {
    const { app, world } = createServer();
    const login = app.accounts.login('Gaspar', 'secreta1', true);
    if (!login.ok) throw new Error(login.reason);
    const result = app.accounts.createCharacter(login.account, creation('Merlina'));
    if (!result.ok) throw new Error(result.reason);
    const player = world.get(result.playerId);
    if (!player) throw new Error('sin jugador');

    expect(player.skills.get('magery')).toBe(600);
    expect(player.skills.get('meditation')).toBe(600);
    expect(player.skills.get('healing')).toBe(500);
    expect(player.skills.get('anatomy')).toBe(500);
    // Empieza vestida: camisa del color elegido y pantalón (sin ellos se vería la ropa interior).
    const shirt = world.items.equipmentOf(player.id).find((i) => i.kind === 'shirt');
    expect(shirt?.hue).toBe(DEFAULT_APPEARANCE.clothHue);
    expect(world.items.lookOf(player.id).legs).toBe('trousers');
    expect(player.combat.baseAttributes).toEqual({ strength: 40, dexterity: 30, intelligence: 50 });
    expect(world.items.countInBackpack(player.id, 'black-pearl')).toBe(150);
    expect(world.items.countInBackpack(player.id, 'bandage')).toBe(200);
    expect(world.items.backpackOf(player.id).some((i) => i.kind === 'spellbook')).toBe(true);
    expect(world.items.bankOf(player.id).find((i) => i.kind === 'gold')?.amount).toBe(
      STARTING_BANK_GOLD,
    );

    const book = world.items.backpackOf(player.id).find((i) => i.kind === 'spellbook');
    expect(book?.newbie).toBe(true);
    const drop = world.items.move(
      player,
      book?.id ?? '',
      {
        type: 'ground',
        position: player.position,
      },
      world.map,
    );
    expect(drop.ok).toBe(false);

    // Lo comprado no se mezcla con lo inicial (así no se "bendice").
    const changes = { inventories: new Set<string>() };
    world.items.addToBackpack(
      player.id,
      'black-pearl',
      10,
      () => 'perla-comprada',
      changes as never,
    );
    const pearls = world.items.backpackOf(player.id).filter((i) => i.kind === 'black-pearl');
    expect(pearls.map((p) => [p.amount, p.newbie])).toEqual([
      [150, true],
      [10, false],
    ]);
  });

  it('el guerrero empuña su arma y la cuenta no pasa de cinco personajes', () => {
    const { app, world } = createServer();
    const login = app.accounts.login('Gaspar', 'secreta1', true);
    if (!login.ok) throw new Error(login.reason);
    const first = app.accounts.createCharacter(
      login.account,
      creation('Bruta', ['swordsmanship', 'tactics', 'parrying', 'anatomy']),
    );
    if (!first.ok) throw new Error(first.reason);
    const equipped = world.items.equipmentOf(first.playerId).map((i) => i.kind);
    expect(equipped).toEqual(expect.arrayContaining(['katana', 'leather-armor', 'wooden-shield']));
    app.leave(first.playerId);

    for (const name of ['Bbb', 'Ccc', 'Ddd', 'Eee']) {
      const made = app.accounts.createCharacter(login.account, creation(name));
      if (!made.ok) throw new Error(made.reason);
      app.leave(made.playerId);
    }
    const sixth = app.accounts.createCharacter(login.account, creation('Fff'));
    expect(sixth.ok).toBe(false);
    expect(app.accounts.describe(login.account).characters.map((c) => c.name)).toEqual([
      'Bruta',
      'Bbb',
      'Ccc',
      'Ddd',
      'Eee',
    ]);

    // Al borrar uno queda lugar, y vuelve a entrar con lo que tenía.
    const deleted = app.accounts.deleteCharacter(login.account, 'Eee', false);
    expect(deleted.ok).toBe(true);
    const again = app.accounts.play(login.account, 'Bruta');
    if (!again.ok) throw new Error(again.reason);
    expect(world.items.equipmentOf(again.playerId).some((i) => i.kind === 'katana')).toBe(true);
    expect(app.accounts.createCharacter(login.account, creation('Fff')).ok).toBe(true);
  });

  it('un personaje de antes de las cuentas pasa a la cuenta de su nombre', () => {
    const characters = new FakeCharacterStore();
    const accounts = new MemoryAccountStore();
    const before = createServer(characters, accounts);
    const joined = before.app.join({
      type: 'join',
      name: 'Viejo',
      appearance: DEFAULT_APPEARANCE,
      password: 'secreta1',
    });
    if (!joined.ok) throw new Error(joined.reason);
    before.app.leave(joined.playerId);

    const after = createServer(characters, accounts);
    expect(after.app.accounts.login('Viejo', 'secreta1', true).ok).toBe(true);
    const login = after.app.accounts.login('Viejo', 'secreta1', false);
    if (!login.ok) throw new Error(login.reason);
    expect(login.account.characters).toEqual(['Viejo']);
    expect(after.app.accounts.play(login.account, 'Viejo').ok).toBe(true);
    expect(characters.find('Viejo')?.account).toBe('Viejo');
  });

  it('la creación valida atributos y habilidades', () => {
    expect(validateCreation(creation('Ana')).ok).toBe(true);
    expect(
      validateCreation({
        ...creation('Ana'),
        attributes: { strength: 80, dexterity: 80, intelligence: 10 },
      }).ok,
    ).toBe(false);
    expect(
      validateCreation({ ...creation('Ana'), skills: ['magery', 'magery', 'healing', 'anatomy'] })
        .ok,
    ).toBe(false);
    // Hacen falta cuatro: dos quedan en 60 y dos en 50.
    expect(
      validateCreation({ ...creation('Ana'), skills: ['magery', 'meditation', 'healing'] }).ok,
    ).toBe(false);
    const kit = startingKit(['anatomy', 'healing', 'wrestling']);
    expect(kit.find((k) => k.kind === 'bandage')?.amount).toBe(200);
    expect(kit.filter((k) => k.kind === 'leather-armor')).toHaveLength(1);
  });
});
