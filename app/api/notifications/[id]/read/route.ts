import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('enextract_token')?.value;
    if (!token) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const { id: idParam } = await params;
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID invalide.' }, { status: 400 });
    }

    const [result]: any = await pool.execute(
      `UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?`,
      [id, user.id],
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: 'Notification introuvable.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/notifications/[id]/read:', error);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
