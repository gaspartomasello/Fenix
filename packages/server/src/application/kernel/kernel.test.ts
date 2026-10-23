import { describe, expect, it, vi } from 'vitest';
import { Item } from '../../domain/items/item';
import { EventBus } from './event-bus';
import { Guards } from './guards';
import { ItemUses } from './item-uses';
import { ServiceRegistry } from './services';
import { SkillUses } from './skill-uses';

describe('núcleo', () => {
  it('eventos: avisa a todos en orden de suscripción, y se puede dejar de escuchar', () => {
    const bus = new EventBus<{ ping: { n: number } }>();
    const heard: string[] = [];
    bus.on('ping', ({ n }) => heard.push(`a${n}`));
    const stop = bus.on('ping', ({ n }) => heard.push(`b${n}`));
    bus.emit('ping', { n: 1 });
    stop();
    bus.emit('ping', { n: 2 });
    expect(heard).toEqual(['a1', 'b1', 'a2']);
    expect(bus.listenerCount('ping')).toBe(1);
  });

  it('servicios: uno por nombre, pedido tarde, y con aviso claro si falta', () => {
    const services = new ServiceRegistry();
    const banking = services.lazy('banking');
    expect(() => banking.nearBanker({} as never)).toThrow(/Falta el módulo .*banking/);
    services.provide('banking', { nearBanker: () => true });
    expect(banking.nearBanker({} as never)).toBe(true);
    expect(() => services.provide('banking', { nearBanker: () => false })).toThrow(/Dos módulos/);
  });

  it('servicios opcionales: sin el módulo, no pasa nada; con el módulo, lo usa', () => {
    const services = new ServiceRegistry();
    const stealth = services.optional('stealth');
    expect(stealth.revealArea({ x: 0, y: 0 }, 3, {} as never)).toBe(0);
    const reveal = vi.fn();
    services.provide('stealth', { reveal, conceal: () => {}, revealArea: () => 2, step: () => {} });
    stealth.reveal({} as never, 'hola');
    expect(reveal).toHaveBeenCalledWith({}, 'hola');
    expect(stealth.revealArea({ x: 0, y: 0 }, 3, {} as never)).toBe(2);
  });

  it('reglas: la primera que niega gana; si ninguna niega, se puede', () => {
    const guards = new Guards<[n: number]>();
    expect(guards.refusal(1)).toBeNull();
    guards.add((n) => (n > 5 ? 'muy grande' : null));
    guards.add((n) => (n > 2 ? 'grande' : null));
    expect(guards.refusal(1)).toBeNull();
    expect(guards.refusal(3)).toBe('grande');
    expect(guards.refusal(9)).toBe('muy grande');
  });

  it('usos de objetos: por clase antes que por uso, y "solo si es tuyo"', () => {
    const uses = new ItemUses();
    const smelt = vi.fn();
    const play = vi.fn();
    uses.on('kind:iron-ore', smelt, { ownedOnly: true });
    uses.on('music', play, { ownedOnly: true });
    const ore = new Item('o', 'iron-ore', 1, { type: 'backpack', ownerId: 'ana' });
    expect(uses.find(ore, 'ana')).toBe(smelt);
    expect(uses.find(ore, 'beto')).toBeNull();
    const lute = new Item('l', 'lute', 1, { type: 'ground', position: { x: 0, y: 0 } });
    expect(uses.find(lute, 'ana')).toBeNull();
    expect(() => uses.on('music', play)).toThrow(/Dos módulos/);
  });

  it('habilidades: cada una la atiende un módulo; sin módulo, no pasa nada', () => {
    const skills = new SkillUses();
    const hide = vi.fn();
    skills.on('hiding', hide);
    skills.use('hiding', 'ana', undefined);
    skills.use('stealing', 'ana', 'beto');
    expect(hide).toHaveBeenCalledWith('ana', undefined);
    expect(() => skills.on('hiding', hide)).toThrow(/Dos módulos/);
  });
});
