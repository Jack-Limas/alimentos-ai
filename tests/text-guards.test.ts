import { describe, expect, it } from 'vitest';
import {
  collectNumbers,
  isGrounded,
  keepGroundedSentences,
} from '../src/shared/text/number-guard.js';
import { toPlainText } from '../src/shared/text/plain-text.js';

describe('toPlainText', () => {
  it.each([
    ['**Prioriza** la leche', 'Prioriza la leche'],
    ['__Urgente__: despachar hoy', 'Urgente: despachar hoy'],
    ['Usa el lote *más próximo* primero', 'Usa el lote más próximo primero'],
    ['## Resumen del día', 'Resumen del día'],
    ['- Despacha PED-000021\n- Revisa la leche', 'Despacha PED-000021 Revisa la leche'],
    ['1. Primero el arroz', 'Primero el arroz'],
    ['Revisa `PED-000013` 🚚✅', 'Revisa PED-000013'],
    ['Ver [detalle](https://example.com) ahora', 'Ver detalle ahora'],
    ['  varias   líneas\n\n juntas ', 'varias líneas juntas'],
  ])('cleans %j', (input, expected) => {
    expect(toPlainText(input)).toBe(expected);
  });

  it('keeps underscores and asterisks that are not formatting, like in codes', () => {
    expect(toPlainText('Lote L_261022_06 listo')).toBe('Lote L_261022_06 listo');
  });

  it('cuts long text at a word boundary with an ellipsis', () => {
    const text = toPlainText('palabra '.repeat(80), 60);
    expect(text.length).toBeLessThanOrEqual(60);
    expect(text.endsWith('…')).toBe(true);
    expect(text).not.toContain('  ');
  });
});

describe('number guard', () => {
  const allowed = collectNumbers({
    orderCode: 'PED-000123',
    dueDate: '2026-10-28',
    qty: 12.5,
    score: 87.25,
    nested: [{ available: 1200 }],
  });

  it('accepts figures from the input in any decimal style', () => {
    expect(isGrounded('Despacha 12,5 kg al PED-000123 antes del 28/10', allowed)).toBe(true);
    expect(isGrounded('Score 87.25 y 1.200 unidades', allowed)).toBe(true);
    expect(isGrounded('Sin cifras', allowed)).toBe(true);
  });

  it('rejects a figure that is not in the input', () => {
    expect(isGrounded('Despacha 13 kg', allowed)).toBe(false);
    expect(isGrounded('Ahorra un 40 % de merma', allowed)).toBe(false);
    // 12 and 25 are not figures of the input, even though 12.5 and 87.25 are.
    expect(isGrounded('Quedan 12.25 kg', allowed)).toBe(false);
    expect(isGrounded('Quedan 12 kg', allowed)).toBe(false);
  });

  it('drops only the sentences with invented figures', () => {
    expect(
      keepGroundedSentences(
        'Despacha 12,5 kg hoy. Eso ahorra 300 dólares. Revisa el PED-000123.',
        allowed,
      ),
    ).toEqual({ text: 'Despacha 12,5 kg hoy. Revisa el PED-000123.', removed: 1 });
  });
});
