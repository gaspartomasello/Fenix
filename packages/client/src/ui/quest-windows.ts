import {
  MAX_QUESTS,
  describeGoal,
  describeReward,
  goalCount,
  type EntityId,
  type Quest,
  type QuestProgress,
} from '@fenix/shared';
import { el } from './dom';
import { GameWindow } from './game-window';

/** Lo que cuenta un vecino al pedir algo: se acepta o se deja para otro momento. */
export class QuestOfferWindow {
  readonly window: GameWindow;
  private npcId: EntityId | null = null;
  private readonly content: HTMLElement;

  constructor(private readonly accept: (npcId: EntityId) => void) {
    this.window = new GameWindow('mision', 'Misión', { x: 300, y: 140 });
    this.window.element.classList.add('quest-window');
    this.content = el('div', { className: 'quest-offer' });
    const yes = el('button', {
      className: 'quest-accept',
      text: 'Aceptar',
      attrs: { type: 'button' },
    });
    const no = el('button', {
      className: 'quest-decline',
      text: 'Ahora no',
      attrs: { type: 'button' },
    });
    yes.addEventListener('click', () => {
      if (this.npcId) this.accept(this.npcId);
      this.window.hide();
    });
    no.addEventListener('click', () => this.window.hide());
    this.window.body.append(this.content, el('div', { className: 'quest-buttons' }, [no, yes]));
  }

  open(npcId: EntityId, quest: Quest): void {
    this.npcId = npcId;
    this.window.setTitle(quest.title);
    this.content.replaceChildren(
      el('p', { className: 'quest-giver', text: `${quest.giver}, de ${quest.town}, te cuenta:` }),
      el('p', { className: 'quest-story', text: `«${quest.story}»` }),
      el('p', { className: 'quest-goal', text: describeGoal(quest.goal) + '.' }),
      el('p', { className: 'quest-reward', text: `Recompensa: ${describeReward(quest.reward)}.` }),
    );
    this.window.show();
  }
}

/** El diario: las misiones aceptadas, cuánto falta, y la opción de dejarlas. */
export class QuestJournal {
  readonly window: GameWindow;
  private readonly list: HTMLElement;
  private readonly count: HTMLElement;

  constructor(private readonly abandon: (giver: string) => void) {
    this.window = new GameWindow('misiones', 'Misiones', { x: 320, y: 120 });
    this.window.element.classList.add('quest-window');
    this.list = el('ul', { className: 'quest-list' });
    this.count = el('p', { className: 'window-hint' });
    this.window.body.append(this.list, this.count);
    this.render([]);
  }

  render(quests: readonly QuestProgress[]): void {
    this.count.textContent =
      quests.length === 0
        ? 'Hablá con los vecinos de los pueblos: muchos necesitan ayuda.'
        : `${quests.length} de ${MAX_QUESTS} misiones. Volvé a quien te la dio para cobrar.`;
    this.list.replaceChildren(
      ...quests.map((q) => {
        const total = goalCount(q.goal);
        const done = q.goal.kind === 'slay' && q.progress >= total;
        const leave = el('button', {
          className: 'quest-abandon',
          text: 'Dejar',
          attrs: { type: 'button', 'aria-label': `Dejar la misión de ${q.giver}` },
        });
        leave.addEventListener('click', () => this.abandon(q.giver));
        return el('li', { className: `quest-item${done ? ' quest-done' : ''}` }, [
          el('div', { className: 'quest-item-head' }, [el('strong', { text: q.title }), leave]),
          el('p', {
            className: 'quest-goal',
            text:
              describeGoal(q.goal) +
              (q.goal.kind === 'slay' ? ` · ${Math.min(q.progress, total)}/${total}` : '') +
              (done ? ' · ¡listo!' : ''),
          }),
          el('p', {
            className: 'quest-meta',
            text: `${q.giver} (${q.town}) · ${describeReward(q.reward)}`,
          }),
        ]);
      }),
    );
  }
}
