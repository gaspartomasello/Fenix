import {
  DEFAULT_APPEARANCE,
  Direction,
  MOVE_DURATION_MS,
  Terrain,
  type ClientMessage,
  type MobileSnapshot,
} from '@fenix/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClientGame, type LogEntry } from './client-game';
import { MAX_PENDING_STEPS } from './movement-predictor';

const G = Terrain.Grass;
const W = Terrain.Water;

function snapshot(id: string, x: number, y: number): MobileSnapshot {
  return {
    id,
    name: id.toUpperCase(),
    position: { x, y },
    direction: Direction.South,
    appearance: DEFAULT_APPEARANCE,
    equipment: {},
    body: id === 'rata' ? 'rat' : 'human',
    health: 1,
    dead: false,
    npc: null,
    notoriety: id === 'rata' ? 'murderer' : 'innocent',
    guildTag: null,
  };
}

describe('ClientGame', () => {
  let now: number;
  let sent: ClientMessage[];
  let game: ClientGame;

  beforeEach(() => {
    now = 1000;
    sent = [];
    game = new ClientGame({ send: (m) => sent.push(m) }, () => now);
    // Mapa 4x1: G G G W
    game.apply({
      type: 'welcome',
      selfId: 'ana',
      map: {
        width: 4,
        height: 1,
        terrain: [G, G, G, W],
        statics: [],
        regions: [{ name: 'Muelle', x: 0, y: 0, width: 2, height: 1 }],
        teleporters: [],
      },
      time: { dayProgress: 0.5, dayLengthMs: 10_000 },
      mobiles: [snapshot('ana', 0, 0), snapshot('bruno', 2, 0)],
    });
  });

  it('extrapola la hora del mundo y sabe en qué zona está', () => {
    now += 2_500;
    expect(game.worldTime()?.dayProgress).toBeCloseTo(0.75);
    expect(game.currentRegion()?.name).toBe('Muelle');
  });

  it('carga el mundo inicial', () => {
    expect(game.self?.name).toBe('ANA');
    expect(game.visibleCount).toBe(2);
  });

  describe('predicción de movimiento', () => {
    it('mueve al jugador al instante y envía el pedido', () => {
      game.requestStep(Direction.East, 'walk');
      expect(game.self?.position).toEqual({ x: 1, y: 0 });
      expect(sent).toEqual([{ type: 'move', direction: Direction.East, mode: 'walk', seq: 1 }]);
    });

    it('respeta la cadencia antes de pedir otro paso', () => {
      game.requestStep(Direction.East, 'walk');
      now += MOVE_DURATION_MS.walk / 2;
      game.requestStep(Direction.East, 'walk');
      expect(sent).toHaveLength(1);
      now += MOVE_DURATION_MS.walk / 2;
      game.requestStep(Direction.East, 'walk');
      expect(sent).toHaveLength(2);
    });

    it('frena si hay demasiados pasos sin confirmar', () => {
      for (let i = 0; i < MAX_PENDING_STEPS + 2; i++) {
        game.requestStep(i % 2 === 0 ? Direction.East : Direction.West, 'run');
        now += MOVE_DURATION_MS.run;
      }
      expect(sent).toHaveLength(MAX_PENDING_STEPS);
    });

    it('vuelve a la posición del servidor si rechaza el paso', () => {
      game.requestStep(Direction.East, 'walk');
      game.apply({
        type: 'moveRejected',
        seq: 1,
        position: { x: 0, y: 0 },
        direction: Direction.East,
      });
      expect(game.self?.position).toEqual({ x: 0, y: 0 });
    });

    it('corrige la posición cuando el último ack no coincide', () => {
      game.requestStep(Direction.East, 'walk');
      game.apply({ type: 'moveAck', seq: 1, position: { x: 2, y: 0 } });
      expect(game.self?.position).toEqual({ x: 2, y: 0 });
    });

    it('contra el agua solo gira', () => {
      game.apply({
        type: 'moveRejected',
        seq: 0,
        position: { x: 2, y: 0 },
        direction: Direction.South,
      });
      game.requestStep(Direction.East, 'walk');
      expect(game.self?.position).toEqual({ x: 2, y: 0 });
      expect(game.self?.direction).toBe(Direction.East);
    });
  });

  describe('otros jugadores', () => {
    it('anima los movimientos de otros jugadores', () => {
      game.apply({
        type: 'mobileMoved',
        id: 'bruno',
        position: { x: 1, y: 0 },
        direction: Direction.West,
        mode: 'walk',
      });
      const bruno = [...game.allEntities()].find((e) => e.id === 'bruno');
      expect(bruno?.position).toEqual({ x: 1, y: 0 });
      now += MOVE_DURATION_MS.walk / 2;
      expect(bruno?.renderPosition(now)).toEqual({ x: 1.5, y: 0 });
    });

    it('ignora ecos de su propio movimiento', () => {
      game.apply({
        type: 'mobileMoved',
        id: 'ana',
        position: { x: 3, y: 0 },
        direction: Direction.East,
        mode: 'walk',
      });
      expect(game.self?.position).toEqual({ x: 0, y: 0 });
    });

    it('agrega y quita jugadores avisando con eventos', () => {
      const added: string[] = [];
      const removed: string[] = [];
      game.on('entityAdded', (e) => added.push(e.id));
      game.on('entityRemoved', (id) => removed.push(id));
      game.apply({ type: 'mobileAppeared', mobile: snapshot('carla', 1, 0) });
      game.apply({ type: 'mobileAppeared', mobile: snapshot('carla', 1, 0) });
      game.apply({ type: 'mobileDisappeared', id: 'bruno' });
      game.apply({ type: 'mobileDisappeared', id: 'ana' });
      expect(added).toEqual(['carla']);
      expect(removed).toEqual(['bruno']);
      expect(game.visibleCount).toBe(2);
    });
  });

  describe('objetos', () => {
    it('lleva la cuenta de los objetos del suelo a la vista', () => {
      game.apply({
        type: 'groundItems',
        added: [{ id: 'i1', kind: 'apple', amount: 2, position: { x: 1, y: 0 } }],
        removed: [],
      });
      expect([...game.groundItems()].map((i) => i.id)).toEqual(['i1']);
      game.apply({ type: 'groundItems', added: [], removed: ['i1'] });
      expect([...game.groundItems()]).toEqual([]);
    });

    it('guarda la mochila y avisa cuando cambia', () => {
      const changes: number[] = [];
      game.on('inventoryChanged', (inventory) => changes.push(inventory.backpack.length));
      game.apply({
        type: 'inventory',
        backpack: [{ id: 'g', kind: 'gold', amount: 50, position: { x: 0, y: 0 } }],
        equipment: [{ id: 'd', kind: 'dagger', amount: 1, slot: 'rightHand' }],
        bank: [],
      });
      expect(changes).toEqual([1]);
      expect(game.findItem('d')).toMatchObject({ slot: 'rightHand' });
    });

    it('actualiza lo que se ve puesto otro jugador', () => {
      game.apply({ type: 'playerEquipment', id: 'bruno', equipment: { head: 'iron-helmet' } });
      const bruno = [...game.allEntities()].find((e) => e.id === 'bruno');
      expect(bruno?.equipment).toEqual({ head: 'iron-helmet' });
    });

    it('envía los pedidos de mover y usar', () => {
      game.moveItem('i1', { type: 'equipment', slot: 'head' });
      game.useItem('i1');
      expect(sent).toEqual([
        { type: 'moveItem', itemId: 'i1', to: { type: 'equipment', slot: 'head' } },
        { type: 'useItem', itemId: 'i1' },
      ]);
    });
  });

  describe('combate', () => {
    it('guarda los vitales y sin energía camina aunque pida correr', () => {
      const vitals = { hits: 40, maxHits: 75, mana: 30, maxMana: 30, stamina: 0, maxStamina: 40 };
      game.apply({ type: 'vitals', vitals, dead: false });
      expect(game.vitals?.vitals.hits).toBe(40);
      expect(game.self?.health).toBeCloseTo(40 / 75);
      game.requestStep(Direction.East, 'run');
      expect(sent.at(-1)).toMatchObject({ type: 'move', mode: 'walk' });
    });

    it('muestra los golpes: gesto o embestida del atacante y número sobre el objetivo', () => {
      game.apply({ type: 'mobileAppeared', mobile: snapshot('rata', 1, 0) });
      game.apply({
        type: 'swing',
        attackerId: 'rata',
        targetId: 'ana',
        hit: true,
        blocked: false,
        damage: 3,
      });
      game.apply({
        type: 'swing',
        attackerId: 'ana',
        targetId: 'rata',
        hit: false,
        blocked: false,
        damage: 0,
      });
      const rat = [...game.allEntities()].find((e) => e.id === 'rata');
      expect(game.self?.combatTexts.map((t) => [t.text, t.kind])).toEqual([['3', 'damage-taken']]);
      expect(rat?.combatTexts.map((t) => t.text)).toEqual(['¡Falla!']);
      now += 100;
      // La rata embiste; la persona hace el gesto de su arma mirando a la rata.
      expect(game.self?.actionAt(now)?.kind).toBe('attack');
      expect(game.self?.direction).toBe(Direction.East);
    });

    it('la rata embiste al morder', () => {
      game.apply({ type: 'mobileAppeared', mobile: snapshot('rata', 1, 0) });
      game.apply({
        type: 'swing',
        attackerId: 'rata',
        targetId: 'ana',
        hit: false,
        blocked: false,
        damage: 0,
      });
      now += 100;
      const rat = [...game.allEntities()].find((e) => e.id === 'rata');
      expect(rat?.lungeOffset(now).x).not.toBe(0);
    });

    it('sigue el objetivo y la salud de los demás', () => {
      game.apply({ type: 'mobileAppeared', mobile: snapshot('rata', 1, 0) });
      game.attack('rata');
      expect(sent.at(-1)).toEqual({ type: 'attack', targetId: 'rata' });
      game.apply({ type: 'combatTarget', targetId: 'rata' });
      expect(game.targetId).toBe('rata');
      game.apply({ type: 'mobileHealth', id: 'rata', health: 0, dead: true });
      expect([...game.allEntities()].find((e) => e.id === 'rata')?.dead).toBe(true);
      game.stopAttack();
      expect(sent.at(-1)).toEqual({ type: 'stopAttack' });
    });

    it('anima a las criaturas con su propia velocidad', () => {
      game.apply({ type: 'mobileAppeared', mobile: snapshot('rata', 1, 0) });
      game.apply({
        type: 'mobileMoved',
        id: 'rata',
        position: { x: 2, y: 0 },
        direction: Direction.East,
        mode: 'walk',
      });
      const rat = [...game.allEntities()].find((e) => e.id === 'rata');
      now += 225; // la mitad de los 450 ms de la rata
      expect(rat?.renderPosition(now).x).toBeCloseTo(1.5);
    });
  });

  describe('chat', () => {
    it('muestra el texto sobre la cabeza y en el registro', () => {
      const log: LogEntry[] = [];
      game.on('log', (entry) => log.push(entry));
      game.apply({ type: 'chat', id: 'bruno', name: 'BRUNO', text: 'Hail!', channel: 'say' });
      expect(log).toEqual([{ kind: 'chat', author: 'BRUNO', text: 'Hail!', channel: 'say' }]);
      const bruno = [...game.allEntities()].find((e) => e.id === 'bruno');
      expect(bruno?.overheadTexts.map((t) => t.text)).toEqual(['Hail!']);

      now += 10_000;
      game.update();
      expect(bruno?.overheadTexts).toHaveLength(0);
    });

    it('no envía mensajes vacíos', () => {
      game.say('   ');
      game.say(' hola ');
      expect(sent).toEqual([{ type: 'chat', text: 'hola' }]);
    });

    it('los mensajes al grupo no aparecen sobre la cabeza', () => {
      game.apply({ type: 'chat', id: 'bruno', name: 'BRUNO', text: 'psst', channel: 'party' });
      const bruno = [...game.allEntities()].find((e) => e.id === 'bruno');
      expect(bruno?.overheadTexts).toHaveLength(0);
    });

    it('traduce comandos y responde la invitación pendiente', () => {
      game.say('/g vamos');
      game.say('/invitar Bruno');
      game.apply({
        type: 'social',
        party: null,
        guild: null,
        invites: { party: null, guild: 'Bruno' },
        fame: 0,
        karma: 0,
        murders: 0,
        notoriety: 'innocent',
      });
      game.say('/aceptar');
      expect(sent).toEqual([
        { type: 'chat', text: 'vamos', channel: 'party' },
        { type: 'social', command: 'party-invite', name: 'Bruno' },
        { type: 'social', command: 'guild-accept' },
      ]);
    });
  });

  describe('combate entre jugadores', () => {
    it('solo se ataca a otras personas en modo guerra', () => {
      game.attack('bruno');
      expect(sent).toEqual([]);
      game.toggleWarMode();
      game.attack('bruno');
      expect(sent).toEqual([{ type: 'attack', targetId: 'bruno' }]);
    });

    it('actualiza la reputación y el gremio de quien se ve', () => {
      game.apply({ type: 'mobileStatus', id: 'bruno', notoriety: 'criminal', guildTag: 'FNX' });
      const bruno = [...game.allEntities()].find((e) => e.id === 'bruno');
      expect(bruno?.notoriety).toBe('criminal');
      expect(bruno?.guildTag).toBe('FNX');
    });
  });

  it('guarda los efectos activos, deja de moverse paralizado y vuelve a moverse al vencer', () => {
    game.apply({
      type: 'effects',
      effects: [{ kind: 'paralyzed', amount: 0, remainingMs: 3000 }],
      attributes: { strength: 50, dexterity: 40, intelligence: 30 },
    });
    expect(game.hasEffect('paralyzed')).toBe(true);
    game.requestStep(Direction.East, 'walk');
    expect(sent.filter((m) => m.type === 'move')).toHaveLength(0);
    now += 3001;
    expect(game.hasEffect('paralyzed')).toBe(false);
    game.requestStep(Direction.East, 'walk');
    expect(sent.filter((m) => m.type === 'move')).toHaveLength(1);
  });

  it('el teletransporte mueve al instante y los hechizos llevan lugar o pergamino', () => {
    game.apply({ type: 'mobileTeleported', id: 'ana', position: { x: 2, y: 0 } });
    expect(game.self?.position).toEqual({ x: 2, y: 0 });
    game.castSpell('teleport', { position: { x: 1, y: 0 }, scrollId: 'p9' });
    expect(sent.at(-1)).toEqual({
      type: 'castSpell',
      spell: 'teleport',
      position: { x: 1, y: 0 },
      scrollId: 'p9',
    });
    game.useOn('venda', 'bruno');
    expect(sent.at(-1)).toEqual({ type: 'useOn', itemId: 'venda', targetId: 'bruno' });
  });

  it('revisa un cuerpo: la ventana se abre solo con el doble clic propio', () => {
    const changes: { items: number; opened: boolean }[] = [];
    game.on('corpseChanged', ({ corpse, opened }) =>
      changes.push({ items: corpse?.items.length ?? -1, opened }),
    );
    const gold = { id: 'oro', kind: 'gold', amount: 12, position: { x: 0, y: 0 } } as const;

    game.openCorpse('rata');
    expect(sent.at(-1)).toEqual({ type: 'openCorpse', corpseId: 'rata' });
    game.apply({ type: 'corpse', corpseId: 'rata', name: 'rata gigante', items: [gold] });
    expect(game.findItem('oro')).toEqual(gold);
    // Alguien sacó algo: se actualiza sin volver a abrirse.
    game.apply({ type: 'corpse', corpseId: 'rata', name: 'rata gigante', items: [] });
    game.lootAll('rata');
    expect(sent.at(-1)).toEqual({ type: 'lootAll', corpseId: 'rata' });
    game.apply({ type: 'corpseClosed', corpseId: 'rata' });

    expect(changes).toEqual([
      { items: 1, opened: true },
      { items: 0, opened: false },
      { items: -1, opened: false },
    ]);
    expect(game.corpse).toBeNull();
  });

  it('montado se predice al doble de rápido, sin gastar energía, y /desmontar pide bajarse', () => {
    game.apply({ type: 'mountChanged', id: 'ana', mount: 'horse-gray' });
    expect(game.self?.mount).toBe('horse-gray');
    sent = [];
    game.requestStep(Direction.East, 'walk');
    now += MOVE_DURATION_MS.walk / 2;
    game.requestStep(Direction.West, 'walk');
    expect(sent.filter((m) => m.type === 'move')).toHaveLength(2);

    game.say('/desmontar');
    expect(sent.at(-1)).toEqual({ type: 'dismount' });
    // A pie, /desmontar no manda nada.
    game.apply({ type: 'mountChanged', id: 'ana', mount: null });
    game.say('/desmontar');
    expect(sent.filter((m) => m.type === 'dismount')).toHaveLength(1);
  });
});
