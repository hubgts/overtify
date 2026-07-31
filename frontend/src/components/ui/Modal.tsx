import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Modale large pour les contenus denses (listes de doublons). */
  size?: 'md' | 'lg';
}

/**
 * Modale accessible, rendue dans un portail.
 *
 * Prend en charge la fermeture par Échap et par clic sur l'arrière-plan, le
 * verrouillage du défilement de la page, et le déplacement du focus à
 * l'ouverture — sans quoi un utilisateur au clavier resterait bloqué derrière
 * la modale.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    dialogRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        // Empêche la propagation : un clic dans la modale ne la ferme pas.
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-[85vh] w-full flex-col overflow-hidden rounded-card bg-surface-overlay shadow-2xl animate-slide-up ${
          size === 'lg' ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <header className="border-b border-white/10 px-6 py-5">
          <h2 id="modal-title" className="text-xl font-bold text-content-primary">
            {title}
          </h2>
          {description !== undefined && (
            <p className="mt-1 text-sm text-content-secondary">{description}</p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {footer !== undefined && (
          <footer className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
