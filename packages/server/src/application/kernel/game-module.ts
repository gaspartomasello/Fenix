import type { ClientMessage, EntityId } from '@fenix/shared/protocol/messages';
import type { Player } from '../../domain/player';
import type { GameKernel } from './game-kernel';

/** Pedidos de antes de entrar al mundo: los atiende la sesión, no un módulo. */
export type SessionMessage = 'join' | 'login' | 'createCharacter' | 'play' | 'deleteCharacter';

/** Pedidos de un jugador que ya está en el mundo. */
export type GameMessage = Exclude<ClientMessage['type'], SessionMessage>;

/** Qué hace un módulo con cada pedido que atiende. */
export type MessageHandlers = {
  readonly [T in GameMessage]?: (
    playerId: EntityId,
    message: Extract<ClientMessage, { type: T }>,
  ) => void;
};

/**
 * Una funcionalidad del juego enchufada al núcleo. Declara qué pedidos
 * atiende y en qué momentos quiere actuar; lo demás (servicios que da o
 * usa, eventos que escucha, reglas, usos de objetos) lo registra en el
 * núcleo al armarse. No conoce a ningún otro módulo.
 */
export interface GameModule {
  /** Para los avisos de error del armado (dos módulos atendiendo lo mismo). */
  readonly name: string;
  readonly handles?: MessageHandlers;
  /** Cada vuelta del mundo. */
  tick?(now: number): void;
  /** El jugador terminó de entrar (ya tiene su conexión). */
  joined?(player: Player): void;
  /** El jugador se va: antes de guardarlo. */
  leaving?(player: Player): void;
  /** El jugador se fue: ya está guardado. */
  left?(playerId: EntityId): void;
  /** Guardar ya lo que el módulo guarda por su cuenta (al apagar el servidor). */
  saveAll?(): void;
}

/** Cómo se arma un módulo: recibe el núcleo y devuelve el módulo listo. */
export type ModuleFactory = (kernel: GameKernel) => GameModule;
