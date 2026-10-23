import {
  ACCOUNT_CHARACTERS,
  DEFAULT_APPEARANCE,
  SKILL_KEYS,
  validateCharacterName,
  validatePassword,
  type AccountMessage,
  type CharacterCreation,
} from '@fenix/shared';
import type { CharacterPersistence } from '../character-persistence';
import type { AccountRecord, AccountStore, PasswordHasher } from '../ports';
import type { JoinWorld, JoinWorldResult } from './join-world';

export type AccountResult = { ok: true; account: AccountRecord } | { ok: false; reason: string };

/**
 * Cuentas: cada una tiene su contraseña y hasta cinco personajes. Sin
 * almacén se guardan en memoria (pruebas); sin hasher (modo solo) no se pide
 * contraseña. Los personajes de antes de las cuentas pasan a una cuenta con
 * su mismo nombre la primera vez que se entra con su contraseña.
 */
export class Accounts {
  private readonly memory = new Map<string, AccountRecord>();

  constructor(
    private readonly store: AccountStore | undefined,
    private readonly characters: CharacterPersistence,
    private readonly hasher: PasswordHasher | undefined,
    private readonly joinWorld: JoinWorld,
    /** Nombres de los personajes de prueba: su cuenta ya trae ese personaje. */
    private readonly testCharacters: readonly string[] = [],
  ) {}

  /** Entra a una cuenta, o la crea con `create`. */
  login(name: string, password: string | undefined, create: boolean): AccountResult {
    const validation = validateCharacterName(name);
    if (!validation.ok) return { ok: false, reason: 'El nombre de la cuenta no es válido.' };
    if (this.hasher && password === undefined)
      return { ok: false, reason: 'Escribí la contraseña.' };
    const existing = this.find(validation.name) ?? this.adoptLegacy(validation.name, password);
    if (existing) {
      if (!this.checkPassword(existing.passwordHash, password))
        return { ok: false, reason: 'Contraseña incorrecta.' };
      return { ok: true, account: this.withTestCharacter(existing) };
    }
    if (
      this.characters.find(validation.name)?.account === undefined &&
      this.characters.find(validation.name)
    )
      return {
        ok: false,
        reason: 'Ya hay un personaje con ese nombre: entrá con su contraseña.',
      };
    if (!create && this.hasher)
      return { ok: false, reason: 'No existe esa cuenta. Creala primero.' };
    if (this.hasher) {
      const strength = validatePassword(password ?? '');
      if (!strength.ok) return strength;
    }
    const account: AccountRecord = {
      name: validation.name,
      passwordHash: this.hasher && password !== undefined ? this.hasher.hash(password) : null,
      characters: [],
    };
    this.save(account);
    return { ok: true, account: this.withTestCharacter(account) };
  }

  /** La lista de personajes para la pantalla de elegir. */
  describe(account: AccountRecord): AccountMessage {
    const current = this.find(account.name) ?? account;
    return {
      type: 'account',
      name: current.name,
      slots: ACCOUNT_CHARACTERS,
      characters: current.characters.map((name) => {
        const saved = this.characters.find(name);
        const topSkills = saved
          ? [...SKILL_KEYS]
              .map((skill) => ({ skill, value: saved.skills[skill] }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 3)
          : [];
        return {
          name: saved?.name ?? name,
          appearance: saved?.appearance ?? DEFAULT_APPEARANCE,
          topSkills,
        };
      }),
    };
  }

  /** Crea un personaje en la cuenta y entra al mundo con él. */
  createCharacter(account: AccountRecord, creation: CharacterCreation): JoinWorldResult {
    const current = this.find(account.name) ?? account;
    if (current.characters.length >= ACCOUNT_CHARACTERS)
      return {
        ok: false,
        reason: `La cuenta ya tiene ${ACCOUNT_CHARACTERS} personajes: borrá uno para crear otro.`,
      };
    if (this.characters.find(creation.name) || this.ownedByAnyone(creation.name))
      return { ok: false, reason: 'Ya existe un personaje con ese nombre.' };
    const result = this.joinWorld.create(creation, current);
    if (result.ok) this.save({ ...current, characters: [...current.characters, creation.name] });
    return result;
  }

  /** Entra al mundo con uno de los personajes de la cuenta. */
  play(account: AccountRecord, name: string): JoinWorldResult {
    const current = this.find(account.name) ?? account;
    const owned = current.characters.find((c) => c.toLowerCase() === name.toLowerCase());
    if (!owned) return { ok: false, reason: 'Ese personaje no es de esta cuenta.' };
    return this.joinWorld.enter(owned, current);
  }

  /** Borra para siempre un personaje de la cuenta (no puede estar en el mundo). */
  deleteCharacter(account: AccountRecord, name: string, inWorld: boolean): AccountResult {
    const current = this.find(account.name) ?? account;
    const owned = current.characters.find((c) => c.toLowerCase() === name.toLowerCase());
    if (!owned) return { ok: false, reason: 'Ese personaje no es de esta cuenta.' };
    if (inWorld) return { ok: false, reason: 'Ese personaje está en el mundo.' };
    this.characters.remove(owned);
    const updated = { ...current, characters: current.characters.filter((c) => c !== owned) };
    this.save(updated);
    return { ok: true, account: updated };
  }

  private find(name: string): AccountRecord | undefined {
    return this.store ? this.store.find(name) : this.memory.get(name.toLowerCase());
  }

  private save(account: AccountRecord): void {
    if (this.store) this.store.save(account);
    else this.memory.set(account.name.toLowerCase(), account);
  }

  private checkPassword(hash: string | null, password: string | undefined): boolean {
    if (!this.hasher) return true;
    return hash !== null && password !== undefined && this.hasher.verify(password, hash);
  }

  /** ¿Algún personaje guardado pertenece ya a otra cuenta con ese nombre? */
  private ownedByAnyone(name: string): boolean {
    return this.characters.find(name)?.account !== undefined;
  }

  /**
   * Un personaje de antes de las cuentas, con el mismo nombre y contraseña:
   * su cuenta se crea con él adentro.
   */
  private adoptLegacy(name: string, password: string | undefined): AccountRecord | undefined {
    const saved = this.characters.find(name);
    if (!saved || saved.account !== undefined) return undefined;
    if (!this.checkPassword(saved.passwordHash, password)) return undefined;
    const account: AccountRecord = {
      name: saved.name,
      passwordHash: saved.passwordHash,
      characters: [saved.name],
    };
    this.save(account);
    return account;
  }

  /** La cuenta de un personaje de prueba trae ese personaje (se crea al máximo al entrar). */
  private withTestCharacter(account: AccountRecord): AccountRecord {
    const isTest = this.testCharacters.some((t) => t.toLowerCase() === account.name.toLowerCase());
    if (!isTest || account.characters.length > 0) return account;
    const updated = { ...account, characters: [account.name] };
    this.save(updated);
    return updated;
  }
}
