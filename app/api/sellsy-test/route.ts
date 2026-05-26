import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  try {
    const token = await getSellsyToken();

    // 1. Trouver le prospect "test rémi 2"
    const res1 = await fetch(
      'https://api.sellsy.com/v2/companies/search?limit=5',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: { type: 'prospect', is_archived: false },
          search: 'test rémi 2',
        }),
      }
    );
    const data1 = await res1.json();
    const prospect = data1?.data?.[0];
    if (!prospect) return NextResponse.json({ error: 'Prospect non trouvé' });

    // 2. Lire le datemailling actuel
    const today = new Date().toISOString().split('T')[0];

    // 3. Mettre à jour datemailling
    const res2 = await fetch(
      `https://api.sellsy.com/v2/companies/${prospect.id}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ datemailling: today }),
      }
    );

    return NextResponse.json({
      prospect_id:   prospect.id,
      prospect_name: prospect.name,
      update_status: res2.status,
      update_ok:     res2.ok,
      new_date:      today,
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
