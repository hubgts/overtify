import { describe, expect, it } from 'vitest';

import { computeLibraryStats, filterLibrary, isLiked, playlistLocations } from './filterLibrary';
import type { LibraryEntryDto } from '../../types/api';

function makeEntry(
  overrides: Partial<LibraryEntryDto> & { uri: string },
): LibraryEntryDto {
  return {
    name: 'Creep',
    artists: ['Radiohead'],
    albumName: 'Pablo Honey',
    albumImageUrl: null,
    durationMs: 238_000,
    locations: [],
    ...overrides,
  };
}

const inTwoPlaylists = makeEntry({
  uri: 'spotify:track:a',
  name: 'Partout',
  locations: [
    { playlistId: 'liked-songs', position: 0 },
    { playlistId: 'pl1', position: 3 },
    { playlistId: 'pl2', position: 7 },
  ],
});

const likedOnly = makeEntry({
  uri: 'spotify:track:b',
  name: 'Orphelin',
  locations: [{ playlistId: 'liked-songs', position: 1 }],
});

const playlistOnly = makeEntry({
  uri: 'spotify:track:c',
  name: 'Non liké',
  artists: ['Björk'],
  locations: [{ playlistId: 'pl1', position: 0 }],
});

const all = [inTwoPlaylists, likedOnly, playlistOnly];

describe('playlistLocations', () => {
  it('exclut les titres likés des emplacements playlist', () => {
    expect(playlistLocations(inTwoPlaylists)).toHaveLength(2);
    expect(playlistLocations(likedOnly)).toHaveLength(0);
  });
});

describe('isLiked', () => {
  it('détecte la présence dans les titres likés', () => {
    expect(isLiked(likedOnly)).toBe(true);
    expect(isLiked(playlistOnly)).toBe(false);
  });
});

describe('filterLibrary', () => {
  const base = { sort: 'name' as const, search: '' };

  it('retourne tout sans filtre', () => {
    expect(filterLibrary(all, { ...base, filter: 'all' })).toHaveLength(3);
  });

  it('isole les morceaux présents dans plusieurs playlists', () => {
    const result = filterLibrary(all, { ...base, filter: 'multiple' });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Partout');
  });

  /** Le cas d'usage central : likés jamais rangés nulle part. */
  it('isole les titres likés orphelins', () => {
    const result = filterLibrary(all, { ...base, filter: 'orphans' });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Orphelin');
  });

  it('isole les morceaux en playlist non likés', () => {
    const result = filterLibrary(all, { ...base, filter: 'unliked' });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Non liké');
  });

  describe('recherche', () => {
    it('trouve par titre', () => {
      expect(filterLibrary(all, { ...base, filter: 'all', search: 'orph' })).toHaveLength(1);
    });

    it('trouve par artiste', () => {
      // Deux entrées portent l'artiste par défaut Radiohead ; seule « Björk »
      // est unique, ce qui en fait un cas de recherche non ambigu.
      const result = filterLibrary(all, { ...base, filter: 'all', search: 'björk' });

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Non liké');
    });

    it('ignore les accents', () => {
      // « Björk » doit être trouvé en tapant « bjork ».
      expect(filterLibrary(all, { ...base, filter: 'all', search: 'bjork' })).toHaveLength(1);
    });

    it('ignore la casse', () => {
      expect(filterLibrary(all, { ...base, filter: 'all', search: 'PARTOUT' })).toHaveLength(1);
    });

    it('retourne une liste vide sans correspondance', () => {
      expect(filterLibrary(all, { ...base, filter: 'all', search: 'zzz' })).toHaveLength(0);
    });
  });

  describe('tri', () => {
    it('trie par nombre de playlists, du plus dispersé au moins', () => {
      const result = filterLibrary(all, { filter: 'all', sort: 'locations', search: '' });

      expect(result[0]?.name).toBe('Partout');
    });

    it('trie par titre', () => {
      const names = filterLibrary(all, { filter: 'all', sort: 'name', search: '' }).map(
        (e) => e.name,
      );

      expect(names).toEqual(['Non liké', 'Orphelin', 'Partout']);
    });

    it('ne modifie pas le tableau source', () => {
      const original = [...all];
      filterLibrary(all, { filter: 'all', sort: 'name', search: '' });

      expect(all).toEqual(original);
    });
  });
});

describe('computeLibraryStats', () => {
  it('compte chaque catégorie en une passe', () => {
    expect(computeLibraryStats(all)).toEqual({
      total: 3,
      inMultiplePlaylists: 1,
      orphans: 1,
      unliked: 1,
    });
  });

  it('gère une bibliothèque vide', () => {
    expect(computeLibraryStats([])).toEqual({
      total: 0,
      inMultiplePlaylists: 0,
      orphans: 0,
      unliked: 0,
    });
  });
});
