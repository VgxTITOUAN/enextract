'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-10 max-w-sm w-full text-center">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold mx-auto mb-4"
          style={{ backgroundColor: '#e03131' }}
        >
          !
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Une erreur est survenue</h1>
        <p className="text-gray-400 text-sm mb-6">
          Une erreur inattendue s'est produite. Si le problème persiste, contactez l'administrateur.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg"
            style={{ backgroundColor: '#6bb100' }}
          >
            Réessayer
          </button>
          <Link
            href="/extraction"
            className="px-4 py-2 text-sm font-semibold text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
