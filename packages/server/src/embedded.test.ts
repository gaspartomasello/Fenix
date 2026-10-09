import {
  DEFAULT_APPEARANCE,
  Direction,
  decodeServerMessage,
  type ServerMessage,
} from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { createEmbeddedServer } from './embedded';

function inbox(): { messages: ServerMessage[]; deliver: (data: string) => void } {
  const messages: ServerMessage[] = [];
  return {
    messages,
    deliver: (data) => {
      const decoded = decodeServerMessage(data);
      if (decoded.ok) messages.push(decoded.message);
    },
  };
}

describe('createEmbeddedServer', () => {
  it('permite jugar sin red: ingresar, moverse y hablar', () => {
    const server = createEmbeddedServer({ mapSize: 48 });
    const client = inbox();
    const connection = server.connect(client.deliver);

    connection.send({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
    const welcome = client.messages.find((m) => m.type === 'welcome');
    expect(welcome).toBeDefined();

    connection.send({ type: 'move', direction: Direction.North, mode: 'walk', seq: 1 });
    connection.send({ type: 'chat', text: 'Hola' });
    expect(client.messages.map((m) => m.type)).toEqual(expect.arrayContaining(['welcome', 'chat']));
    expect(client.messages.some((m) => m.type === 'moveAck' || m.type === 'moveRejected')).toBe(
      true,
    );
  });

  it('valida los mensajes igual que el servidor en red', () => {
    const server = createEmbeddedServer({ mapSize: 48 });
    const client = inbox();
    server
      .connect(client.deliver)
      .send({ type: 'join', name: '!!', appearance: DEFAULT_APPEARANCE });
    expect(client.messages[0]?.type).toBe('joinRejected');
  });
});
