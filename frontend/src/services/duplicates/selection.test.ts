import { describe, expect, it } from 'vitest';

import { detectDuplicates } from './detectDuplicates';
import {
  buildInitialSelection,
  isGroupFullySelected,
  keepOnly,
  toRemovalPayload,
  toggleGroup,
  toggleSelection,
} from './selection';
import type { PlaylistTrackDto } from '../../types/api';

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
    addedAt: null,
    ...overrides,
  };
}

const exactDuplicates = [
  makeTrack({ position: 0, uri: 'spotify:track:a' }),
  makeTrack({ position: 4, uri: 'spotify:track:a' }),
  makeTrack({ position: 9, uri: 'spotify:track:a' }),
];

const probableDuplicates = [
  makeTrack({ position: 0, uri: 'spotify:track:orig', name: 'Creep', artists: ['Radiohead'] }),
  makeTrack({
    position: 3,
    uri: 'spotify:track:remaster',
    name: 'Creep - Remastered',
    artists: ['Radiohead'],
  }),
];

describe('buildInitialSelection', () => {
  it('pré-coche les occurrences exactes en trop, en gardant la première', () => {
    const selection = buildInitialSelection(detectDuplicates(exactDuplicates));

    expect(selection.has(0)).toBe(false);
    expect([...selection].sort((a, b) => a - b)).toEqual([4, 9]);
  });

  it('ne pré-coche jamais un doublon probable', () => {
    // Garde-fou : aucune suppression heuristique sans geste explicite.
    const selection = buildInitialSelection(detectDuplicates(probableDuplicates));

    expect(selection.size).toBe(0);
  });
});

describe('toggleSelection', () => {
  it('ajoute une position absente', () => {
    expect([...toggleSelection(new Set([1]), 5)]).toContain(5);
  });

  it('retire une position présente', () => {
    expect(toggleSelection(new Set([1, 5]), 5).has(5)).toBe(false);
  });

  it('ne modifie pas la sélection d’origine', () => {
    const original = new Set([1]);
    toggleSelection(original, 2);

    expect(original.size).toBe(1);
  });
});

describe('toggleGroup', () => {
  const report = detectDuplicates(exactDuplicates);
  const group = report.exactGroups[0];

  it('coche toutes les occurrences sauf la première', () => {
    if (group === undefined) throw new Error('groupe attendu');
    const selection = toggleGroup(new Set(), group, true);

    expect([...selection].sort((a, b) => a - b)).toEqual([4, 9]);
  });

  it('décoche tout le groupe', () => {
    if (group === undefined) throw new Error('groupe attendu');
    const selection = toggleGroup(new Set([4, 9]), group, false);

    expect(selection.size).toBe(0);
  });
});

describe('keepOnly', () => {
  it('marque toutes les occurrences sauf celle à conserver', () => {
    const report = detectDuplicates(exactDuplicates);
    const group = report.exactGroups[0];
    if (group === undefined) throw new Error('groupe attendu');

    const selection = keepOnly(new Set(), group, 4);

    expect([...selection].sort((a, b) => a - b)).toEqual([0, 9]);
  });

  it('permet de conserver la version remasterisée plutôt que l’originale', () => {
    const report = detectDuplicates(probableDuplicates);
    const group = report.probableGroups[0];
    if (group === undefined) throw new Error('groupe attendu');

    const selection = keepOnly(new Set(), group, 3);

    expect([...selection]).toEqual([0]);
  });
});

describe('isGroupFullySelected', () => {
  it('est faux tant qu’une occurrence est conservée', () => {
    const report = detectDuplicates(exactDuplicates);
    const group = report.exactGroups[0];
    if (group === undefined) throw new Error('groupe attendu');

    expect(isGroupFullySelected(new Set([4, 9]), group)).toBe(false);
    expect(isGroupFullySelected(new Set([0, 4, 9]), group)).toBe(true);
  });
});

describe('toRemovalPayload', () => {
  it('associe chaque position à l’URI correspondant', () => {
    const report = detectDuplicates(probableDuplicates);
    const payload = toRemovalPayload(report, new Set([3]));

    expect(payload).toEqual([{ uri: 'spotify:track:remaster', position: 3 }]);
  });

  it('retourne une liste vide si rien n’est sélectionné', () => {
    expect(toRemovalPayload(detectDuplicates(exactDuplicates), new Set())).toEqual([]);
  });

  it('ne produit pas de position en double', () => {
    // Une position peut apparaître dans un groupe exact ET un groupe probable.
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

    const payload = toRemovalPayload(report, new Set([0, 1, 2]));
    const positions = payload.map((removal) => removal.position);

    expect(new Set(positions).size).toBe(positions.length);
  });
});
