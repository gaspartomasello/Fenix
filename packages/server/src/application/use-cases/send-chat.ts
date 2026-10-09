import { sanitizeChatText, type EntityId } from '@fenix/shared';
import type { World } from '../../domain/world';
import type { Notifier } from '../ports';

export class SendChat {
  constructor(
    private readonly world: World,
    private readonly notifier: Notifier,
  ) {}

  execute(playerId: EntityId, rawText: string): void {
    const player = this.world.get(playerId);
    const text = sanitizeChatText(rawText);
    if (!player || !text) return;
    this.notifier.broadcast({ type: 'chat', id: playerId, name: player.name, text });
  }
}
