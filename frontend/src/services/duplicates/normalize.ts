/**
 * Normalisation de texte pour la détection de doublons « probables ».
 *
 * Objectif : rapprocher deux libellés qui désignent le même morceau alors que
 * Spotify les distingue, par exemple
 *   « Bohemian Rhapsody - Remastered 2011 »
 *   « Bohemian Rhapsody (Live at Wembley) »   ← à NE PAS confondre
 *   « Bohemian Rhapsody »
 *
 * Le compromis est assumé : on retire les mentions purement éditoriales
 * (remaster, édition, radio edit…) mais on conserve celles qui changent
 * réellement l'enregistrement (live, acoustic, remix). Retirer « live »
 * fusionnerait un titre studio et sa version concert, ce qui serait un
 * faux positif bien plus gênant qu'un doublon manqué.
 *
 * Toutes les fonctions de ce module sont pures et testées unitairement
 * (cf. normalize.test.ts).
 */

/**
 * Suffixes éditoriaux à retirer, testés sur le contenu d'une parenthèse,
 * d'un crochet ou d'un segment après tiret.
 *
 * Ajouter une règle = ajouter une entrée ici. Volontairement déclaratif pour
 * rester lisible et modifiable sans toucher à l'algorithme.
 */
const EDITORIAL_MARKERS: readonly RegExp[] = [
  /^remaster(ed)?(\s+\d{4})?$/,
  /^\d{4}\s+remaster(ed)?( version)?$/,
  /^remaster(ed)?\s+version(\s+\d{4})?$/,
  /^(digital\s+)?remaster(ed)?.*$/,
  /^radio\s+edit$/,
  /^single\s+version$/,
  /^album\s+version$/,
  /^original\s+(mix|version)$/,
  /^(deluxe|expanded|special|anniversary|bonus)(\s+\w+)*\s*(edition|version)?$/,
  /^explicit(\s+version)?$/,
  /^clean(\s+version)?$/,
  /^mono(\s+version)?$/,
  /^stereo(\s+version)?$/,
  /^\d{4}\s+version$/,
  /^from\s+.*soundtrack.*$/,
  /^bonus\s+track$/,
];

/**
 * Mentions de featuring, retirées du titre.
 *
 * Deux entrées du même morceau peuvent noter le featuring différemment
 * (« feat. X », « ft X », rien du tout) alors qu'il s'agit du même
 * enregistrement ; l'artiste principal reste comparé séparément.
 */
const FEATURING_PATTERN = /\s*[([]?\s*\b(feat|ft|featuring|with)\b\.?\s+[^)\]]*[)\]]?/gi;

/** Segments entre parenthèses ou crochets, capturés avec leur contenu. */
const BRACKETED_SEGMENT_PATTERN = /\s*[([]([^)\]]*)[)\]]/g;

/** Segment introduit par un tiret entouré d'espaces : « Titre - Radio Edit ». */
const DASH_SUFFIX_PATTERN = /\s+[-–—]\s+(.+)$/;

function isEditorialMarker(segment: string): boolean {
  const candidate = segment.trim().toLowerCase();
  return EDITORIAL_MARKERS.some((pattern) => pattern.test(candidate));
}

/** Minuscules + suppression des diacritiques (« Björk » → « bjork »). */
export function toComparableCase(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');
}

/** Retire ponctuation et symboles, puis réduit les espaces. */
function stripPunctuation(value: string): string {
  return value
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalise un titre de morceau.
 *
 * Pipeline, dans cet ordre :
 *  1. mise en minuscules et suppression des accents ;
 *  2. suppression des mentions de featuring ;
 *  3. suppression des segments parenthésés purement éditoriaux ;
 *  4. suppression d'un suffixe éditorial après tiret ;
 *  5. suppression de la ponctuation et normalisation des espaces.
 */
export function normalizeTitle(rawTitle: string): string {
  const lowered = toComparableCase(rawTitle);
  const withoutFeaturing = lowered.replace(FEATURING_PATTERN, ' ');

  const withoutEditorialBrackets = withoutFeaturing.replace(
    BRACKETED_SEGMENT_PATTERN,
    (match, inner: string) => (isEditorialMarker(inner) ? ' ' : match),
  );

  const dashMatch = DASH_SUFFIX_PATTERN.exec(withoutEditorialBrackets);
  const withoutEditorialDash =
    dashMatch?.[1] !== undefined && isEditorialMarker(dashMatch[1])
      ? withoutEditorialBrackets.replace(DASH_SUFFIX_PATTERN, '')
      : withoutEditorialBrackets;

  return stripPunctuation(withoutEditorialDash);
}

/** Normalise un nom d'artiste (pas de suffixe éditorial à retirer ici). */
export function normalizeArtist(rawArtist: string): string {
  return stripPunctuation(toComparableCase(rawArtist));
}

/**
 * Clé de rapprochement d'un morceau : titre normalisé + artiste principal.
 *
 * Seul le premier artiste est retenu, car les artistes secondaires varient
 * fortement d'une édition à l'autre du même titre.
 */
export function buildMatchKey(title: string, artists: readonly string[]): string {
  const primaryArtist = artists[0] ?? '';
  return `${normalizeTitle(title)}::${normalizeArtist(primaryArtist)}`;
}
