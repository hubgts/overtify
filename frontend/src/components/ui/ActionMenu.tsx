import { useEffect, useRef, useState } from 'react';

export interface MenuAction {
  label: string;
  onSelect: () => void;
  /** Met l'entrée en rouge pour les actions destructrices. */
  isDangerous?: boolean;
}

interface ActionMenuProps {
  actions: MenuAction[];
  /** Libellé lu par les lecteurs d'écran, le bouton n'affichant qu'une icône. */
  label: string;
}

/**
 * Menu d'actions contextuel, ouvert par un bouton « … ».
 *
 * Ferme au clic extérieur, à l'Échap et après sélection — sans quoi un menu
 * resté ouvert masquerait le contenu voisin.
 */
export function ActionMenu({ actions, label }: ActionMenuProps) {
  const [isOpen, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          // Sans cela, le clic atteindrait la playlist sous le menu.
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="rounded-full px-1.5 py-1 text-content-secondary transition-colors hover:bg-surface-active hover:text-content-primary"
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-44 overflow-hidden rounded-card bg-surface-overlay py-1 shadow-2xl animate-fade-in"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                action.onSelect();
              }}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover ${
                action.isDangerous === true ? 'text-danger' : 'text-content-primary'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
