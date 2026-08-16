import { formatTrackCount } from '../../services/format';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { InlineError } from '../ui/ErrorState';
import type { PlaylistSummaryDto } from '../../types/api';

interface RemovePlaylistModalProps {
  /** Playlist à retirer, ou null quand la modale est fermée. */
  playlist: PlaylistSummaryDto | null;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  error: unknown;
}

/**
 * Confirmation avant retrait d'une playlist.
 *
 * Le vocabulaire est « retirer », pas « supprimer » : Spotify n'offre aucune
 * suppression réelle, on se désabonne de sa propre playlist. Elle disparaît de
 * la bibliothèque, mais son contenu est intact et un clic suffit à la
 * restaurer.
 *
 * Annoncer une « suppression définitive » serait faux, et pourrait dissuader
 * l'utilisateur d'une action en réalité anodine.
 */
export function RemovePlaylistModal({
  playlist,
  onClose,
  onConfirm,
  isPending,
  error,
}: RemovePlaylistModalProps) {
  if (playlist === null) {
    return null;
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Retirer cette playlist ?"
      description={playlist.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Retrait…' : 'Retirer'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-content-secondary">
        <p>
          <strong className="text-content-primary">{playlist.name}</strong> et ses{' '}
          {formatTrackCount(playlist.trackCount)} disparaîtront de votre
          bibliothèque.
        </p>

        <p className="rounded-md bg-surface-raised px-3 py-2">
          <strong className="text-content-primary">Rien n'est supprimé.</strong>{' '}
          Spotify ne permet pas de supprimer une playlist : elle est simplement
          retirée de votre bibliothèque. Vous la retrouverez dans « Playlists
          retirées », d'où un clic suffit à la restaurer avec tous ses morceaux.
        </p>

        {error !== null && error !== undefined && <InlineError error={error} />}
      </div>
    </Modal>
  );
}
