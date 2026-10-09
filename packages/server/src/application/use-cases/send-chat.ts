import { sanitizeChatText, type ChatChannel, type EntityId } from '@fenix/shared';
import type { World } from '../../domain/world';
import type { Notifier } from '../ports';

/**
 * Hablar: en voz alta lo oyen quienes están en el rango de visión, como en UO;
 * al grupo o al gremio lo reciben sus miembros estén donde estén.
 */
export class SendChat {
  constructor(
    private readonly world: World,
    private readonly notifier: Notifier,
  ) {}

  execute(playerId: EntityId, rawText: string, channel: ChatChannel = 'say'): void {
    const player = this.world.get(playerId);
    const text = sanitizeChatText(rawText);
    if (!player || !text) return;
    const listeners = this.listeners(playerId, channel);
    if (!listeners) return;
    this.notifier.sendMany(listeners, {
      type: 'chat',
      id: playerId,
      name: player.name,
      text,
      channel,
    });
  }

  private listeners(playerId: EntityId, channel: ChatChannel): EntityId[] | null {
    const player = this.world.get(playerId);
    if (!player) return null;
    const refuse = (text: string): null => {
      this.notifier.send(playerId, { type: 'system', text });
      return null;
    };
    switch (channel) {
      case 'say':
        return this.world.playersNear(player.position).map((p) => p.id);
      case 'party': {
        const party = this.world.parties.of(playerId);
        return party ? [...party.members] : refuse('No estás en un grupo.');
      }
      case 'guild': {
        const guild = this.world.guilds.of(player.name);
        if (!guild) return refuse('No estás en un gremio.');
        return [...guild.members].flatMap((name) => this.world.findByName(name)?.id ?? []);
      }
    }
  }
}
