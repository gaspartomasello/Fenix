import { sanitizeChatText, type EntityId } from '@fenix/shared';
import type { World } from '../../domain/world';
import type { Notifier } from '../ports';

/** Hablar: lo oyen quienes están dentro del rango de visión, como en UO. */
export class SendChat {
  constructor(
    private readonly world: World,
    private readonly notifier: Notifier,
  ) {}

  execute(playerId: EntityId, rawText: string): void {
    const player = this.world.get(playerId);
    const text = sanitizeChatText(rawText);
    if (!player || !text) return;
    const listeners = this.world.playersNear(player.position).map((p) => p.id);
    this.notifier.sendMany(listeners, { type: 'chat', id: playerId, name: player.name, text });
  }
}
