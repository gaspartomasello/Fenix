import { REAGENTS } from '@fenix/shared/character/creation';
import { ITEMS, isItemKind, type ItemKind } from '@fenix/shared/items/item-catalog';
import { SPELLS, isSpellKey, type SpellKey } from '@fenix/shared/magic/spell-catalog';
import type { Vitals } from '@fenix/shared/combat/vitals';
import type { BackpackItemSnapshot } from '@fenix/shared/protocol/messages';
import { SKILL_NAMES } from '@fenix/shared/skills/skill-catalog';
import { isActiveSkill, type ActiveSkill } from '@fenix/shared/skills/stealth';

/**
 * Las opciones del jugador, como las de un asistente de UO: qué se ve en la
 * barra de información de arriba, qué se muestra en pantalla y los atajos de
 * teclado. Se guardan en el navegador; no hay reglas de juego acá.
 */

// ------------------------------------------------------------ barra de información

/** Lo que puede mostrar la barra de información, en una línea. */
export const INFO_ITEMS = [
  { key: 'reagents', label: 'Reactivos' },
  { key: 'gold', label: 'Oro' },
  { key: 'weight', label: 'Peso' },
  { key: 'hits', label: 'Vida' },
  { key: 'mana', label: 'Maná' },
  { key: 'stamina', label: 'Energía' },
  { key: 'bandages', label: 'Vendas' },
  { key: 'potions', label: 'Pociones' },
  { key: 'arrows', label: 'Flechas y virotes' },
] as const;

export type InfoKey = (typeof INFO_ITEMS)[number]['key'];

const INFO_KEYS: ReadonlySet<string> = new Set(INFO_ITEMS.map((i) => i.key));

/** Un dato de la barra: con ícono (un objeto) o con texto corto. */
export interface InfoChip {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** El objeto cuyo ícono se muestra (reactivos, pociones…). */
  readonly icon?: ItemKind;
  /** Para resaltar lo que se está acabando. */
  readonly low?: boolean;
}

export interface InfoState {
  readonly backpack: readonly BackpackItemSnapshot[];
  /** Totales con lo de adentro de las bolsas (los manda el servidor); si falta, se cuenta la mochila. */
  readonly carried?: Readonly<Partial<Record<ItemKind, number>>>;
  readonly vitals: Vitals | null;
  readonly weight: number;
  /** Lo máximo que se puede llevar (null si todavía no se sabe). */
  readonly maxWeight: number | null;
}

/** Menos de esto de un reactivo o de vendas se marca como que se acaba. */
const LOW = 10;

const POTIONS: readonly ItemKind[] = [
  'healing-potion',
  'cure-potion',
  'refresh-potion',
  'strength-potion',
  'agility-potion',
];

/** Los datos de la barra, en el orden elegido. */
export function infoChips(keys: readonly InfoKey[], state: InfoState): InfoChip[] {
  const count = (kind: ItemKind): number =>
    state.carried
      ? (state.carried[kind] ?? 0)
      : state.backpack.reduce((sum, item) => sum + (item.kind === kind ? item.amount : 0), 0);
  const chips: InfoChip[] = [];
  const v = state.vitals;
  for (const key of keys) {
    switch (key) {
      case 'reagents':
        for (const kind of REAGENTS) {
          const amount = count(kind);
          chips.push({
            key: `reagent:${kind}`,
            label: capitalize(ITEMS[kind].plural),
            value: String(amount),
            icon: kind,
            low: amount < LOW,
          });
        }
        break;
      case 'gold':
        chips.push({
          key,
          label: 'Oro',
          value: count('gold').toLocaleString('es-AR'),
          icon: 'gold',
        });
        break;
      case 'weight':
        chips.push({
          key,
          label: 'Peso',
          value:
            state.maxWeight === null ? String(state.weight) : `${state.weight}/${state.maxWeight}`,
          low: state.maxWeight !== null && state.weight > state.maxWeight,
        });
        break;
      case 'hits':
        if (v)
          chips.push({
            key,
            label: 'Vida',
            value: `${v.hits}/${v.maxHits}`,
            low: v.hits * 3 < v.maxHits,
          });
        break;
      case 'mana':
        if (v)
          chips.push({
            key,
            label: 'Maná',
            value: `${v.mana}/${v.maxMana}`,
            low: v.mana * 4 < v.maxMana,
          });
        break;
      case 'stamina':
        if (v)
          chips.push({
            key,
            label: 'Energía',
            value: `${v.stamina}/${v.maxStamina}`,
            low: v.stamina * 4 < v.maxStamina,
          });
        break;
      case 'bandages': {
        const amount = count('bandage');
        chips.push({
          key,
          label: 'Vendas',
          value: String(amount),
          icon: 'bandage',
          low: amount < LOW,
        });
        break;
      }
      case 'potions':
        for (const kind of POTIONS) {
          const amount = count(kind);
          if (amount > 0)
            chips.push({
              key: `potion:${kind}`,
              label: capitalize(ITEMS[kind].plural),
              value: String(amount),
              icon: kind,
            });
        }
        break;
      case 'arrows':
        chips.push({
          key: 'arrows',
          label: 'Flechas',
          value: String(count('arrow')),
          icon: 'arrow',
        });
        chips.push({ key: 'bolts', label: 'Virotes', value: String(count('bolt')), icon: 'bolt' });
        break;
    }
  }
  return chips;
}

// ------------------------------------------------------------ atajos de teclado

/** Lo que se puede hacer con un atajo que no es un hechizo, un objeto ni una habilidad. */
export const COMMANDS = [
  { key: 'attack-next', label: 'Atacar a la criatura siguiente' },
  { key: 'attack-previous', label: 'Atacar a la criatura anterior' },
  { key: 'war-mode', label: 'Modo guerra (prender y apagar)' },
  { key: 'backpack', label: 'Abrir la mochila' },
  { key: 'paperdoll', label: 'Abrir la ventana de personaje' },
  { key: 'spellbook', label: 'Abrir el libro de hechizos' },
  { key: 'skills', label: 'Abrir las habilidades' },
  { key: 'map', label: 'Abrir el mapa' },
  { key: 'options', label: 'Abrir las opciones' },
] as const;

export type CommandKey = (typeof COMMANDS)[number]['key'];

const COMMAND_KEYS: ReadonlySet<string> = new Set(COMMANDS.map((c) => c.key));

export type HotkeyAction =
  | { readonly type: 'spell'; readonly spell: SpellKey }
  | { readonly type: 'item'; readonly kind: ItemKind }
  | { readonly type: 'skill'; readonly skill: ActiveSkill }
  | { readonly type: 'command'; readonly command: CommandKey };

export interface Hotkey {
  /** La combinación, como «Ctrl+F1» o «Shift+Q». */
  readonly combo: string;
  readonly action: HotkeyAction;
}

/** Lo que dice el atajo en la lista. */
export function actionLabel(action: HotkeyAction): string {
  switch (action.type) {
    case 'spell':
      return `Lanzar ${SPELLS[action.spell].name}`;
    case 'item':
      return `Usar ${ITEMS[action.kind].plural}`;
    case 'skill':
      return `Usar ${SKILL_NAMES[action.skill]}`;
    case 'command':
      return COMMANDS.find((c) => c.key === action.command)?.label ?? action.command;
  }
}

/** Teclas del juego que no se pueden pisar sin modificador (caminar, escribir, cancelar). */
const RESERVED_CODES: ReadonlySet<string> = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'Escape',
]);

const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Control', 'Shift', 'Alt', 'Meta']);

export interface KeyPress {
  readonly code: string;
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
}

/**
 * La combinación de una tecla apretada («Ctrl+Shift+F3»), o null si no
 * sirve como atajo (solo un modificador, o caminar y Escape sin modificador).
 */
export function comboOf(press: KeyPress): string | null {
  if (MODIFIER_KEYS.has(press.key)) return null;
  const base = keyName(press.code);
  if (!base) return null;
  const modified = press.ctrlKey || press.altKey || press.metaKey;
  if (!modified && RESERVED_CODES.has(press.code)) return null;
  const parts: string[] = [];
  if (press.ctrlKey || press.metaKey) parts.push('Ctrl');
  if (press.altKey) parts.push('Alt');
  if (press.shiftKey) parts.push('Shift');
  parts.push(base);
  return parts.join('+');
}

/** Nombre corto de una tecla física: «A», «1», «F5», «Num 3», «Espacio». */
function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    Space: 'Espacio',
    Backquote: 'º',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: 'Ñ',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Insert: 'Insert',
    Delete: 'Supr',
    Home: 'Inicio',
    End: 'Fin',
    PageUp: 'RePág',
    PageDown: 'AvPág',
    Escape: 'Esc',
    Enter: 'Enter',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
  };
  return named[code] ?? null;
}

/** Pone un atajo (si la combinación ya tenía otro, lo reemplaza). */
export function setHotkey(hotkeys: readonly Hotkey[], hotkey: Hotkey): Hotkey[] {
  return [...hotkeys.filter((h) => h.combo !== hotkey.combo), hotkey];
}

export function removeHotkey(hotkeys: readonly Hotkey[], combo: string): Hotkey[] {
  return hotkeys.filter((h) => h.combo !== combo);
}

// ------------------------------------------------------------ todas las opciones

export interface GameOptions {
  /** Qué muestra la barra de información, en orden (vacía: no se muestra). */
  readonly info: readonly InfoKey[];
  /** Nombres sobre las cabezas. */
  readonly names: boolean;
  /** Números de daño y curación que saltan sobre las cabezas. */
  readonly numbers: boolean;
  /** El mapa chico de la esquina. */
  readonly minimap: boolean;
  /** La barra de atajos de abajo. */
  readonly hotbar: boolean;
  readonly hotkeys: readonly Hotkey[];
}

/** Para empezar: los reactivos, el oro y el peso arriba, y curarse con F1–F4. */
export function defaultOptions(): GameOptions {
  return {
    info: ['reagents', 'gold', 'weight', 'bandages'],
    names: true,
    numbers: true,
    minimap: true,
    hotbar: true,
    hotkeys: [
      { combo: 'F1', action: { type: 'spell', spell: 'heal' } },
      { combo: 'F2', action: { type: 'spell', spell: 'greater-heal' } },
      { combo: 'F3', action: { type: 'spell', spell: 'cure' } },
      { combo: 'F4', action: { type: 'item', kind: 'bandage' } },
      { combo: 'F5', action: { type: 'spell', spell: 'magic-arrow' } },
      { combo: 'F6', action: { type: 'spell', spell: 'lightning' } },
      { combo: 'F7', action: { type: 'spell', spell: 'explosion' } },
      { combo: 'F8', action: { type: 'command', command: 'war-mode' } },
    ],
  };
}

/** Lo guardado en el navegador → opciones válidas (lo que no se entiende, por defecto). */
export function parseOptions(raw: string | null): GameOptions {
  const defaults = defaultOptions();
  if (!raw) return defaults;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (typeof value !== 'object' || value === null) return defaults;
  const o = value as Record<string, unknown>;
  const flag = (name: keyof GameOptions, fallback: boolean): boolean =>
    typeof o[name] === 'boolean' ? (o[name] as boolean) : fallback;
  const info = Array.isArray(o.info)
    ? o.info.filter((k): k is InfoKey => typeof k === 'string' && INFO_KEYS.has(k))
    : defaults.info;
  const hotkeys = Array.isArray(o.hotkeys)
    ? o.hotkeys.flatMap((h): Hotkey[] => {
        const hotkey = parseHotkey(h);
        return hotkey ? [hotkey] : [];
      })
    : defaults.hotkeys;
  return {
    info: [...new Set(info)],
    names: flag('names', defaults.names),
    numbers: flag('numbers', defaults.numbers),
    minimap: flag('minimap', defaults.minimap),
    hotbar: flag('hotbar', defaults.hotbar),
    hotkeys,
  };
}

function parseHotkey(value: unknown): Hotkey | null {
  if (typeof value !== 'object' || value === null) return null;
  const { combo, action } = value as { combo?: unknown; action?: unknown };
  if (typeof combo !== 'string' || combo.length === 0 || combo.length > 30) return null;
  if (typeof action !== 'object' || action === null) return null;
  const a = action as {
    type?: unknown;
    spell?: unknown;
    kind?: unknown;
    skill?: unknown;
    command?: unknown;
  };
  if (a.type === 'spell' && isSpellKey(a.spell))
    return { combo, action: { type: 'spell', spell: a.spell } };
  if (a.type === 'item' && isItemKind(a.kind))
    return { combo, action: { type: 'item', kind: a.kind } };
  if (a.type === 'skill' && isActiveSkill(a.skill))
    return { combo, action: { type: 'skill', skill: a.skill } };
  if (a.type === 'command' && typeof a.command === 'string' && COMMAND_KEYS.has(a.command))
    return { combo, action: { type: 'command', command: a.command as CommandKey } };
  return null;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
