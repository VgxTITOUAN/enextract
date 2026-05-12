import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-10 max-w-sm w-full text-center">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold mx-auto mb-4"
          style={{ backgroundColor: '#6bb100' }}
        >
          E
        </div>
        <h1 className="text-4xl font-bold text-gray-800 mb-2">404</h1>
        <p className="text-gray-400 text-sm mb-6">
          Cette page n'existe pas ou vous n'avez pas les droits pour y accéder.
        </p>
        <Link
          href="/extraction"
          className="inline-block px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors"
          style={{ backgroundColor: '#6bb100' }}
        >
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
