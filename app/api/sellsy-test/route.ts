import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

const TEST_PROSPECT_ID = '58262879';

export async function GET() {
  try {
    const token = await getSellsyToken();
    const today = new Date().toISOString().split('T')[0];

    // 1. Lire le prospect avant MàJ
    const res1 = await fetch(
      `https://api.sellsy.com/v2/companies/${TEST_PROSPECT_ID}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const before = await res1.json();

    // 2. Mettre à jour datemailling
    const res2 = await fetch(
      `https://api.sellsy.com/v2/companies/${TEST_PROSPECT_ID}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ datemailling: today }),
      }
    );

    // 3. Lire après MàJ pour confirmer
    const res3 = await fetch(
      `https://api.sellsy.com/v2/companies/${TEST_PROSPECT_ID}&embed[]=cf.32239`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const after = await res3.json();

    return NextResponse.json({
      prospect_id:        TEST_PROSPECT_ID,
      prospect_name:      before.name,
      update_status:      res2.status,
      update_ok:          res2.ok,
      new_date:           today,
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
