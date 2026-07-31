import { describe, expect, it } from 'vitest';

import { detectDuplicates } from './detectDuplicates';
import { buildInitialSelection } from './selection';
import { buildDedupeSummary } from './summary';
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

const tripleDuplicate = [
  makeTrack({ position: 0, uri: 'spotify:track:a', name: 'Creep', artists: ['Radiohead'] }),
  makeTrack({ position: 4, uri: 'spotify:track:a', name: 'Creep', artists: ['Radiohead'] }),
  makeTrack({ position: 9, uri: 'spotify:track:a', name: 'Creep', artists: ['Radiohead'] }),
];

describe('buildDedupeSummary', () => {
  it('résume un groupe avec le nombre d’occurrences retirées', () => {
    const report = detectDuplicates(tripleDuplicate);
    const summary = buildDedupeSummary(report, buildInitialSelection(report));

    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0]).toMatchObject({
      title: 'Creep',
      artist: 'Radiohead',
      kind: 'exact',
      removedCount: 2,
      removesAllCopies: false,
    });
    expect(summary.totalRemovals).toBe(2);
  });

  it('omet les groupes dont rien n’est sélectionné', () => {
    const report = detectDuplicates(tripleDuplicate);
    const summary = buildDedupeSummary(report, new Set());

    expect(summary.lines).toHaveLength(0);
    expect(summary.totalRemovals).toBe(0);
  });

  it('signale un morceau qui disparaîtrait entièrement', () => {
    const report = detectDuplicates(tripleDuplicate);
    // Les trois occurrences cochées : plus rien ne resterait.
    const summary = buildDedupeSummary(report, new Set([0, 4, 9]));

    expect(summary.lines[0]?.removesAllCopies).toBe(true);
    expect(summary.fullRemovalCount).toBe(1);
  });

  it('ne signale aucune disparition quand une occurrence est conservée', () => {
    const report = detectDuplicates(tripleDuplicate);
    const summary = buildDedupeSummary(report, buildInitialSelection(report));

    expect(summary.fullRemovalCount).toBe(0);
  });

  it('agrège les groupes identiques et probables', () => {
    const report = detectDuplicates([
      makeTrack({ position: 0, uri: 'spotify:track:a', name: 'Creep', artists: ['Radiohead'] }),
      makeTrack({ position: 1, uri: 'spotify:track:a', name: 'Creep', artists: ['Radiohead'] }),
      makeTrack({ position: 2, uri: 'spotify:track:b', name: 'Karma Police', artists: ['Radiohead'] }),
      makeTrack({
        position: 3,
        uri: 'spotify:track:c',
        name: 'Karma Police - Remastered',
        artists: ['Radiohead'],
      }),
    ]);

    const summary = buildDedupeSummary(report, new Set([1, 3]));

    expect(summary.lines).toHaveLength(2);
    expect(summary.totalRemovals).toBe(2);
    expect(summary.lines.map((line) => line.kind)).toEqual(['exact', 'probable']);
  });

  it('retourne un résumé vide pour une playlist sans doublon', () => {
    const report = detectDuplicates([makeTrack({ position: 0, uri: 'spotify:track:a' })]);
    const summary = buildDedupeSummary(report, new Set());

    expect(summary).toEqual({ lines: [], totalRemovals: 0, fullRemovalCount: 0 });
  });
});
