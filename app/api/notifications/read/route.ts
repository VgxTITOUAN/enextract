import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';

export async function PATCH() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('enextract_token')?.value;
    if (!token) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    await pool.execute(
      `UPDATE notifications SET lu = 1 WHERE user_id = ? AND lu = 0`,
      [user.id],
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/notifications/read:', error);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
