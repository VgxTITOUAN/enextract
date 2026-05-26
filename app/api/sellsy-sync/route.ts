import { NextResponse } from 'next/server';
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
    await syncSellsyCache();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
