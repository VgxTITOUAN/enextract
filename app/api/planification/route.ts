import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('enextract_token')?.value;
    if (!token) return NextResponse.json({ success: false, error: 'Non autorisé.' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ success: false, error: 'Non autorisé.' }, { status: 401 });

    const { action, id, nb } = await req.json();

    // Vérifier que le schedule existe
    const [rows]: any = await pool.execute(
      'SELECT * FROM schedules WHERE id = ?', [id]
    );

    if (!rows.length) {
      return NextResponse.json({ success: false, error: 'Planification introuvable.' }, { status: 404 });
    }

    const schedule = rows[0];

    // Vérifier les droits
    if (user.role !== 'admin' && schedule.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Accès refusé.' }, { status: 403 });
    }

    // ── Toggle actif ──
    if (action === 'toggle') {
      await pool.execute('UPDATE schedules SET actif = 1 - actif WHERE id = ?', [id]);
      const [updated]: any = await pool.execute('SELECT actif FROM schedules WHERE id = ?', [id]);
      return NextResponse.json({ success: true, actif: updated[0].actif === 1 });
    }

    // ── Supprimer ──
    if (action === 'delete') {
      await pool.execute('DELETE FROM schedules WHERE id = ?', [id]);
      return NextResponse.json({ success: true });
    }

    // ── Mettre à jour nb_prospects ──
    if (action === 'update_nb') {
      if (!nb || nb < 1 || nb > 500) {
        return NextResponse.json({ success: false, error: 'Nb invalide.' }, { status: 400 });
      }
      await pool.execute('UPDATE schedules SET nb_prospects = ? WHERE id = ?', [nb, id]);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Action inconnue.' }, { status: 400 });

  } catch (error: any) {
    console.error('Planification error:', error);
    return NextResponse.json({ success: false, error: 'Erreur serveur.' }, { status: 500 });
  }
}