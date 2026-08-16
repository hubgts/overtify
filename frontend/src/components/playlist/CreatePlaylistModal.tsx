import { useCreatePlaylist } from '../../hooks/usePlaylists';
import { PlaylistFormModal } from './PlaylistFormModal';
import type { PlaylistSummaryDto } from '../../types/api';

interface CreatePlaylistModalProps {
  onClose: () => void;
  /** Sous-titre : ce que la création va déclencher à cet endroit précis. */
  description: string;
  /** Suite donnée à la création — ouvrir la playlist, la cocher, etc. */
  onCreated: (created: PlaylistSummaryDto) => void;
}

/**
 * Création d'une playlist, depuis n'importe quel écran.
 *
 * Porte la mutation et la mise en forme du corps de requête, là où
 * `PlaylistFormModal` ne porte que le formulaire : les appelants (barre
 * latérale, écran de qualification) n'ont plus qu'à dire ce qu'ils font de la
 * playlist créée. Sans cela, chaque nouvel appelant recopie le même
 * enchaînement — et une variante finit par diverger.
 */
export function CreatePlaylistModal({
  onClose,
  description,
  onCreated,
}: CreatePlaylistModalProps) {
  const createPlaylist = useCreatePlaylist();

  return (
    <PlaylistFormModal
      onClose={onClose}
      initialValues={{ name: '', description: '' }}
      title="Nouvelle playlist"
      description={description}
      submitLabel="Créer"
      isPending={createPlaylist.isPending}
      error={createPlaylist.error}
      onSubmit={(values) => {
        createPlaylist.mutate(
          {
            name: values.name,
            // Description vide : champ omis plutôt qu'envoyé vide, l'API le
            // déclarant facultatif.
            ...(values.description === '' ? {} : { description: values.description }),
          },
          {
            onSuccess: (created) => {
              onClose();
              onCreated(created);
            },
          },
        );
      }}
    />
  );
}
