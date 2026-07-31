import { describe, expect, it } from 'vitest';

import { buildMatchKey, normalizeArtist, normalizeTitle } from './normalize';

describe('normalizeTitle', () => {
  it('met en minuscules et supprime les accents', () => {
    expect(normalizeTitle('Björk — Jóga')).toBe('bjork joga');
  });

  it('supprime la ponctuation', () => {
    expect(normalizeTitle("Don't Stop Me Now!")).toBe('dont stop me now');
  });

  describe('mentions éditoriales', () => {
    const editorialCases: ReadonlyArray<[string, string]> = [
      ['Bohemian Rhapsody - Remastered 2011', 'bohemian rhapsody'],
      ['Bohemian Rhapsody (Remastered)', 'bohemian rhapsody'],
      ['Come Together (2019 Remaster)', 'come together'],
      ['Smells Like Teen Spirit - Radio Edit', 'smells like teen spirit'],
      ['Hey Jude (Single Version)', 'hey jude'],
      ['Creep (Album Version)', 'creep'],
      ['Runaway (Deluxe Edition)', 'runaway'],
      ['Levitating (Explicit)', 'levitating'],
      ['Rocket Man (1972 Version)', 'rocket man'],
    ];

    it.each(editorialCases)('normalise « %s »', (input, expected) => {
      expect(normalizeTitle(input)).toBe(expected);
    });
  });

  describe('mentions de featuring', () => {
    it('supprime « feat. »', () => {
      expect(normalizeTitle('Stay (feat. Justin Bieber)')).toBe('stay');
    });

    it('supprime « ft »', () => {
      expect(normalizeTitle('Sunflower ft Swae Lee')).toBe('sunflower');
    });

    it('supprime « featuring »', () => {
      expect(normalizeTitle('Umbrella featuring Jay-Z')).toBe('umbrella');
    });

    it('rapproche deux notations différentes du même titre', () => {
      expect(normalizeTitle('Stay (feat. Justin Bieber)')).toBe(normalizeTitle('Stay'));
    });
  });

  describe('variantes à préserver', () => {
    /**
     * Ces mentions changent l'enregistrement lui-même : les fusionner
     * produirait des faux positifs, bien plus gênants qu'un doublon manqué.
     */
    it('conserve la mention live', () => {
      expect(normalizeTitle('Bohemian Rhapsody (Live at Wembley)')).not.toBe(
        normalizeTitle('Bohemian Rhapsody'),
      );
    });

    it('conserve la mention acoustic', () => {
      expect(normalizeTitle('Layla (Acoustic)')).not.toBe(normalizeTitle('Layla'));
    });

    it('conserve la mention remix', () => {
      expect(normalizeTitle('One More Time (Remix)')).not.toBe(
        normalizeTitle('One More Time'),
      );
    });
  });

  it('reste stable si le titre est déjà normalisé', () => {
    expect(normalizeTitle(normalizeTitle('Bohemian Rhapsody - Remastered 2011'))).toBe(
      'bohemian rhapsody',
    );
  });

  it('gère une chaîne vide sans lever', () => {
    expect(normalizeTitle('')).toBe('');
  });
});

describe('normalizeArtist', () => {
  it('normalise casse et accents', () => {
    expect(normalizeArtist('Sigur Rós')).toBe('sigur ros');
  });

  it('supprime la ponctuation', () => {
    expect(normalizeArtist('Guns N’ Roses')).toBe('guns n roses');
  });
});

describe('buildMatchKey', () => {
  it('rapproche deux éditions du même morceau', () => {
    const remastered = buildMatchKey('Bohemian Rhapsody - Remastered 2011', ['Queen']);
    const original = buildMatchKey('Bohemian Rhapsody', ['Queen']);

    expect(remastered).toBe(original);
  });

  it('distingue deux artistes différents pour un même titre', () => {
    expect(buildMatchKey('Hurt', ['Johnny Cash'])).not.toBe(
      buildMatchKey('Hurt', ['Nine Inch Nails']),
    );
  });

  it('ignore les artistes secondaires', () => {
    expect(buildMatchKey('Stay', ['The Kid LAROI', 'Justin Bieber'])).toBe(
      buildMatchKey('Stay', ['The Kid LAROI']),
    );
  });

  it('accepte une liste d’artistes vide', () => {
    expect(buildMatchKey('Untitled', [])).toBe('untitled::');
  });
});
