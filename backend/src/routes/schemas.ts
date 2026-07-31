import { z } from 'zod';

import { LIKED_SONGS_ID } from '../config/spotify.js';

/**
 * Schémas de validation partagés par les routes.
 *
 * Centralisés parce que les formats d'identifiants Spotify étaient répétés
 * dans quatre fichiers : un changement de format aurait demandé autant de
 * modifications synchronisées, avec le risque d'en oublier une.
 */

/** URI de morceau : `spotify:track:` suivi de 22 caractères base62. */
export const trackUriSchema = z
  .string()
  .regex(/^spotify:track:[A-Za-z0-9]{22}$/, 'URI de morceau invalide.');

/** Identifiant de playlist Spotify : 22 caractères base62. */
export const playlistIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9]{22}$/, 'Identifiant de playlist invalide.');

/**
 * Identifiant de playlist, ou celui réservé aux Titres likés.
 *
 * Ce dernier contient un tiret, ce qui exclut toute collision avec un
 * identifiant Spotify.
 */
export const playlistOrLikedIdSchema = z
  .string()
  .refine(
    (value) => value === LIKED_SONGS_ID || /^[A-Za-z0-9]{22}$/.test(value),
    'Identifiant de playlist invalide.',
  );
