import { Button } from '../ui/Button';
import type { UserDto } from '../../types/api';

interface TopBarProps {
  user: UserDto;
  onLogout: () => void;
  isLoggingOut: boolean;
}

/** Barre supérieure : identité de l'utilisateur connecté et déconnexion. */
export function TopBar({ user, onLogout, isLoggingOut }: TopBarProps) {
  return (
    <header className="flex items-center justify-end gap-3 px-6 py-4">
      <div className="flex items-center gap-2 rounded-pill bg-black/40 py-1 pl-1 pr-3">
        <UserAvatar user={user} />
        <span className="text-sm font-medium">{user.displayName}</span>
      </div>

      <Button variant="ghost" size="sm" onClick={onLogout} disabled={isLoggingOut}>
        {isLoggingOut ? 'Déconnexion…' : 'Se déconnecter'}
      </Button>
    </header>
  );
}

function UserAvatar({ user }: { user: UserDto }) {
  if (user.avatarUrl === null) {
    return (
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-contrast"
      >
        {user.displayName.charAt(0).toUpperCase()}
      </span>
    );
  }

  return <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />;
}
