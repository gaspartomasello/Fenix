import { describe, expect, it } from 'vitest';
import { Fidgets, attackFrame, castFrame, stepFrame } from './animation';

describe('animación de personajes', () => {
  it('cada arma tiene su gesto, con preparación, golpe y seguida', () => {
    expect(attackFrame('slash', 0)).toBe('slash-0');
    expect(attackFrame('slash', 0.5)).toBe('slash-1');
    expect(attackFrame('slash', 0.99)).toBe('slash-2');
    expect(attackFrame('thrust', 0.6)).toBe('thrust-1');
    expect(attackFrame('punch', 0.3)).toBe('punch-1');
  });

  it('correr usa su propio ciclo, distinto de caminar', () => {
    expect(stepFrame(0, 0.2, false)).toBe(0);
    // Ocho cuadros por ciclo: cada paso recorre cuatro.
    expect(stepFrame(0, 0.6, false)).toBe(2);
    expect(stepFrame(1, 0.7, false)).toBe(6);
    expect(stepFrame(0, 0.2, true)).toBe('run-0');
    expect(stepFrame(1, 0.7, true)).toBe('run-6');
  });

  it('al lanzar un hechizo las manos suben y bajan', () => {
    expect(castFrame(0)).toBe('cast-0');
    expect(castFrame(300)).toBe('cast-1');
  });

  it('los gestos de reposo llegan cada tanto, no seguidos, y se cortan al moverse', () => {
    const fidgets = new Fidgets(0, () => 0);
    expect(fidgets.frame(1000, true)).toBeNull();
    // Con el azar en 0, el primero llega a los 3 s y dura menos de 2 s.
    expect(fidgets.frame(3000, true)).toBe('shrug-0');
    expect(fidgets.frame(4000, true)).toBe('shrug-1');
    expect(fidgets.frame(4900, true)).toBeNull();
    // El siguiente no llega antes de 9 s, y es el otro gesto.
    expect(fidgets.frame(10_000, true)).toBeNull();
    expect(fidgets.frame(13_900, true)).toBe('stance-0');
    // Si se mueve, el gesto se corta.
    expect(fidgets.frame(14_500, false)).toBeNull();
    expect(fidgets.frame(14_600, true)).toBeNull();
  });
});
