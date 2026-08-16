import { useState } from 'react';

import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { InlineError } from '../ui/ErrorState';

export interface PlaylistFormValues {
  name: string;
  description: string;
}

interface PlaylistFormModalProps {
  onClose: () => void;
  /** Valeurs de départ : vides pour une création, remplies pour une édition. */
  initialValues: PlaylistFormValues;
  onSubmit: (values: PlaylistFormValues) => void;
  isPending: boolean;
  error: unknown;
  /** Libellé du bouton de validation, qui dit l'action plutôt que « OK ». */
  submitLabel: string;
  title: string;
  description: string;
}

/**
 * Formulaire de création et d'édition de playlist.
 *
 * Un seul composant pour les deux usages : ils partagent les mêmes champs et
 * les mêmes contraintes, seuls les libellés et les valeurs initiales diffèrent.
 *
 * Monté seulement pendant qu'il est ouvert : la saisie disparaît donc avec lui,
 * là où un composant toujours monté demanderait de la réinitialiser à la main
 * — source classique de formulaire rouvert sur les valeurs du précédent.
 */
export function PlaylistFormModal({
  onClose,
  initialValues,
  onSubmit,
  isPending,
  error,
  submitLabel,
  title,
  description,
}: PlaylistFormModalProps) {
  const [name, setName] = useState(initialValues.name);
  const [descriptionValue, setDescriptionValue] = useState(initialValues.description);

  const trimmedName = name.trim();
  const canSubmit = trimmedName !== '' && !isPending;

  const handleSubmit = (): void => {
    if (canSubmit) {
      onSubmit({ name: trimmedName, description: descriptionValue.trim() });
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isPending ? 'Enregistrement…' : submitLabel}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        {error !== null && error !== undefined && <InlineError error={error} />}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="playlist-name" className="text-xs font-semibold text-content-secondary">
            Nom
          </label>
          <input
            id="playlist-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            autoFocus
            placeholder="Ma nouvelle playlist"
            className="rounded-md bg-surface-hover px-3 py-2 text-sm text-content-primary placeholder:text-content-muted"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="playlist-description"
            className="text-xs font-semibold text-content-secondary"
          >
            Description <span className="font-normal text-content-muted">(facultatif)</span>
          </label>
          <textarea
            id="playlist-description"
            value={descriptionValue}
            onChange={(event) => setDescriptionValue(event.target.value)}
            maxLength={300}
            rows={3}
            placeholder="À quoi sert cette playlist ?"
            className="resize-none rounded-md bg-surface-hover px-3 py-2 text-sm text-content-primary placeholder:text-content-muted"
          />
        </div>

        <p className="text-xs text-content-muted">
          La playlist est créée en privé. Vous pouvez la rendre publique depuis
          Spotify.
        </p>

        {/* Permet la validation par Entrée sans bouton visible en double. */}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
