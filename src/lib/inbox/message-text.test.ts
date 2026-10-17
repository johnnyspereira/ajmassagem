import { describe, expect, it } from 'vitest';
import { isEncodedMediaText, visibleMessageText } from './message-text';
describe('media captions', () => {
  it('hides media bytes including wrapped base64 and data URLs', () => {
    expect(visibleMessageText('/9j/' + 'AQAB'.repeat(80))).toBe('');
    expect(
      visibleMessageText('AQAB'.repeat(30) + '\n' + 'AQAB'.repeat(30))
    ).toBe('');
    expect(isEncodedMediaText('data:image/jpeg;base64,AQAB')).toBe(true);
  });
  it('preserves human captions and ordinary messages', () => {
    expect(visibleMessageText('A minha fotografia de hoje.')).toBe(
      'A minha fotografia de hoje.'
    );
    expect(visibleMessageText('Olá, podemos confirmar às 18:00?')).toContain(
      '18:00'
    );
    expect(visibleMessageText(null)).toBe('');
  });
});
