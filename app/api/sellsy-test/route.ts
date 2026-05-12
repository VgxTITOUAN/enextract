import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  try {
    const token = await getSellsyToken();

    // Test 1 — récupérer un prospect avec tous ses champs
    const res1 = await fetch(
      'https://api.sellsy.com/v2/companies?limit=1&filters[type]=prospect',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data1 = await res1.json();

    // Récupérer l'ID du premier prospect
    const firstId = data1?.data?.[0]?.id;

    // Test 2 — récupérer ce prospect en détail avec ses champs custom
    let detail = null;
    if (firstId) {
      const res2 = await fetch(
        `https://api.sellsy.com/v2/companies/${firstId}?embed[]=custom_fields&embed[]=address`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      detail = await res2.json();
    }

    return NextResponse.json({
      success:    true,
      token_ok:   true,
      first_prospect: data1?.data?.[0] ?? null,
      detail,
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}