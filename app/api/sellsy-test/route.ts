import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  try {
    const token = await getSellsyToken();

    // Test 1 — récupérer un prospect (POST search)
    const res1 = await fetch(
      'https://api.sellsy.com/v2/companies/search?limit=1',
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: { type: 'prospect' }
        }),
      }
    );
    const data1 = await res1.json();
    const firstId = data1?.data?.[0]?.id;

    // Test 2 — détail sans embed d'abord
    let detail = null;
    if (firstId) {
      const res2 = await fetch(
        `https://api.sellsy.com/v2/companies/${firstId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      detail = await res2.json();
    }

    // Test 3 — custom fields séparément
    let customFields = null;
    if (firstId) {
      const res3 = await fetch(
        `https://api.sellsy.com/v2/companies/${firstId}/custom-fields`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      customFields = res3.ok ? await res3.json() : `${res3.status} — ${await res3.text()}`;
    }

    return NextResponse.json({
      success:      true,
      first_prospect: data1?.data?.[0] ?? null,
      detail,
      customFields,
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}