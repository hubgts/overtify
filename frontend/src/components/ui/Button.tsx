import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

/**
 * Bouton de base.
 *
 * `primary` utilise la couleur d'accent du thème : changer `--color-accent`
 * dans styles/theme.css suffit à repeindre toute l'application.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-contrast hover:bg-accent-hover hover:scale-[1.02] font-bold',
  secondary:
    'bg-surface-active text-content-primary hover:bg-[#3a3a3a] font-semibold',
  ghost:
    'bg-transparent text-content-secondary hover:text-content-primary hover:bg-surface-hover',
  danger: 'bg-danger text-white hover:brightness-110 font-semibold',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
