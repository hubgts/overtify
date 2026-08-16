import { describe, expect, it } from 'vitest';

import { pickCoverImageUrl, toPlaylistTrackDtos, toPlaylistSummaryDto } from './mappers.js';
import type { SpotifyPlaylist, SpotifyPlaylistTrackItem, SpotifyTrack } from '../types/spotify.js';

/**
 * Tests des conversions Spotify → DTO.
 *
 * Ils portent principalement sur la tolérance aux variations de forme de
 * l'API : c'est là que se sont produites les deux régressions rencontrées
 * (compteur `tracks` vs `items`, piste `track` vs `item`).
 */

function makeTrack(overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
  return {
    id: 'abc',
    uri: 'spotify:track:abc',
    name: 'Creep',
    duration_ms: 238_000,
    is_local: false,
    artists: [{ id: 'a1', name: 'Radiohead' }],
    album: { id: 'al1', name: 'Pablo Honey', images: [] },
    ...overrides,
  };
}

describe('toPlaylistTrackDtos', () => {
  /**
   * Régression : `/playlists/{id}/items` imbrique la piste sous `item`.
   * Ne lire que `track` produisait une playlist vide malgré une réponse 200.
   */
  it('lit la piste sous `item` (format courant)', () => {
    const entries: SpotifyPlaylistTrackItem[] = [
      { added_at: '2024-01-01T00:00:00Z', item: makeTrack() },
    ];

    const tracks = toPlaylistTrackDtos(entries);

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ name: 'Creep', artists: ['Radiohead'], position: 0 });
  });

  it('lit la piste sous `track` (format déprécié)', () => {
    const entries: SpotifyPlaylistTrackItem[] = [
      { added_at: null, track: makeTrack({ name: 'Karma Police' }) },
    ];

    const tracks = toPlaylistTrackDtos(entries);

    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.name).toBe('Karma Police');
  });

  it('donne la priorité à `item` quand les deux sont présents', () => {
    const entries: SpotifyPlaylistTrackItem[] = [
      {
        item: makeTrack({ name: 'Version courante' }),
        track: makeTrack({ name: 'Version dépréciée' }),
      },
    ];

    expect(toPlaylistTrackDtos(entries)[0]?.name).toBe('Version courante');
  });

  it('écarte les entrées sans piste', () => {
    const entries: SpotifyPlaylistTrackItem[] = [
      { item: makeTrack() },
      { item: null },
      { added_at: '2024-01-01T00:00:00Z' },
    ];

    expect(toPlaylistTrackDtos(entries)).toHaveLength(1);
  });

  it('écarte les pistes sans URI, non supprimables via l’API', () => {
    const entries = [
      { item: makeTrack() },
      { item: { ...makeTrack(), uri: '' } },
    ] as SpotifyPlaylistTrackItem[];

    expect(toPlaylistTrackDtos(entries)).toHaveLength(1);
  });

  /**
   * La position est l'index réel dans la playlist, calculé avant tout
   * filtrage : c'est la coordonnée qu'attend Spotify pour supprimer une
   * occurrence précise.
   */
  it('conserve la position d’origine malgré les entrées écartées', () => {
    const entries: SpotifyPlaylistTrackItem[] = [
      { item: makeTrack({ uri: 'spotify:track:a' }) },
      { item: null },
      { item: makeTrack({ uri: 'spotify:track:c' }) },
    ];

    const tracks = toPlaylistTrackDtos(entries);

    expect(tracks.map((track) => track.position)).toEqual([0, 2]);
  });
});

describe('choix de la résolution d’image', () => {
  /**
   * Régression : une seule taille était retenue pour tous les usages — la plus
   * petite. La pochette d'en-tête (160 px) affichait donc une image de 64 px,
   * visiblement floue.
   */
  const images = [
    { url: 'https://img/640.jpg', width: 640, height: 640 },
    { url: 'https://img/300.jpg', width: 300, height: 300 },
    { url: 'https://img/64.jpg', width: 64, height: 64 },
  ];

  it('prend une image nette pour la grande pochette (160 px)', () => {
    // 160 px d'affichage → 320 px minimum en haute densité → 640 convient.
    expect(pickCoverImageUrl(images)).toBe('https://img/640.jpg');
  });

  it('prend une image intermédiaire pour une vignette (48 px)', () => {
    // 48 px → 96 px minimum : la 300 est la plus petite qui convienne.
    const playlist = {
      id: 'pl1',
      name: 'P',
      snapshot_id: 's',
      owner: { id: 'moi', display_name: 'Moi' },
      images,
    } as SpotifyPlaylist;

    expect(toPlaylistSummaryDto(playlist).imageUrl).toBe('https://img/300.jpg');
  });

  it('se rabat sur la plus grande quand aucune n’est assez grande', () => {
    expect(pickCoverImageUrl([{ url: 'https://img/64.jpg', width: 64, height: 64 }])).toBe(
      'https://img/64.jpg',
    );
  });

  it('accepte des dimensions nulles', () => {
    expect(pickCoverImageUrl([{ url: 'https://img/x.jpg', width: null, height: null }])).toBe(
      'https://img/x.jpg',
    );
  });

  it('retourne null sans image', () => {
    expect(pickCoverImageUrl([])).toBeNull();
    expect(pickCoverImageUrl(null)).toBeNull();
  });
});

describe('toPlaylistSummaryDto', () => {
  function makePlaylist(overrides: Partial<SpotifyPlaylist> = {}): SpotifyPlaylist {
    return {
      id: 'pl1',
      name: 'Ma playlist',
      snapshot_id: 'snap1',
      owner: { id: 'moi', display_name: 'Moi' },
      ...overrides,
    };
  }

  /** Régression : `/me/playlists` expose le compteur sous `items`. */
  it('lit le compteur sous `tracks.total`', () => {
    expect(toPlaylistSummaryDto(makePlaylist({ tracks: { total: 12 } })).trackCount).toBe(12);
  });

  it('lit le compteur sous `items.total`', () => {
    expect(toPlaylistSummaryDto(makePlaylist({ items: { total: 7 } })).trackCount).toBe(7);
  });

  it('compte les éléments quand `items` est un tableau', () => {
    expect(toPlaylistSummaryDto(makePlaylist({ items: [{}, {}] })).trackCount).toBe(2);
  });

  it('retourne 0 quand aucun compteur n’est fourni', () => {
    expect(toPlaylistSummaryDto(makePlaylist()).trackCount).toBe(0);
  });

  it('se rabat sur l’identifiant quand le nom du propriétaire manque', () => {
    const playlist = makePlaylist({ owner: { id: 'moi', display_name: null } });

    expect(toPlaylistSummaryDto(playlist).ownerName).toBe('moi');
  });
});

describe('normalisation de la description', () => {
  function makePlaylist(description: string | null | undefined): SpotifyPlaylist {
    return {
      id: 'pl1',
      name: 'P',
      snapshot_id: 's',
      owner: { id: 'moi', display_name: 'Moi' },
      description,
    } as SpotifyPlaylist;
  }

  /**
   * Régression : créée sans description, Spotify stocke littéralement la
   * chaîne « null » et la renvoie telle quelle — elle s'affichait sous le
   * titre de la playlist.
   */
  it('traite la chaîne « null » comme une absence de description', () => {
    expect(toPlaylistSummaryDto(makePlaylist('null')).description).toBeNull();
  });

  it('traite une chaîne vide comme une absence', () => {
    expect(toPlaylistSummaryDto(makePlaylist('   ')).description).toBeNull();
  });

  it('conserve une description réelle', () => {
    expect(toPlaylistSummaryDto(makePlaylist('Mes favoris')).description).toBe('Mes favoris');
  });

  it('accepte une description absente', () => {
    expect(toPlaylistSummaryDto(makePlaylist(null)).description).toBeNull();
    expect(toPlaylistSummaryDto(makePlaylist(undefined)).description).toBeNull();
  });
});
