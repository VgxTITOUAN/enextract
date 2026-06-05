import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('enextract_token')?.value;
    if (!token) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const [notifications]: any = await pool.execute(
      `SELECT id, message, type, lien_redirection, lu, date_envoi
       FROM notifications
       WHERE user_id = ?
       ORDER BY date_envoi DESC
       LIMIT 50`,
      [user.id],
    );

    const [countRows]: any = await pool.execute(
      `SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND lu = 0`,
      [user.id],
    );

    return NextResponse.json({
      notifications,
      unreadCount: countRows[0]?.unread ?? 0,
    });
  } catch (error: any) {
    console.error('GET /api/notifications:', error);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
