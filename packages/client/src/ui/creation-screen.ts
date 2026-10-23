import {
  CREATION_ATTRIBUTE_MAX,
  CREATION_ATTRIBUTE_MIN,
  CREATION_ATTRIBUTE_TOTAL,
  CREATION_SKILL_VALUES,
  STARTING_BANK_GOLD,
  startingKit,
  validateCreation,
  type CharacterCreation,
  type CreationSkills,
} from '@fenix/shared/character/creation';
import { NAME_MAX_LENGTH } from '@fenix/shared/character/name';
import type { Attributes } from '@fenix/shared/combat/vitals';
import { describeItem } from '@fenix/shared/items/item-catalog';
import { SKILL_GROUPS, SKILL_NAMES, type SkillKey } from '@fenix/shared/skills/skill-catalog';
import { AppearancePicker } from './appearance-picker';
import { el } from './dom';

export interface CreationScreenOptions {
  readonly onCreate: (creation: CharacterCreation) => void;
  readonly onBack: () => void;
}

type AttributeKey = keyof Attributes;
type ChosenSkills = [...CreationSkills];

const ATTRIBUTE_NAMES: Readonly<Record<AttributeKey, string>> = {
  strength: 'Fuerza',
  dexterity: 'Destreza',
  intelligence: 'Inteligencia',
};

/** Personajes armados para empezar rápido, como las plantillas de UO. */
const TEMPLATES: readonly {
  readonly name: string;
  readonly attributes: Attributes;
  readonly skills: ChosenSkills;
}[] = [
  {
    name: 'Guerrero',
    attributes: { strength: 60, dexterity: 40, intelligence: 20 },
    skills: ['swordsmanship', 'tactics', 'healing', 'parrying'],
  },
  {
    name: 'Mago',
    attributes: { strength: 25, dexterity: 20, intelligence: 75 },
    skills: ['magery', 'meditation', 'evaluating-intelligence', 'magic-resist'],
  },
  {
    name: 'Arquero',
    attributes: { strength: 45, dexterity: 55, intelligence: 20 },
    skills: ['archery', 'tactics', 'healing', 'anatomy'],
  },
  {
    name: 'Herrero',
    attributes: { strength: 60, dexterity: 40, intelligence: 20 },
    skills: ['blacksmithy', 'mining', 'tactics', 'tailoring'],
  },
  {
    name: 'Sigiloso',
    attributes: { strength: 35, dexterity: 65, intelligence: 20 },
    skills: ['fencing', 'hiding', 'stealth', 'lockpicking'],
  },
];

/** Crear un personaje: nombre, apariencia, atributos y cuatro habilidades (60, 60, 50 y 50). */
export class CreationScreen {
  readonly element: HTMLElement;
  private readonly picker = new AppearancePicker();
  private readonly nameInput: HTMLInputElement;
  private readonly errorText: HTMLElement;
  private readonly kitText: HTMLElement;
  private readonly createButton: HTMLButtonElement;
  private attributes: Attributes = { strength: 40, dexterity: 40, intelligence: 40 };
  private skills: ChosenSkills = ['swordsmanship', 'tactics', 'healing', 'parrying'];
  private readonly sliders = new Map<
    AttributeKey,
    { input: HTMLInputElement; value: HTMLElement }
  >();
  private readonly selects: HTMLSelectElement[] = [];

  constructor(private readonly options: CreationScreenOptions) {
    this.nameInput = el('input', {
      className: 'field',
      attrs: {
        type: 'text',
        maxlength: String(NAME_MAX_LENGTH),
        placeholder: 'Nombre del personaje',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': 'Nombre del personaje',
      },
    });
    this.errorText = el('p', { className: 'login-error', attrs: { role: 'alert' } });
    this.kitText = el('p', { className: 'login-hint creation-kit' });
    this.createButton = el('button', {
      className: 'button',
      text: 'Crear y entrar al mundo',
      attrs: { type: 'submit' },
    });
    const back = el('button', {
      className: 'button button--quiet',
      text: 'Volver',
      attrs: { type: 'button' },
    });
    back.addEventListener('click', () => this.options.onBack());

    const templates = TEMPLATES.map((template) => {
      const chip = el('button', {
        className: 'option-chip',
        text: template.name,
        attrs: { type: 'button' },
      });
      chip.addEventListener('click', () => {
        this.attributes = template.attributes;
        this.skills = [...template.skills];
        this.refresh();
      });
      return chip;
    });

    const form = el('form', { className: 'login-form creation-form' }, [
      el('div', { className: 'creation-columns' }, [
        el('div', { className: 'creation-column' }, [
          this.picker.preview,
          this.nameInput,
          ...this.picker.rows,
        ]),
        el('div', { className: 'creation-column' }, [
          el('h2', { className: 'creation-heading', text: 'Para empezar rápido' }),
          el('div', { className: 'swatches' }, templates),
          el('h2', {
            className: 'creation-heading',
            text: `Atributos (${CREATION_ATTRIBUTE_TOTAL} puntos)`,
          }),
          ...(['strength', 'dexterity', 'intelligence'] as const).map((key) =>
            this.attributeRow(key),
          ),
          el('h2', { className: 'creation-heading', text: 'Habilidades' }),
          ...CREATION_SKILL_VALUES.map((value, index) => this.skillRow(index, value)),
          this.kitText,
        ]),
      ]),
      this.errorText,
      el('div', { className: 'creation-actions' }, [back, this.createButton]),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });

    this.element = el('div', { className: 'login-screen' }, [
      el('div', { className: 'panel login-panel creation-panel' }, [
        el('h1', { className: 'title title--small', text: 'Nuevo personaje' }),
        form,
      ]),
    ]);
    this.refresh();
  }

  focus(): void {
    this.nameInput.focus();
  }

  showError(message: string): void {
    this.errorText.textContent = message;
    this.createButton.disabled = false;
  }

  destroy(): void {
    this.picker.destroy();
    this.element.remove();
  }

  private attributeRow(key: AttributeKey): HTMLElement {
    const input = el('input', {
      className: 'creation-slider',
      attrs: {
        type: 'range',
        min: String(CREATION_ATTRIBUTE_MIN),
        max: String(CREATION_ATTRIBUTE_MAX),
        step: '1',
        'aria-label': ATTRIBUTE_NAMES[key],
      },
    });
    const value = el('span', { className: 'creation-value' });
    input.addEventListener('input', () => {
      this.attributes = rebalance(this.attributes, key, Number(input.value));
      this.refresh();
    });
    this.sliders.set(key, { input, value });
    return el('label', { className: 'swatch-row creation-row' }, [
      el('span', { className: 'swatch-label creation-label', text: ATTRIBUTE_NAMES[key] }),
      input,
      value,
    ]);
  }

  private skillRow(index: number, value: number): HTMLElement {
    const select = el('select', {
      className: 'field creation-select',
      attrs: { 'aria-label': `Habilidad en ${value / 10}` },
    });
    for (const group of SKILL_GROUPS) {
      const optgroup = el('optgroup', { attrs: { label: group.name } });
      for (const skill of group.skills)
        optgroup.append(el('option', { text: SKILL_NAMES[skill], attrs: { value: skill } }));
      select.append(optgroup);
    }
    select.addEventListener('change', () => {
      const chosen = select.value as SkillKey;
      // Si ya estaba elegida en otro lugar, se intercambian.
      const other = this.skills.indexOf(chosen);
      const next: ChosenSkills = [...this.skills];
      if (other >= 0 && other !== index) next[other] = next[index] ?? chosen;
      next[index] = chosen;
      this.skills = next;
      this.refresh();
    });
    this.selects.push(select);
    return el('label', { className: 'swatch-row creation-row' }, [
      el('span', { className: 'swatch-label creation-label', text: `${value / 10}` }),
      select,
    ]);
  }

  private refresh(): void {
    for (const [key, { input, value }] of this.sliders) {
      input.value = String(this.attributes[key]);
      value.textContent = String(this.attributes[key]);
    }
    this.selects.forEach((select, i) => (select.value = this.skills[i] ?? ''));
    const kit = startingKit(this.skills)
      .map(({ kind, amount }) => describeItem(kind, amount))
      .join(', ');
    this.kitText.textContent = `Empezás con: ${kit}; y ${STARTING_BANK_GOLD} monedas en el banco. Ese equipo es tuyo: no se pierde ni te lo pueden sacar.`;
  }

  private submit(): void {
    const result = validateCreation({
      name: this.nameInput.value,
      appearance: this.picker.value,
      attributes: this.attributes,
      skills: this.skills,
    });
    if (!result.ok) {
      this.showError(result.reason);
      return;
    }
    this.errorText.textContent = '';
    this.createButton.disabled = true;
    this.options.onCreate(result.creation);
  }
}

/**
 * Cambia un atributo y reparte la diferencia entre los otros dos (en
 * proporción), para que siempre sumen lo mismo.
 */
export function rebalance(current: Attributes, key: AttributeKey, wanted: number): Attributes {
  const value = Math.min(CREATION_ATTRIBUTE_MAX, Math.max(CREATION_ATTRIBUTE_MIN, wanted));
  const [a, b] = (['strength', 'dexterity', 'intelligence'] as const).filter((k) => k !== key) as [
    AttributeKey,
    AttributeKey,
  ];
  const rest = CREATION_ATTRIBUTE_TOTAL - value;
  const share = current[a] + current[b] > 0 ? current[a] / (current[a] + current[b]) : 0.5;
  const low = Math.max(CREATION_ATTRIBUTE_MIN, rest - CREATION_ATTRIBUTE_MAX);
  const high = Math.min(CREATION_ATTRIBUTE_MAX, rest - CREATION_ATTRIBUTE_MIN);
  const first = Math.min(high, Math.max(low, Math.round(rest * share)));
  return { ...current, [key]: value, [a]: first, [b]: rest - first } as Attributes;
}
