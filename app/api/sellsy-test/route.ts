import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  try {
    const token = await getSellsyToken();

    // Récupérer le premier prospect avec ses champs custom
    const res = await fetch(
      `https://api.sellsy.com/v2/companies?limit=1&type=prospect&embed[]=custom_fields`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const data = res.ok ? await res.json() : await res.text();

    return NextResponse.json({ success: true, token_ok: true, status: res.status, data });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}