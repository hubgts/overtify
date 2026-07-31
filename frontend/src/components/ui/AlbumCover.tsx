interface AlbumCoverProps {
  imageUrl: string | null;
  /** Taille d'affichage, alignée sur les classes Tailwind correspondantes. */
  size?: 'sm' | 'md';
}

/**
 * Pochette d'album, avec repli sur une icône quand Spotify n'en fournit pas.
 *
 * Factorisé parce que le même ternaire — image ou note de musique, mêmes
 * classes — était recopié dans cinq composants.
 */
export function AlbumCover({ imageUrl, size = 'md' }: AlbumCoverProps) {
  const dimension = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';

  if (imageUrl === null) {
    return (
      <span
        aria-hidden="true"
        className={`flex ${dimension} shrink-0 items-center justify-center rounded bg-surface-active text-content-muted`}
      >
        ♪
      </span>
    );
  }

  return (
    <img src={imageUrl} alt="" loading="lazy" className={`${dimension} shrink-0 rounded`} />
  );
}
