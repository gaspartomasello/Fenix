import type { Npc } from '../../domain/npcs/npc';
import type { Player } from '../../domain/player';

/**
 * Lo que un módulo le hace decir a un vecino cuando le hablan. `words` llega
 * normalizado (minúsculas, sin acentos ni signos). Devuelve la respuesta, o
 * null si no tiene que ver con ese módulo.
 */
export type DialogueHandler = (player: Player, npc: Npc, words: string) => string | null;

/**
 * Diálogos que suman los módulos a la charla de los vecinos (el gremio de
 * asesinos, los mercenarios…). La charla de siempre los consulta primero: el
 * primero que contesta, gana.
 */
export class NpcDialogue {
  private readonly handlers: DialogueHandler[] = [];

  add(handler: DialogueHandler): void {
    this.handlers.push(handler);
  }

  answer(player: Player, npc: Npc, words: string): string | null {
    for (const handler of this.handlers) {
      const reply = handler(player, npc, words);
      if (reply) return reply;
    }
    return null;
  }
}
