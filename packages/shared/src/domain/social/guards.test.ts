import { describe, expect, it } from 'vitest';
import { isGuardCall } from './guards';

describe('llamar a la guardia', () => {
  it('cuenta como llamado el grito corto o pedir auxilio, no preguntar por los guardias', () => {
    for (const words of ['guardia', 'guardias', 'a la guardia', 'auxilio', 'socorro me roban'])
      expect(isGuardCall(words), words).toBe(true);
    for (const words of [
      'que opinas de los guardias',
      'donde hay un guardia',
      'hola',
      'el guardia de la puerta es muy alto y fuerte',
    ])
      expect(isGuardCall(words), words).toBe(false);
  });
});
