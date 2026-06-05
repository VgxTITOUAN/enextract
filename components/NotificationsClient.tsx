'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Notification = {
  id: number;
  message: string;
  type: string;
  lien_redirection: string | null;
  lu: number;
  date_envoi: string;
};

const typeIcon: Record<string, string> = {
  success: '✅',
  error:   '❌',
  info:    'ℹ️',
  warning: '⚠️',
};

function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function NotificationsClient() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchNotifications() {
    const res = await fetch('/api/notifications');
    const data = await res.json();
    if (res.ok) setNotifications(data.notifications ?? []);
  }

  async function markAllRead() {
    await fetch('/api/notifications/read', { method: 'PATCH' });
    setNotifications(prev => prev.map(n => ({ ...n, lu: 1 })));
  }

  useEffect(() => {
    (async () => {
      await fetchNotifications();
      await fetch('/api/notifications/read', { method: 'PATCH' });
      setNotifications(prev => prev.map(n => ({ ...n, lu: 1 })));
      setLoading(false);
    })();
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Vos notifications</p>
        <button
          onClick={markAllRead}
          className="text-xs font-semibold text-[#4a7c00] hover:underline"
        >
          Tout marquer comme lu
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          Aucune notification pour le moment.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {notifications.map(n => {
            const content = (
              <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <span className="text-lg leading-none mt-0.5">{typeIcon[n.type] ?? 'ℹ️'}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.lu ? 'text-gray-600' : 'text-gray-800 font-medium'}`}>
                    {n.message}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{relativeDate(n.date_envoi)}</p>
                </div>
                {!n.lu && (
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-2" />
                )}
              </div>
            );

            return (
              <li key={n.id}>
                {n.lien_redirection
                  ? <Link href={n.lien_redirection}>{content}</Link>
                  : content
                }
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
