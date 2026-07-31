import { describe, expect, it } from 'vitest';

import { countRemovableTracks, detectDuplicates, hasDuplicates } from './detectDuplicates';
import type { PlaylistTrackDto } from '../../types/api';

/** Fabrique un morceau de playlist, avec des valeurs par défaut réalistes. */
function makeTrack(overrides: Partial<PlaylistTrackDto> & { position: number }): PlaylistTrackDto {
  return {
    id: 'abc123',
    uri: 'spotify:track:abc123',
    name: 'Un titre',
    artists: ['Un artiste'],
    albumName: 'Un album',
    albumImageUrl: null,
    durationMs: 210_000,
    isLocal: false,
    addedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('detectDuplicates', () => {
  it('ne signale rien sur une playlist sans doublon', () => {
    const report = detectDuplicates([
      makeTrack({ position: 0, uri: 'spotify:track:a', name: 'A' }),
      makeTrack({ position: 1, uri: 'spotify:track:b', name: 'B' }),
    ]);

    expect(hasDuplicates(report)).toBe(false);
    expect(countRemovableTracks(report)).toBe(0);
  });

  it('gère une playlist vide', () => {
    expect(hasDuplicates(detectDuplicates([]))).toBe(false);
  });

  describe('doublons exacts', () => {
    it('regroupe les occurrences du même URI', () => {
      const report = detectDuplicates([
        makeTrack({ position: 0, uri: 'spotify:track:a' }),
        makeTrack({ position: 3, uri: 'spotify:track:a' }),
        makeTrack({ position: 7, uri: 'spotify:track:a' }),
        makeTrack({ position: 1, uri: 'spotify:track:b' }),
      ]);

      expect(report.exactGroups).toHaveLength(1);
      expect(report.exactGroups[0]?.tracks.map((track) => track.position)).toEqual([0, 3, 7]);
    });

    it('trie les occurrences par position croissante', () => {
      const report = detectDuplicates([
        makeTrack({ position: 9, uri: 'spotify:track:a' }),
        makeTrack({ position: 2, uri: 'spotify:track:a' }),
      ]);

      expect(report.exactGroups[0]?.tracks[0]?.position).toBe(2);
    });

    it('compte une suppression de moins que le nombre d’occurrences', () => {
      const report = detectDuplicates([
        makeTrack({ position: 0, uri: 'spotify:track:a' }),
        makeTrack({ position: 1, uri: 'spotify:track:a' }),
        makeTrack({ position: 2, uri: 'spotify:track:a' }),
      ]);

      expect(countRemovableTracks(report)).toBe(2);
    });
  });

  describe('doublons probables', () => {
    it('rapproche un titre et sa version remasterisée', () => {
      const report = detectDuplicates([
        makeTrack({
          position: 0,
          uri: 'spotify:track:original',
          name: 'Bohemian Rhapsody',
          artists: ['Queen'],
        }),
        makeTrack({
          position: 5,
          uri: 'spotify:track:remaster',
          name: 'Bohemian Rhapsody - Remastered 2011',
          artists: ['Queen'],
        }),
      ]);

      expect(report.exactGroups).toHaveLength(0);
      expect(report.probableGroups).toHaveLength(1);
      expect(report.probableGroups[0]?.tracks).toHaveLength(2);
    });

    it('ne rapproche pas deux artistes différents', () => {
      const report = detectDuplicates([
        makeTrack({ position: 0, uri: 'spotify:track:a', name: 'Hurt', artists: ['Johnny Cash'] }),
        makeTrack({
          position: 1,
          uri: 'spotify:track:b',
          name: 'Hurt',
          artists: ['Nine Inch Nails'],
        }),
      ]);

      expect(hasDuplicates(report)).toBe(false);
    });

    it('ne rapproche pas une version live de la version studio', () => {
      const report = detectDuplicates([
        makeTrack({ position: 0, uri: 'spotify:track:studio', name: 'Creep', artists: ['Radiohead'] }),
        makeTrack({
          position: 1,
          uri: 'spotify:track:live',
          name: 'Creep (Live at Glastonbury)',
          artists: ['Radiohead'],
        }),
      ]);

      expect(hasDuplicates(report)).toBe(false);
    });

    it('exige au moins deux URI distincts', () => {
      // Même URI répété : relève du dédoublonnage exact, pas du probable.
      const report = detectDuplicates([
        makeTrack({ position: 0, uri: 'spotify:track:a' }),
        makeTrack({ position: 1, uri: 'spotify:track:a' }),
      ]);

      expect(report.probableGroups).toHaveLength(0);
      expect(report.exactGroups).toHaveLength(1);
    });
  });

  describe('interaction entre les deux niveaux', () => {
    /**
     * Cas limite important : un morceau à la fois répété à l'identique ET
     * présent dans une autre édition. Les occurrences déjà couvertes par le
     * groupe exact ne doivent pas réapparaître dans le groupe probable, sinon
     * l'utilisateur verrait le même morceau proposé deux fois.
     */
    it('ne présente pas deux fois la même occurrence', () => {
      const report = detectDuplicates([
        makeTrack({ position: 0, uri: 'spotify:track:orig', name: 'Creep', artists: ['Radiohead'] }),
        makeTrack({ position: 1, uri: 'spotify:track:orig', name: 'Creep', artists: ['Radiohead'] }),
        makeTrack({
          position: 2,
          uri: 'spotify:track:remaster',
          name: 'Creep - Remastered',
          artists: ['Radiohead'],
        }),
      ]);

      expect(report.exactGroups).toHaveLength(1);
      expect(report.exactGroups[0]?.tracks.map((t) => t.position)).toEqual([0, 1]);

      // Le groupe probable ne retient que la 1re occurrence de chaque URI.
      expect(report.probableGroups).toHaveLength(1);
      expect(report.probableGroups[0]?.tracks.map((t) => t.position)).toEqual([0, 2]);

      const allPositions = [
        ...report.exactGroups.flatMap((g) => g.tracks.map((t) => t.position)),
        ...report.probableGroups.flatMap((g) => g.tracks.map((t) => t.position)),
      ];
      // La position 1 n'apparaît que dans le groupe exact.
      expect(allPositions.filter((position) => position === 1)).toHaveLength(1);
    });
  });

  describe('morceaux locaux', () => {
    it('ignore les fichiers locaux, non gérables via l’API', () => {
      const report = detectDuplicates([
        makeTrack({ position: 0, uri: 'spotify:local:x', isLocal: true }),
        makeTrack({ position: 1, uri: 'spotify:local:x', isLocal: true }),
      ]);

      expect(hasDuplicates(report)).toBe(false);
    });
  });
});
