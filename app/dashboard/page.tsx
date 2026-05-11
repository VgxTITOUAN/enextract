import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('enextract_token')?.value;

  if (!token) redirect('/login');

  const user = verifyToken(token);
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4" style={{backgroundColor: '#6bb100'}}>
          <span className="text-white text-xl font-bold">E</span>
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-1">Bienvenue, {user.name} !</h1>
        <p className="text-sm text-gray-400 mb-4">Rôle : {user.role}</p>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}