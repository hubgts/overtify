import { describe, expect, it, beforeAll } from 'vitest';

/**
 * Test de contrat avec l'API Spotify réelle.
 *
 * Objectif : détecter qu'un endpoint utilisé par Overtify a été retiré ou
 * modifié par Spotify. Les tests simulés ne peuvent pas le voir — ils
 * reproduisent l'API telle qu'on la croit, pas telle qu'elle est.
 *
 * C'est précisément ce qui a manqué en février 2026, quand
 * `/playlists/{id}/tracks` a été remplacé par `/playlists/{id}/items`.
 *
 * Exécution : `npm run test:contract` (nécessite des identifiants Spotify).
 * Ces tests sont exclus de la suite par défaut, car ils dépendent du réseau et
 * ne doivent pas faire échouer un build hors ligne.
 */

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

const hasCredentials =
  clientId !== undefined &&
  clientId !== '' &&
  clientSecret !== undefined &&
  clientSecret !== '';

/**
 * Playlist utilisée pour sonder les endpoints.
 *
 * Configurable, car ce test vérifie la disponibilité des endpoints et non un
 * contenu particulier. La valeur par défaut est une playlist Spotify publique
 * et stable ; on n'y code pas l'identifiant d'une playlist personnelle, qui
 * serait à la fois une donnée privée et inaccessible aux autres contributeurs.
 */
const PROBE_PLAYLIST_ID = process.env.SPOTIFY_PROBE_PLAYLIST_ID ?? '37i9dQZF1DXcBWIGoYBM5M';

let accessToken = '';

/**
 * Statuts acceptables pour un endpoint considéré comme disponible.
 *
 * 401 signifie « authentification utilisateur requise » : l'endpoint existe et
 * répond, il exige simplement un token utilisateur que ce test ne possède pas.
 * 403 en revanche signale un retrait d'accès — c'est le signal recherché.
 */
const AVAILABLE_STATUSES = [200, 401];

async function callSpotify(path: string): Promise<number> {
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return response.status;
}

describe.skipIf(!hasCredentials)('Contrat avec l’API Spotify', () => {
  beforeAll(async () => {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId ?? '',
        client_secret: clientSecret ?? '',
      }),
    });

    expect(response.status, 'Échec de l’obtention du token client').toBe(200);

    const token = (await response.json()) as { access_token: string };
    accessToken = token.access_token;
  });

  it('accepte les identifiants de l’application', () => {
    expect(accessToken).not.toBe('');
  });

  describe('endpoints utilisés par Overtify', () => {
    it('/search reste disponible', async () => {
      expect(AVAILABLE_STATUSES).toContain(
        await callSpotify('/search?q=test&type=track&limit=1'),
      );
    });

    it('/playlists/{id} reste disponible', async () => {
      expect(AVAILABLE_STATUSES).toContain(await callSpotify(`/playlists/${PROBE_PLAYLIST_ID}`));
    });

    /**
     * L'endpoint central du produit : sans lui, ni affichage des morceaux ni
     * dédoublonnage. Un échec ici signifie que Spotify l'a retiré à son tour.
     */
    it('/playlists/{id}/items reste disponible', async () => {
      const status = await callSpotify(`/playlists/${PROBE_PLAYLIST_ID}/items?limit=1`);

      expect(
        AVAILABLE_STATUSES,
        `/items a répondu ${status}. Si c'est 403 ou 404, Spotify a probablement ` +
          `remplacé cet endpoint : mettre à jour playlistItemsPath() dans config/spotify.ts.`,
      ).toContain(status);
    });
  });

  describe('endpoints retirés', () => {
    /**
     * Documente le retrait de `/tracks` (11 février 2026).
     *
     * Si ce test venait à échouer parce que l'endpoint refonctionne, ce serait
     * une information utile — mais rien n'obligerait à revenir en arrière.
     */
    it('/playlists/{id}/tracks est bien retiré', async () => {
      const status = await callSpotify(`/playlists/${PROBE_PLAYLIST_ID}/tracks?limit=1`);

      expect([403, 404]).toContain(status);
    });
  });
});
