import { describe, expect, it } from 'vitest';
import { AVATARES_EMOJI, emojiDeAvatar, validarEdicion, validarPerfil } from '../validation/usuario';

const base = { nombres: 'Ana', apellidos: 'Pérez', username: 'ana_perez' };

describe('US-04 · avatar del selector', () => {
  it('acepta en el registro los emojis del selector y los enlaces https', () => {
    for (const emoji of AVATARES_EMOJI) {
      const r = validarPerfil({ ...base, avatarUrl: emoji });
      expect(r.ok && r.datos.avatarUrl).toBe(emoji);
    }
    const foto = validarPerfil({ ...base, avatarUrl: 'https://foto.google/ana.png' });
    expect(foto.ok && foto.datos.avatarUrl).toBe('https://foto.google/ana.png');
  });

  it('rechaza emojis fuera de la lista y enlaces que no son https', () => {
    expect(validarPerfil({ ...base, avatarUrl: '🍕' }).ok).toBe(false);
    expect(validarPerfil({ ...base, avatarUrl: 'http://x.com/a.png' }).ok).toBe(false);
    expect(validarEdicion({ avatarUrl: 'javascript:alert(1)' }, 'password').ok).toBe(false);
  });

  it('trata ⚡ con y sin selector de variación como el mismo avatar', () => {
    expect(emojiDeAvatar('⚡️')).toBe('⚡');
    expect(emojiDeAvatar('  🎧 ')).toBe('🎧');
    expect(emojiDeAvatar('cohete')).toBeNull();
  });
});
