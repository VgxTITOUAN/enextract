'use client';

import { useRouter } from 'next/navigation';

interface ErrorDisplayProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorDisplay({ error, reset }: ErrorDisplayProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-10 max-w-md w-full text-center">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mx-auto mb-4"
          style={{ backgroundColor: '#f0f9e8' }}
        >
          ⚠️
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-3">Une erreur est survenue</h1>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          La page n&apos;a pas pu se charger correctement.
          <br />
          Si le problème persiste, contactez Rémi à{' '}
          <a href="mailto:remi@eness.fr" className="text-[#4a7c00] hover:underline">
            remi@eness.fr
          </a>
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors hover:opacity-90"
            style={{ backgroundColor: '#6bb100' }}
          >
            Réessayer
          </button>
          <button
            onClick={() => router.push('/extraction')}
            className="px-4 py-2 text-sm font-semibold text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Retour à l&apos;accueil
          </button>
        </div>
        {error.message && (
          <div className="mt-8 pt-4 border-t border-gray-100 text-left">
            <p className="text-xs text-gray-400 mb-1">Détail technique :</p>
            <p className="text-xs text-gray-300 break-all">
              {error.message}
              {error.digest && ` (${error.digest})`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
