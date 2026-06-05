import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';
import { syncSellsyCache } from '@/lib/sellsy-sync';

export async function GET() {
  try {
    const [rows]: any = await pool.execute(
      `SELECT COUNT(*) as total, MAX(synced_at) as last_sync FROM sellsy_cache`
    );
    const total = rows[0]?.total ?? 0;
    const last_sync = rows[0]?.last_sync ?? null;
    return NextResponse.json({
      total,
      last_sync,
      is_empty: total === 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('enextract_token')?.value;
    if (!token) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Accès refusé — admin uniquement.' }, { status: 403 });
    }

    const totalInserted = await syncSellsyCache();
    return NextResponse.json({ success: true, totalInserted });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
