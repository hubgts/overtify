/**
 * Point d'accès unique au `fetch` utilisé par l'application.
 *
 * Motif : le `fetch` global de Node embarque sa propre copie d'undici, que
 * `setGlobalDispatcher` du paquet `undici` n'affecte pas. Passer par cette
 * indirection permet aux tests de bout en bout de substituer une
 * implémentation simulée, sans imposer undici au code de production ni
 * transformer la signature des services.
 */

export type FetchLike = typeof globalThis.fetch;

let currentFetch: FetchLike = globalThis.fetch.bind(globalThis);

/** Le `fetch` courant. Toujours l'appeler via cette fonction, jamais en direct. */
export function httpFetch(...args: Parameters<FetchLike>): ReturnType<FetchLike> {
  return currentFetch(...args);
}

/** Remplace l'implémentation. Réservé aux tests. */
export function setFetchImplementation(implementation: FetchLike): void {
  currentFetch = implementation;
}

/** Rétablit le `fetch` natif. */
export function resetFetchImplementation(): void {
  currentFetch = globalThis.fetch.bind(globalThis);
}
