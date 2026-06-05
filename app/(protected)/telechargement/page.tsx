import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import Topbar from '@/components/Topbar';
import pool from '@/lib/db';
import TelechargementClient from '@/components/TelechargementClient';

export default async function TelechargementPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('enextract_token')?.value;
  if (!token) redirect('/login');
  const user = verifyToken(token);
  if (!user) redirect('/login');

  // Récupération des extractions
  const isAdmin = user.role === 'admin';
  const [rows]: any = await pool.execute(
    isAdmin
      ? `SELECT e.id, e.type, e.date_lancement, e.nb_demande, e.nb_sortie,
                e.nb_maj_sellsy, e.chemin_fichier, e.status, e.created_at,
                u.name AS user_name
         FROM extractions e
         JOIN users u ON u.id = e.user_id
         ORDER BY e.created_at DESC`
      : `SELECT e.id, e.type, e.date_lancement, e.nb_demande, e.nb_sortie,
                e.nb_maj_sellsy, e.chemin_fichier, e.status, e.created_at,
                u.name AS user_name
         FROM extractions e
         JOIN users u ON u.id = e.user_id
         WHERE e.user_id = ?
         ORDER BY e.created_at DESC`,
    isAdmin ? [] : [user.id]
  );

  // Prochaine extraction planifiée
  const [planned]: any = await pool.execute(
    `SELECT s.date_lancement, s.nb_prospects, u.name AS user_name
     FROM schedules s
     JOIN users u ON u.id = s.user_id
     WHERE s.actif = 1 AND s.date_lancement > NOW()
     ORDER BY s.date_lancement ASC
     LIMIT 1`
  );

  return (
    <>
      <Topbar title="Téléchargement" userName={user.name} />
      <main className="p-6">
        <TelechargementClient
          extractions={rows}
          prochaine={planned[0] ?? null}
          isAdmin={isAdmin}
        />
      </main>
    </>
  );
}