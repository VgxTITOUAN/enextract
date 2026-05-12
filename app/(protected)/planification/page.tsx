import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import Topbar from '@/components/Topbar';
import pool from '@/lib/db';
import PlanificationClient from '@/components/PlanificationClient';

export default async function PlanificationPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('enextract_token')?.value;
  if (!token) redirect('/login');
  const user = verifyToken(token);
  if (!user) redirect('/login');

  // Récurrences actives
  const [recurrentes]: any = await pool.execute(
    `SELECT s.*, u.name AS user_name
     FROM schedules s
     JOIN users u ON u.id = s.user_id
     WHERE s.type = 'recurrente'
     ORDER BY s.created_at DESC`
  );

  // Planifiées à venir
  const [planifiees]: any = await pool.execute(
    `SELECT s.*, u.name AS user_name
     FROM schedules s
     JOIN users u ON u.id = s.user_id
     WHERE s.type = 'planifiee' AND s.date_lancement > NOW()
     ORDER BY s.date_lancement ASC`
  );

  return (
    <>
      <Topbar title="Planification" userName={user.name} />
      <main className="p-6">
        <PlanificationClient
          recurrentes={recurrentes}
          planifiees={planifiees}
          currentUserId={user.id}
          isAdmin={user.role === 'admin'}
        />
      </main>
    </>
  );
}