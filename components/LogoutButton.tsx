'use client';

export default function LogoutButton() {
  return (
    <button
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
      }}
      className="text-xs text-red-400 hover:text-red-600 transition-colors"
    >
      Déconnexion →
    </button>
  );
}