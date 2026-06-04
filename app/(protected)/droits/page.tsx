import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import Topbar from '@/components/Topbar';
import pool from '@/lib/db';
import DroitsClient from '@/components/DroitsClient';

export default async function DroitsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('enextract_token')?.value;
  if (!token) redirect('/login');
  const user = verifyToken(token);
  if (!user) redirect('/login');

  // Seul l'admin accède à cette page
  if (user.role !== 'admin') redirect('/extraction');

  const [users]: any = await pool.execute(
    `SELECT id, email, name, role, active, derniere_connexion, created_at
     FROM users
     WHERE deleted_at IS NULL
     ORDER BY role DESC, name ASC`
  );

  return (
    <>
      <Topbar title="Droits d'accès" userName={user.name} />
      <main className="p-6">
        <DroitsClient users={users} currentUserId={user.id} currentUserRole={user.role} />
      </main>
    </>
  );
}