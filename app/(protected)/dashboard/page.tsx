import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import Topbar from '@/components/Topbar';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('enextract_token')?.value;
  if (!token) redirect('/login');
  const user = verifyToken(token);
  if (!user) redirect('/login');

  return (
    <>
      <Topbar title="Extraction de prospects" userName={user.name} />
      <main className="p-6">
        <p className="text-gray-500 text-sm">Bienvenue, {user.name}.</p>
      </main>
    </>
  );
}