/**
 * Les « Titres likés » côté frontend.
 *
 * Cette collection est présentée comme une playlist, mais s'en distingue sur
 * deux points qui changent le comportement de l'interface :
 *
 *  - un morceau ne peut y figurer qu'une seule fois, donc **aucun doublon
 *    strict n'est possible** — seules les rééditions et remasters peuvent s'y
 *    retrouver en double ;
 *  - la suppression se fait par identifiant, sans notion de position ni de
 *    snapshot.
 *
 * L'identifiant doit rester identique à `LIKED_SONGS_ID` côté backend
 * (`backend/src/config/spotify.ts`).
 */
export const LIKED_SONGS_ID = 'liked-songs';

export function isLikedSongs(playlistId: string | undefined): boolean {
  return playlistId === LIKED_SONGS_ID;
}
