import { describe, expect, it } from 'vitest';
import { readSign } from './signs';

describe('los carteles de los caminos', () => {
  it('una encrucijada: el nombre arriba y una flecha por rama, girada como la pantalla', () => {
    const sign = readSign(
      'Encrucijada de las Ánimas\nAl sureste: Cruce del Sauce Llorón\nAl norte: Paso del Cuervo',
    );
    expect(sign.title).toBe('Encrucijada de las Ánimas');
    expect(sign.lines).toEqual([
      { heading: 'Al sureste', arrow: '↓', text: 'Cruce del Sauce Llorón' },
      { heading: 'Al norte', arrow: '↗', text: 'Paso del Cuervo' },
    ]);
  });

  it('un desvío y un camino a un pueblo', () => {
    expect(readSign('Desvío al este: Torre Hueca.')).toEqual({
      title: 'Desvío',
      lines: [{ heading: 'Al este', arrow: '↘', text: 'Torre Hueca' }],
    });
    expect(readSign('Camino a Roca Alta')).toEqual({
      title: 'Cartel',
      lines: [{ heading: null, arrow: null, text: 'Camino a Roca Alta' }],
    });
  });
});
