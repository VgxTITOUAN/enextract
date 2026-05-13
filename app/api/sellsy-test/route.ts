import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  try {
    const token = await getSellsyToken();

    // Total prospects non archivés
    const res1 = await fetch(
      'https://api.sellsy.com/v2/companies/search?limit=1',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: { type: 'prospect', is_archived: false } }),
      }
    );
    const data1 = await res1.json();
    const totalProspects = data1?.pagination?.total;

    // Total prospects archivés
    const res2 = await fetch(
      'https://api.sellsy.com/v2/companies/search?limit=1',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: { type: 'prospect', is_archived: true } }),
      }
    );
    const data2 = await res2.json();
    const totalArchives = data2?.pagination?.total;

    // Récupérer 5 prospects et voir leur datemailling
    const res3 = await fetch(
      'https://api.sellsy.com/v2/companies/search?limit=5',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: { type: 'prospect', is_archived: false } }),
      }
    );
    const data3 = await res3.json();
    const prospects = data3?.data ?? [];

    // Récupérer les custom fields des 5 premiers
    const sample = await Promise.all(
      prospects.map(async (p: any) => {
        const res = await fetch(
          `https://api.sellsy.com/v2/companies/${p.id}/custom-fields`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const cf = res.ok ? await res.json() : {};
        const fields: any = {};
        for (const f of cf.data ?? []) fields[f.code] = f.value;
        return {
          id:               p.id,
          name:             p.name,
          datemailling:     fields['datemailling']     ?? null,
          datecommandendd:  fields['datecommandendd']  ?? null,
          date_fin_contrat: fields['date-fin-contrat'] ?? null,
        };
      })
    );

    return NextResponse.json({
      total_prospects_non_archives: totalProspects,
      total_prospects_archives:     totalArchives,
      limite_2ans:                  new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      sample_5_prospects:           sample,
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
