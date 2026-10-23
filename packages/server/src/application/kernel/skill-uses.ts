import type { ActiveSkill } from '@fenix/shared/skills/stealth';
import type { EntityId } from '@fenix/shared/protocol/messages';

/** Las habilidades que se usan con un botón (Esconderse, Fisgonear, Robar…). */
export type UsableSkill = ActiveSkill;

type Handler = (playerId: EntityId, targetId: EntityId | undefined) => void;

/** Registro de quién atiende cada habilidad que se usa con un botón. */
export class SkillUses {
  private readonly handlers = new Map<UsableSkill, Handler>();

  on(skill: UsableSkill, run: Handler): void {
    if (this.handlers.has(skill)) throw new Error(`Dos módulos atienden la habilidad "${skill}".`);
    this.handlers.set(skill, run);
  }

  use(skill: UsableSkill, playerId: EntityId, targetId: EntityId | undefined): void {
    this.handlers.get(skill)?.(playerId, targetId);
  }
}
