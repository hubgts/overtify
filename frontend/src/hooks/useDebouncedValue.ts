import { useEffect, useState } from 'react';

/**
 * Retarde la propagation d'une valeur qui change rapidement.
 *
 * Utilisé pour la recherche : sans cela, chaque frappe déclencherait un appel
 * à l'API Spotify et le quota serait vite atteint.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delayMs);

    return () => clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
}
