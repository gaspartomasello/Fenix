import type { Position } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { formatGameTime } from '@fenix/shared/rules/daylight';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { WorldClock } from '../../../domain/world-clock';
import type { SocialNotifications } from '../../kernel/social-notifications';
import type { GameServices } from '../../kernel/services';
import type { Clock, Notifier } from '../../ports';

/**
 * Las órdenes de los personajes de prueba (para probar el juego): `/invul`,
 * `/hora` y `/ir` o `/cueva`. Un personaje común recibe un "no podés".
 */
export class TestCommands {
  constructor(
    private readonly world: World,
    private readonly worldClock: WorldClock,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
    private readonly social: SocialNotifications,
    private readonly movement: GameServices['movement'],
    private readonly isTestCharacter: (name: string) => boolean,
  ) {}

  /** `/invul`: un personaje de prueba se vuelve invulnerable (nombre amarillo) o deja de serlo. */
  toggleInvulnerable(playerId: EntityId): void {
    const player = this.tester(
      playerId,
      'Solo los personajes de prueba pueden volverse invulnerables.',
    );
    if (!player) return;
    player.combat.invulnerable = !player.combat.invulnerable;
    this.social.statusChanged(player);
    this.say(
      playerId,
      player.combat.invulnerable
        ? 'Ahora sos invulnerable: nadie puede lastimarte (nombre amarillo).'
        : 'Ya no sos invulnerable.',
    );
  }

  /** `/hora`: un personaje de prueba mueve la hora del mundo, para todos. */
  setHour(playerId: EntityId, hour: number): void {
    if (!this.tester(playerId, 'Solo los personajes de prueba pueden cambiar la hora.')) return;
    const now = this.clock.now();
    this.worldClock.setHour(hour, now);
    this.notifier.broadcast({ type: 'worldTime', time: this.worldClock.timeAt(now) });
    this.say(playerId, `Ahora son las ${formatGameTime(hour / 24)}.`);
  }

  /**
   * `/cueva`: un personaje de prueba va a la boca de la mazmorra (afuera);
   * `/cueva fondo`, al lado del jefe de la última sala; `/ir <lugar>`, a un lugar con nombre.
   */
  travel(playerId: EntityId, to: 'cave' | 'lair' | { place: string }): void {
    const player = this.tester(playerId, 'Solo los personajes de prueba pueden viajar así.');
    if (!player) return;
    const map = this.world.map;
    if (typeof to === 'object') {
      const spot = this.placeSpot(to.place);
      if (!spot)
        return this.say(
          playerId,
          `No conozco ningún lugar que se llame "${to.place}". Escribí /ir para ver la lista.`,
        );
      this.movement.teleport(player, spot);
      return;
    }
    const destination =
      to === 'cave' ? map.teleporters.find((t) => map.regionAt(t)?.dungeon)?.to : this.nearLair();
    if (!destination) return this.say(playerId, 'Este mundo no tiene mazmorra.');
    this.movement.teleport(player, destination);
  }

  /** El jugador, si es de prueba; si no, le explica que no puede. */
  private tester(playerId: EntityId, refusal: string): Player | null {
    const player = this.world.get(playerId);
    if (!player) return null;
    if (this.isTestCharacter(player.name)) return player;
    this.say(playerId, refusal);
    return null;
  }

  /** Un tile libre en el centro de un lugar con nombre (sin importar mayúsculas ni tildes). */
  private placeSpot(name: string): Position | undefined {
    const plain = (text: string): string =>
      text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase().trim();
    // También coordenadas: "/ir 120 300" (para revisar el mapa).
    const coords = /^(\d+)[\s,]+(\d+)$/.exec(name.trim());
    if (coords) return this.walkableNear(Number(coords[1]), Number(coords[2]), 30);
    const wanted = plain(name);
    // Primero los lugares de la superficie; si no hay, los de abajo (criptas, catacumbas).
    const matches = this.world.map.regions.filter((r) => plain(r.name).startsWith(wanted));
    const region = matches.find((r) => !r.dungeon) ?? matches[0];
    if (!region) return undefined;
    return this.walkableNear(
      region.x + Math.floor(region.width / 2),
      region.y + Math.floor(region.height / 2),
      Math.max(region.width, region.height),
    );
  }

  /** El tile caminable más cercano a (cx, cy), buscando en cuadrados crecientes. */
  private walkableNear(cx: number, cy: number, reach: number): Position | undefined {
    for (let r = 0; r <= reach; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const spot = { x: cx + dx, y: cy + dy };
          if (this.world.map.isWalkable(spot)) return spot;
        }
    return undefined;
  }

  /** Un tile libre cerca del jefe de la mazmorra (el dragón). */
  private nearLair(): Position | undefined {
    const boss = this.world.allCreatures().find((c) => c.body === 'dragon');
    if (!boss) return undefined;
    for (let r = 7; r >= 3; r--) {
      const spot = { x: boss.home.x - r, y: boss.home.y };
      if (this.world.map.isWalkable(spot)) return spot;
    }
    return boss.home;
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}
